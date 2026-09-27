import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { MentorConfig } from './config';
import type { Logger } from './logger';
import { MentorError, type Mentor } from './mentor';
import { mentorRequestSchema, type ErrorReply, type HealthReply } from './protocol';
import type { UsageStore } from './usage';

export interface AppDependencies {
  models: MentorConfig['models'];
  usage: UsageStore;
  /**
   * Null when no API key is configured. The routes never see the key itself, only whether
   * a mentor exists, so there's no code path here that could leak or log it.
   */
  mentor: Mentor | null;
  logger: Logger;
}

// Every field at its zod max length is about 20 KB of plain-text JSON. 32 KB leaves room
// for escaping and accents while still stopping a runaway paste before it reaches zod.
const MAX_BODY_BYTES = 32 * 1024;

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLoopbackUrl(url: string): boolean {
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(url).hostname);
  } catch {
    // Not a URL at all, like the Origin "null" a sandboxed page sends: not trusted.
    return false;
  }
}

/**
 * Drill requests are refused before validation, so even a malformed request that carries
 * a drill tag gets a clear "not during drills" answer instead of a validation error.
 */
export function isDrillTagged(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  if ('drillSessionId' in body) return true;
  return (
    'context' in body &&
    typeof body.context === 'object' &&
    body.context !== null &&
    'inDrill' in body.context &&
    body.context.inDrill === true
  );
}

function errorReply(error: string, offline?: true): ErrorReply {
  return offline ? { error, offline } : { error };
}

export function createApp({ models, usage, mentor, logger }: AppDependencies): Hono {
  const app = new Hono();

  // Only this computer may talk to Sage. The server already listens on 127.0.0.1, and this
  // also blocks DNS rebinding (a web page whose domain secretly points at 127.0.0.1) and
  // cross-site requests from pages open in other tabs.
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin');
    if (!isLoopbackUrl(c.req.url) || (origin !== undefined && !isLoopbackUrl(origin))) {
      return c.json(errorReply('Sage only answers requests from this computer.'), 403);
    }
    await next();
  });

  app.get('/api/health', (c) => {
    const today = usage.current();
    const reply: HealthReply = {
      ok: true,
      keyConfigured: mentor !== null,
      models,
      usage: { date: today.date, calls: today.calls, cap: usage.dailyCallCap },
    };
    return c.json(reply);
  });

  app.post(
    '/api/mentor',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json(errorReply('That request is too large for Sage.'), 413),
    }),
    async (c) => {
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json(errorReply('The request body must be JSON.'), 400);
      }

      if (isDrillTagged(body)) {
        return c.json(errorReply('Sage is off during No-AI Drills and placement tests.'), 403);
      }

      const parsed = mentorRequestSchema.safeParse(body);
      if (!parsed.success) {
        const problems = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
          .join('; ');
        return c.json(errorReply(`Invalid mentor request (${problems}).`), 400);
      }

      if (mentor === null) {
        return c.json(
          errorReply('Sage is offline: the mentor server has no ANTHROPIC_API_KEY.', true),
          503,
        );
      }

      if (!(await usage.tryReserveCall())) {
        const cap = String(usage.dailyCallCap);
        return c.json(
          errorReply(
            `Sage has answered ${cap} questions today, the daily limit. It resets at midnight. Pre-written hints still work.`,
          ),
          429,
        );
      }

      const request = parsed.data;
      try {
        const reply =
          request.mode === 'hint'
            ? await mentor.hint(request.context)
            : await mentor.gradeQuestion(request.context);
        const { calls } = usage.current();
        logger.info(
          `${request.mode} answered (${String(calls)}/${String(usage.dailyCallCap)} today)`,
        );
        return c.json(reply);
      } catch (error) {
        if (!(error instanceof MentorError)) throw error;
        // The cause carries the SDK's detail (status, API message). It never contains the key.
        const detail = error.cause instanceof Error ? ` (${error.cause.message})` : '';
        logger.warn(`${request.mode} failed: ${error.message}${detail}`);
        return c.json(errorReply(error.message), error.status);
      }
    },
  );

  app.notFound((c) => c.json(errorReply('Not found.'), 404));

  app.onError((error, c) => {
    logger.error(`Unexpected error: ${error.message}`);
    // Details stay in the server log. The browser gets a generic message.
    return c.json(errorReply('Sage hit an unexpected error.'), 500);
  });

  return app;
}
