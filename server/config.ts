import type { Logger } from './logger';
import { DEFAULT_PORT, parsePort } from './port';

/** Everything the mentor server reads from the environment (`.env` or the shell). */
export interface MentorConfig {
  /** Null when no key is set. The server still runs and reports Sage as offline. */
  apiKey: string | null;
  models: {
    /** Used for hint and grade_question. */
    default: string;
    /** Reserved for interview mode (M5). */
    interview: string;
  };
  /** Hard stop: the most Anthropic API calls Sage makes in one day. */
  dailyCallCap: number;
  port: number;
}

// DESIGN.md section 9 defaults. Both IDs were checked against Anthropic's current model
// table on 2026-09-27. Model IDs have no date suffix, so don't add one.
export const DEFAULT_MODEL = 'claude-sonnet-5';
export const DEFAULT_INTERVIEW_MODEL = 'claude-opus-5-5';
export const DEFAULT_DAILY_CALL_CAP = 50;
export { DEFAULT_PORT };

type Env = Record<string, string | undefined>;

/** A variable counts as unset when it's missing or blank, like `MENTOR_PORT=` in .env. */
function readVar(env: Env, name: string): string | null {
  const value = env[name]?.trim() ?? '';
  return value === '' ? null : value;
}

// A typo in .env should never crash the server or silently remove the cap, so a bad value
// falls back to the default and says so.
function warnInvalid(logger: Logger, name: string, raw: string, fallback: number): void {
  logger.warn(`${name}="${raw}" is not a valid value. Using ${String(fallback)} instead.`);
}

function readDailyCallCap(env: Env, logger: Logger): number {
  const raw = readVar(env, 'MENTOR_DAILY_CALL_CAP');
  if (raw === null) return DEFAULT_DAILY_CALL_CAP;
  const cap = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (Number.isSafeInteger(cap)) return cap;
  warnInvalid(logger, 'MENTOR_DAILY_CALL_CAP', raw, DEFAULT_DAILY_CALL_CAP);
  return DEFAULT_DAILY_CALL_CAP;
}

/** Uses the same parser as vite.config.ts, so the /api proxy always finds the server. */
function readPort(env: Env, logger: Logger): number {
  const raw = env.MENTOR_PORT ?? '';
  const port = parsePort(raw);
  if (port !== null) return port;
  warnInvalid(logger, 'MENTOR_PORT', raw.trim(), DEFAULT_PORT);
  return DEFAULT_PORT;
}

export function loadConfig(env: Env, logger: Logger): MentorConfig {
  if (readVar(env, 'MENTOR_BASE_URL') !== null) {
    // DESIGN.md section 9: gateway routing waits until Kyle's LiteLLM is confirmed to
    // expose an Anthropic-compatible Messages endpoint. Until then, say so loudly.
    logger.warn('MENTOR_BASE_URL is not supported yet and is ignored. Calling Anthropic directly.');
  }

  return {
    apiKey: readVar(env, 'ANTHROPIC_API_KEY'),
    models: {
      default: readVar(env, 'MENTOR_MODEL_DEFAULT') ?? DEFAULT_MODEL,
      interview: readVar(env, 'MENTOR_MODEL_INTERVIEW') ?? DEFAULT_INTERVIEW_MODEL,
    },
    dailyCallCap: readDailyCallCap(env, logger),
    port: readPort(env, logger),
  };
}
