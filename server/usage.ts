import { readFile, rename, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import type { Logger } from './logger';

/** One day of Sage usage, exactly as stored in server/usage.json. */
export interface UsageRecord {
  /** Local calendar day, YYYY-MM-DD. A new day starts a fresh count. */
  date: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
}

export interface UsageStore {
  readonly dailyCallCap: number;
  /** Today's totals. Starts a fresh day first if the date has changed. */
  current: () => Readonly<UsageRecord>;
  /**
   * Claims one call from today's budget and saves the new count. Resolves false, and
   * claims nothing, when the cap is already reached.
   */
  tryReserveCall: () => Promise<boolean>;
  /** Adds the tokens one Anthropic response reported, then saves. */
  recordTokens: (tokens: TokenCounts) => Promise<void>;
}

export interface UsageStoreOptions {
  filePath: string;
  dailyCallCap: number;
  logger: Logger;
  /** Today's date as YYYY-MM-DD. Tests pass a fixed clock. */
  today?: () => string;
}

const usageRecordSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  calls: z.int().nonnegative(),
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
});

/** The local date, not UTC: Kyle's "day" should reset at his midnight. */
export function localDateStamp(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

function freshDay(date: string): UsageRecord {
  return { date, calls: 0, inputTokens: 0, outputTokens: 0 };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function readRecord(filePath: string, today: string, logger: Logger): Promise<UsageRecord> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    // First run: no file yet is normal, not a problem worth a warning.
    if (!isMissingFile(error)) {
      logger.warn(
        `Could not read ${filePath} (${errorMessage(error)}), so today's count restarts at zero.`,
      );
    }
    return freshDay(today);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  const result = usageRecordSchema.safeParse(parsed);
  if (!result.success) {
    // A half-written or hand-edited file must not take Sage down. Start today over.
    logger.warn(`${filePath} was corrupt, so today's count restarts at zero.`);
    return freshDay(today);
  }
  return result.data.date === today ? result.data : freshDay(today);
}

/**
 * Opens the persistent daily usage counter behind Sage's cost guard. The count lives in
 * a file so restarting the server can't reset the cap (DESIGN.md section 9).
 */
export async function openUsageStore(options: UsageStoreOptions): Promise<UsageStore> {
  const { filePath, dailyCallCap, logger } = options;
  const today = options.today ?? (() => localDateStamp());
  const tempPath = `${filePath}.tmp`;

  let record = await readRecord(filePath, today(), logger);
  let pendingWrite: Promise<void> = Promise.resolve();

  function rollOverIfNewDay(): void {
    const date = today();
    if (record.date !== date) record = freshDay(date);
  }

  /**
   * Saves the current record. Writing a temp file and renaming it over the real one means
   * a crash mid-write leaves the old file intact instead of a truncated one. Writes queue
   * up one at a time so two requests finishing together can't interleave on the temp file.
   */
  function persist(): Promise<void> {
    const snapshot = JSON.stringify(record, null, 2);
    pendingWrite = pendingWrite
      .then(async () => {
        await writeFile(tempPath, snapshot, 'utf8');
        await rename(tempPath, filePath);
      })
      .catch((error: unknown) => {
        // The in-memory count still enforces the cap for this run; only persistence failed.
        logger.error(`Could not save usage to ${filePath}: ${errorMessage(error)}`);
      });
    return pendingWrite;
  }

  return {
    dailyCallCap,
    current: () => {
      rollOverIfNewDay();
      return record;
    },
    tryReserveCall: async () => {
      rollOverIfNewDay();
      // Check and increment happen together, before any await, so two simultaneous
      // requests can never both slip under the cap.
      if (record.calls >= dailyCallCap) return false;
      record = { ...record, calls: record.calls + 1 };
      await persist();
      return true;
    },
    recordTokens: async ({ inputTokens, outputTokens }) => {
      rollOverIfNewDay();
      record = {
        ...record,
        inputTokens: record.inputTokens + inputTokens,
        outputTokens: record.outputTokens + outputTokens,
      };
      await persist();
    },
  };
}
