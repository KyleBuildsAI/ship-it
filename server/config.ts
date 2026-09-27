import type { Logger } from './logger';

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
export const DEFAULT_PORT = 8787;

type Env = Record<string, string | undefined>;

/** A variable counts as unset when it's missing or blank, like `MENTOR_PORT=` in .env. */
function readVar(env: Env, name: string): string | null {
  const value = env[name]?.trim() ?? '';
  return value === '' ? null : value;
}

/**
 * Reads a whole number, falling back to the default with a warning when the value
 * is malformed. A typo in .env should never crash the server or silently remove the cap.
 */
function readWholeNumber(
  env: Env,
  name: string,
  fallback: number,
  isValid: (value: number) => boolean,
  logger: Logger,
): number {
  const raw = readVar(env, name);
  if (raw === null) return fallback;
  const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (Number.isSafeInteger(value) && isValid(value)) return value;
  logger.warn(`${name}="${raw}" is not a valid value. Using ${String(fallback)} instead.`);
  return fallback;
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
    dailyCallCap: readWholeNumber(
      env,
      'MENTOR_DAILY_CALL_CAP',
      DEFAULT_DAILY_CALL_CAP,
      () => true,
      logger,
    ),
    port: readWholeNumber(
      env,
      'MENTOR_PORT',
      DEFAULT_PORT,
      (port) => port >= 1 && port <= 65535,
      logger,
    ),
  };
}
