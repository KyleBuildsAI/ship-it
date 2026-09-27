import type {
  GradeQuestionContext,
  GradeReply,
  HealthReply,
  HintContext,
  HintLevel,
  HintReply,
  MentorRequest,
} from '../../server/protocol';
import { devStatus } from '../game/devStatus';
import { activeDrillSession } from './drillGuard';

// Type-only imports: the server's zod schemas never end up in the game bundle.
export type { GradeQuestionContext, HintContext, HintLevel };

/** Why Sage can't answer. Every reason means the same thing to callers: use the fallback. */
export type OfflineReason =
  | 'no-server' // this build has no Sage server (GitHub Pages)
  | 'unreachable' // the server isn't running
  | 'timeout'
  | 'no-key' // the server runs but has no ANTHROPIC_API_KEY
  | 'daily-cap'
  | 'drill' // a No-AI Drill or placement test is running
  | 'error';

export interface MentorOffline {
  offline: true;
  reason: OfflineReason;
  /** Short and player-facing, safe to show in the HUD. */
  message: string;
}

/**
 * What getMentorStatus() found. offline: false only means the server answered. Whether
 * Sage can help right now depends on keyConfigured and usage, the same rule the dev badge
 * uses. askHint() and gradeQuestion() run that check themselves.
 */
export type MentorStatus = (HealthReply & { offline: false }) | MentorOffline;
export type HintResult = (HintReply & { offline: false }) | MentorOffline;
export type GradeResult = (GradeReply & { offline: false }) | MentorOffline;

export const MENTOR_TIMEOUT_MS = 20_000;

const MESSAGES: Record<OfflineReason, string> = {
  'no-server': 'Sage only runs with the local dev server. Pre-written hints still work.',
  unreachable: "Sage's server isn't running. Pre-written hints still work.",
  timeout: 'Sage took too long to answer. Pre-written hints still work.',
  'no-key': 'Sage is offline: no API key is set up. Pre-written hints still work.',
  'daily-cap': "Sage has hit today's limit. Pre-written hints still work.",
  drill: 'Sage is off during drills. This one is all you.',
  error: 'Sage had a problem answering. Pre-written hints still work.',
};

function offline(reason: OfflineReason, message?: string): MentorOffline {
  return { offline: true, reason, message: message ?? MESSAGES[reason] };
}

// Hand-written checks instead of zod, to keep the game bundle small. The server is ours,
// but a stale server or the dev proxy's fallback can still answer with a different shape.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHealthReply(value: unknown): value is HealthReply {
  if (!isRecord(value) || value.ok !== true || typeof value.keyConfigured !== 'boolean') {
    return false;
  }
  const { models, usage } = value;
  return (
    isRecord(models) &&
    typeof models.default === 'string' &&
    typeof models.interview === 'string' &&
    isRecord(usage) &&
    typeof usage.date === 'string' &&
    typeof usage.calls === 'number' &&
    typeof usage.cap === 'number'
  );
}

function isHintReply(value: unknown): value is HintReply {
  return (
    isRecord(value) &&
    (value.level === 1 || value.level === 2 || value.level === 3) &&
    typeof value.text === 'string' &&
    value.text !== ''
  );
}

function isGradeReply(value: unknown): value is GradeReply {
  return (
    isRecord(value) &&
    typeof value.score === 'number' &&
    Number.isInteger(value.score) &&
    value.score >= 0 &&
    value.score <= 3 &&
    typeof value.whyItMatters === 'string' &&
    typeof value.betterVersion === 'string'
  );
}

/** The server's own `{ error }` message, when it sent one. */
function serverMessage(body: unknown): string | undefined {
  return isRecord(body) && typeof body.error === 'string' ? body.error : undefined;
}

/** Both the server without a key (503) and the dev proxy without a server (200) send this. */
function isOfflineBody(body: unknown): boolean {
  return isRecord(body) && body.offline === true;
}

interface Received {
  status: number;
  body: unknown;
}

export interface MentorClientOptions {
  /**
   * Whether a Sage server can exist at all. False on the GitHub Pages build, so the client
   * never touches the network there: no failed requests, so no console errors.
   */
  serverExpected: boolean;
  timeoutMs?: number;
}

export interface MentorClient {
  getMentorStatus: () => Promise<MentorStatus>;
  askHint: (context: HintContext) => Promise<HintResult>;
  gradeQuestion: (context: GradeQuestionContext) => Promise<GradeResult>;
}

export function createMentorClient({
  serverExpected,
  timeoutMs = MENTOR_TIMEOUT_MS,
}: MentorClientOptions): MentorClient {
  /** Sends one request. Never throws: network trouble comes back as an offline result. */
  async function send(path: string, init: RequestInit = {}): Promise<Received | MentorOffline> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetch(path, { ...init, signal: controller.signal });
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // Not JSON (an HTML error page, say). The status alone decides what happens next.
      }
      return { status: response.status, body };
    } catch {
      const reason = controller.signal.aborted ? 'timeout' : 'unreachable';
      // console.info, not warn or error: an offline mentor is a normal state, not a bug.
      console.info(`[sage] offline (${reason}), using pre-written content.`);
      return offline(reason);
    } finally {
      clearTimeout(timer);
    }
  }

  function goOffline(result: MentorOffline): MentorOffline {
    devStatus.update({ mentor: 'offline' });
    return result;
  }

  async function getMentorStatus(): Promise<MentorStatus> {
    // No network at all during a drill, not even a health check. The badge stays as it was,
    // because the server itself hasn't changed.
    if (activeDrillSession() !== null) return offline('drill');
    if (!serverExpected) return goOffline(offline('no-server'));
    const received = await send('/api/health');
    if ('offline' in received) return goOffline(received);
    const { status, body } = received;
    if (status === 200 && isHealthReply(body)) {
      const canAnswer = body.keyConfigured && body.usage.calls < body.usage.cap;
      devStatus.update({ mentor: canAnswer ? 'online' : 'offline' });
      return { ...body, offline: false };
    }
    if (isOfflineBody(body)) return goOffline(offline('unreachable'));
    console.info(`[sage] unexpected health reply (HTTP ${String(status)}).`);
    return goOffline(offline('error'));
  }

  /**
   * Shared path for every mentor mode. It checks health first, so with no key or a spent
   * cap the game never sends a request the server would refuse (Chrome logs every refused
   * request as a console error).
   */
  async function ask<T>(
    request: MentorRequest,
    isReply: (body: unknown) => body is T,
  ): Promise<(T & { offline: false }) | MentorOffline> {
    // A drill shows up two ways: the drill guard, or a context the caller marked inDrill.
    // The server would refuse either one, so don't even ask.
    if (activeDrillSession() !== null || request.context.inDrill === true) {
      return offline('drill');
    }

    const health = await getMentorStatus();
    if (health.offline) return health;
    if (!health.keyConfigured) return offline('no-key');
    if (health.usage.calls >= health.usage.cap) return offline('daily-cap');

    const received = await send('/api/mentor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if ('offline' in received) return goOffline(received);
    const { status, body } = received;

    if (status === 200 && isReply(body)) {
      devStatus.update({ mentor: 'online' });
      return { ...body, offline: false };
    }
    if (status === 429) return goOffline(offline('daily-cap', serverMessage(body)));
    if (isOfflineBody(body)) return goOffline(offline(status === 503 ? 'no-key' : 'unreachable'));
    console.info(`[sage] ${request.mode} failed (HTTP ${String(status)}).`);
    return offline('error', serverMessage(body));
  }

  return {
    getMentorStatus,
    askHint: (context) => ask({ mode: 'hint', context }, isHintReply),
    gradeQuestion: (context) => ask({ mode: 'grade_question', context }, isGradeReply),
  };
}

const defaultClient = createMentorClient({ serverExpected: import.meta.env.DEV });

/** Asks the Sage server for its health and usage, and updates the dev status badge. */
export const getMentorStatus = defaultClient.getMentorStatus;
/** Asks Sage for a hint. On any offline result, show fallbackHint() instead. */
export const askHint = defaultClient.askHint;
/** Asks Sage to grade a free-text clarifying question. Hide free-text grading when offline. */
export const gradeQuestion = defaultClient.gradeQuestion;

/** The pre-written hint for a level, from a mission's hint ladder (DESIGN.md section 10). */
export function fallbackHint(
  ladder: readonly [question: string, concept: string, command: string],
  level: HintLevel,
): string {
  const [question, concept, command] = ladder;
  if (level === 1) return question;
  if (level === 2) return concept;
  return command;
}

/**
 * The hint ladder never skips a level: each request goes one step up from the last hint
 * shown for that step, and stays at 3 once there. Pass null before the first hint.
 */
export function nextHintLevel(current: HintLevel | null): HintLevel {
  if (current === null) return 1;
  if (current === 1) return 2;
  return 3;
}
