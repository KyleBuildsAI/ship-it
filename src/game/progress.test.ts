import { afterEach, describe, expect, it, vi } from 'vitest';
import { devStatus } from './devStatus';
import {
  flushProgress,
  progress,
  replaceSave,
  startProgress,
  updateSave,
  type ProgressStorage,
} from './progress';
import { FutureSaveVersionError, InvalidSaveError } from './save/migrations';
import { createDefaultSave, type SaveData } from './save/schema';

const NOW = new Date('2026-09-27T12:00:00.000Z');

function memoryStorage(initial: SaveData = createDefaultSave(NOW)) {
  const writes: SaveData[] = [];
  const storage: ProgressStorage = {
    load: () => Promise.resolve(initial),
    write: (save) => {
      writes.push(save);
      return Promise.resolve();
    },
  };
  return { storage, writes };
}

afterEach(() => {
  progress.update({ status: 'loading', save: null, problem: null });
  devStatus.update({ save: 'none' });
  vi.restoreAllMocks();
});

describe('progress', () => {
  it('loads the save and marks it saved', async () => {
    const { storage } = memoryStorage();
    await startProgress(storage, NOW);
    expect(progress.get()).toMatchObject({ status: 'ready', problem: null });
    expect(progress.get().save?.profile.xp).toBe(0);
    expect(devStatus.get().save).toBe('saved');
  });

  it('keeps an unreadable save untouched and explains what to do', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const storage: ProgressStorage = {
      load: () => Promise.reject(new InvalidSaveError(['profile.xp: Too small'])),
      write: () => Promise.reject(new Error('must not write')),
    };
    await startProgress(storage, NOW);
    expect(progress.get()).toMatchObject({ status: 'failed', save: null });
    expect(progress.get().problem).toContain('Import a backup');
    expect(devStatus.get().save).toBe('error');
  });

  it('asks the player to update the game for a save from a newer version', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const storage: ProgressStorage = {
      load: () => Promise.reject(new FutureSaveVersionError(9)),
      write: () => Promise.resolve(),
    };
    await startProgress(storage, NOW);
    expect(progress.get().problem).toContain('newer version');
  });

  it('applies changes and autosaves them', async () => {
    const { storage, writes } = memoryStorage();
    await startProgress(storage, NOW);
    updateSave((save) => ({ ...save, profile: { ...save.profile, xp: 30 } }));
    expect(progress.get().save?.profile.xp).toBe(30);
    await flushProgress();
    expect(writes.at(-1)?.profile.xp).toBe(30);
  });

  it('skips the write when a change returns the same save', async () => {
    const { storage, writes } = memoryStorage();
    await startProgress(storage, NOW);
    updateSave((save) => save);
    await flushProgress();
    expect(writes).toHaveLength(0);
  });

  it('replaces the whole save and stores it at once, as an import does', async () => {
    const { storage, writes } = memoryStorage();
    await startProgress(storage, NOW);
    const imported = {
      ...createDefaultSave(NOW),
      profile: { ...createDefaultSave(NOW).profile, xp: 999 },
    };
    await replaceSave(imported);
    expect(progress.get().save?.profile.xp).toBe(999);
    expect(writes.at(-1)?.profile.xp).toBe(999);
  });
});
