import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosave, DEFAULT_AUTOSAVE_DELAY_MS } from './autosave';
import { createDefaultSave, type SaveData } from './schema';
import { TEST_NOW } from './testFixtures';

type WriteSave = (data: SaveData) => Promise<void>;

/** Saves that differ only by XP, so each test can tell which one was written. */
function saveWithXp(xp: number): SaveData {
  const save = createDefaultSave(TEST_NOW);
  return { ...save, profile: { ...save.profile, xp } };
}

/** A promise the test resolves or rejects by hand, to control when a slow write finishes. */
function controllablePromise() {
  let resolve: () => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

/** The XP of each save passed to the write mock, in call order. */
function writtenXp(write: { mock: { calls: [SaveData][] } }): number[] {
  return write.mock.calls.map(([data]) => data.profile.xp);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createAutosave', () => {
  it('writes once, after the delay', async () => {
    const write = vi.fn<WriteSave>(() => Promise.resolve());
    const autosave = createAutosave(write, { onError: vi.fn() });

    autosave.schedule(saveWithXp(1));
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS - 1);
    expect(write).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(writtenXp(write)).toEqual([1]);
  });

  it('turns a burst of saves into one write of the newest save', async () => {
    const write = vi.fn<WriteSave>(() => Promise.resolve());
    const autosave = createAutosave(write, { onError: vi.fn() });

    autosave.schedule(saveWithXp(1));
    await vi.advanceTimersByTimeAsync(300);
    autosave.schedule(saveWithXp(2));
    await vi.advanceTimersByTimeAsync(300);
    autosave.schedule(saveWithXp(3));
    await vi.advanceTimersByTimeAsync(499);
    expect(write).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(writtenXp(write)).toEqual([3]);
  });

  it('honors a custom delay', async () => {
    const write = vi.fn<WriteSave>(() => Promise.resolve());
    const autosave = createAutosave(write, { onError: vi.fn(), delayMs: 2000 });

    autosave.schedule(saveWithXp(1));
    await vi.advanceTimersByTimeAsync(1999);
    expect(write).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledOnce();
  });

  it('never runs two writes at once, and still writes the newest save last', async () => {
    const firstWrite = controllablePromise();
    const write = vi
      .fn<WriteSave>(() => Promise.resolve())
      .mockImplementationOnce(() => firstWrite.promise);
    const autosave = createAutosave(write, { onError: vi.fn() });

    autosave.schedule(saveWithXp(1));
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS);
    autosave.schedule(saveWithXp(2));
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS);
    // The first write is still running, so the second one waits for it.
    expect(writtenXp(write)).toEqual([1]);

    firstWrite.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(writtenXp(write)).toEqual([1, 2]);
  });

  describe('flush', () => {
    it('writes the waiting save immediately and cancels the timer', async () => {
      const write = vi.fn<WriteSave>(() => Promise.resolve());
      const autosave = createAutosave(write, { onError: vi.fn() });

      autosave.schedule(saveWithXp(7));
      await autosave.flush();
      expect(writtenXp(write)).toEqual([7]);

      await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS * 4);
      expect(write).toHaveBeenCalledOnce();
    });

    it('resolves without writing when nothing is waiting', async () => {
      const write = vi.fn<WriteSave>(() => Promise.resolve());
      const autosave = createAutosave(write, { onError: vi.fn() });

      await autosave.flush();

      expect(write).not.toHaveBeenCalled();
    });

    it('waits for a write that is already running before resolving', async () => {
      const slowWrite = controllablePromise();
      const write = vi.fn<WriteSave>(() => slowWrite.promise);
      const autosave = createAutosave(write, { onError: vi.fn() });
      autosave.schedule(saveWithXp(1));
      await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS);

      let flushed = false;
      const flushing = autosave.flush().then(() => {
        flushed = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(flushed).toBe(false);

      slowWrite.resolve();
      await flushing;
      expect(flushed).toBe(true);
      expect(write).toHaveBeenCalledOnce();
    });

    it('rejects when the write fails, and leaves reporting to the caller', async () => {
      const failure = new Error('QuotaExceededError');
      const write = vi.fn<WriteSave>(() => Promise.reject(failure));
      const onError = vi.fn();
      const autosave = createAutosave(write, { onError });

      autosave.schedule(saveWithXp(1));

      await expect(autosave.flush()).rejects.toBe(failure);
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('failures', () => {
    it('reports a failed background write to onError', async () => {
      const failure = new Error('disk full');
      const write = vi.fn<WriteSave>(() => Promise.reject(failure));
      const onError = vi.fn();
      const autosave = createAutosave(write, { onError });

      autosave.schedule(saveWithXp(1));
      await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS);

      expect(onError).toHaveBeenCalledExactlyOnceWith(failure);
    });

    it('keeps the failed save and retries it on the next flush', async () => {
      const write = vi
        .fn<WriteSave>(() => Promise.resolve())
        .mockRejectedValueOnce(new Error('disk full'));
      const autosave = createAutosave(write, { onError: vi.fn() });

      autosave.schedule(saveWithXp(5));
      await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS);
      await autosave.flush();

      expect(writtenXp(write)).toEqual([5, 5]);
    });

    it('retries with newer data, not the failed data, when a newer save arrived meanwhile', async () => {
      const firstWrite = controllablePromise();
      const write = vi
        .fn<WriteSave>(() => Promise.resolve())
        .mockImplementationOnce(() => firstWrite.promise);
      const onError = vi.fn();
      const autosave = createAutosave(write, { onError });

      autosave.schedule(saveWithXp(1));
      await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS);
      autosave.schedule(saveWithXp(2));
      firstWrite.reject(new Error('disk full'));
      await autosave.flush();

      expect(onError).toHaveBeenCalledOnce();
      expect(writtenXp(write)).toEqual([1, 2]);
    });

    it('keeps writing later saves after a failure', async () => {
      const write = vi
        .fn<WriteSave>(() => Promise.resolve())
        .mockRejectedValueOnce(new Error('disk full'));
      const onError = vi.fn();
      const autosave = createAutosave(write, { onError });

      autosave.schedule(saveWithXp(1));
      await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS);
      autosave.schedule(saveWithXp(2));
      await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS);

      expect(onError).toHaveBeenCalledOnce();
      expect(writtenXp(write)).toEqual([1, 2]);
    });
  });
});
