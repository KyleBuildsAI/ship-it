import type { SaveData } from './schema';

/**
 * Autosave with debouncing. The game calls schedule() after every step, sometimes several
 * times in a row. Instead of writing to IndexedDB each time, we wait until things have been
 * quiet for `delayMs` and then write only the newest save.
 */

export const DEFAULT_AUTOSAVE_DELAY_MS = 500;

export interface Autosave {
  /** Remembers the newest save and writes it once no new save has arrived for `delayMs`. */
  schedule: (data: SaveData) => void;
  /**
   * Writes any waiting save right now, for example before an export or when the tab is hidden.
   * Resolves once everything scheduled so far is stored. Rejects if that write fails.
   */
  flush: () => Promise<void>;
}

export interface AutosaveOptions {
  /** Called when a background (timer-driven) write fails. Required, so a failed save is never silent. */
  onError: (error: unknown) => void;
  delayMs?: number;
}

export function createAutosave(
  write: (data: SaveData) => Promise<void>,
  options: AutosaveOptions,
): Autosave {
  const { onError, delayMs = DEFAULT_AUTOSAVE_DELAY_MS } = options;

  // The newest save that has not been handed to write() yet.
  let pending: SaveData | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // The end of a queue of writes. Each write waits for the one before it, so two writes never
  // run at once and an older save can never finish after, and overwrite, a newer one.
  let queueTail: Promise<void> = Promise.resolve();

  function cancelTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function writePending(): Promise<void> {
    const thisWrite = queueTail.then(async () => {
      const data = pending;
      // An earlier write in the queue already stored the newest data.
      if (data === null) return;
      pending = null;
      try {
        await write(data);
      } catch (error) {
        // Put the failed save back so the next schedule() or flush() retries it. If a newer
        // save arrived while this write was running, keep that one instead: newest wins.
        pending ??= data;
        throw error;
      }
    });
    // The next write must wait for this one whether it succeeds or fails. The failure itself is
    // not dropped: it is reported by whoever holds `thisWrite` (flush's caller, or onError).
    queueTail = thisWrite.catch(() => undefined);
    return thisWrite;
  }

  return {
    schedule(data) {
      pending = data;
      // Restarting the timer is the "debounce": a burst of saves becomes one write.
      cancelTimer();
      timer = setTimeout(() => {
        timer = null;
        writePending().catch(onError);
      }, delayMs);
    },
    flush() {
      cancelTimer();
      return writePending();
    },
  };
}
