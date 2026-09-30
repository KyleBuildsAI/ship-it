import { afterEach, describe, expect, it, vi } from 'vitest';
import { devStatus } from './devStatus';
import {
  flushProgress,
  isSavingHere,
  progress,
  replaceSave,
  startProgress,
  updateSave,
  type ProgressStorage,
  type SaveLocks,
  type TabChannel,
  type TabCoordination,
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
    expect(await replaceSave(imported)).toBe(true);
    expect(progress.get().save?.profile.xp).toBe(999);
    expect(writes.at(-1)?.profile.xp).toBe(999);
  });
});

interface LockRequest {
  options: { steal?: boolean; signal?: AbortSignal };
  callback: () => Promise<void>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

/**
 * Plays "another tab of the game" for the tab under test: it hears what this tab posts,
 * can ask for the save, and decides when the shared lock is free.
 */
function otherTab() {
  const listeners: ((event: { data: unknown }) => void)[] = [];
  const posted: unknown[] = [];
  const channel: TabChannel = {
    postMessage: (message) => posted.push(message),
    addEventListener: (_type, listener) => listeners.push(listener),
    close: () => {
      listeners.length = 0;
    },
  };
  const requests: LockRequest[] = [];
  const locks: SaveLocks = {
    request: (_name, options, callback) =>
      new Promise((resolve, reject) => {
        requests.push({ options, callback, resolve, reject });
        options.signal?.addEventListener('abort', () => {
          reject(new DOMException('The wait for the lock timed out', 'TimeoutError'));
        });
      }),
  };
  const coordination: TabCoordination = { locks, openChannel: () => channel };
  return {
    coordination,
    posted,
    requests,
    listeners,
    /** The lock is free: this tab gets it. Resolves when this tab lets go of it. */
    grant: (index = requests.length - 1) => {
      const request = requests[index];
      if (request === undefined) throw new Error(`no lock request ${String(index)}`);
      const held = request.callback();
      void held.then(request.resolve);
      return held;
    },
    /**
     * The other tab asks for the save. By default it asked after this tab (a newer tab);
     * pass an earlier time for a tab that asked first, as when two open together.
     */
    asks: (at = Number.POSITIVE_INFINITY) => {
      const ask = { ask: 'ship-it-handover', at, nonce: 0 };
      for (const listener of [...listeners]) listener({ data: ask });
    },
    /** The other tab's fallback takes the lock without asking. */
    steals: (index = requests.length - 1) => {
      requests[index]?.reject(new DOMException('Lock broken by another request', 'AbortError'));
    },
  };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('two tabs', () => {
  it('asks for the save, and loads it only once the other tab lets go', async () => {
    const load = vi.fn(() => Promise.resolve(createDefaultSave(NOW)));
    const tab = otherTab();
    const starting = startProgress({ load, write: () => Promise.resolve() }, NOW, tab.coordination);
    await settle();
    // One ask, saying when this tab asked, so the other tab can tell which of them is newer.
    expect(tab.posted).toHaveLength(1);
    const [ask] = tab.posted as { ask: unknown; at: unknown; nonce: unknown }[];
    expect(ask?.ask).toBe('ship-it-handover');
    expect(typeof ask?.at).toBe('number');
    expect(typeof ask?.nonce).toBe('number');
    expect(load).not.toHaveBeenCalled();
    void tab.grant();
    await starting;
    expect(load).toHaveBeenCalledOnce();
    expect(progress.get().status).toBe('ready');
    expect(isSavingHere()).toBe(true);
  });

  it('hands over when a newer tab asks: stores what was pending, stops writing, lets go', async () => {
    const { storage, writes } = memoryStorage();
    const tab = otherTab();
    const starting = startProgress(storage, NOW, tab.coordination);
    await settle();
    const held = tab.grant();
    await starting;
    // A settings change waits out the autosave debounce when the player opens another tab.
    updateSave((save) => ({ ...save, profile: { ...save.profile, xp: 5 } }));
    tab.asks();
    expect(progress.get().status).toBe('elsewhere');
    await held;
    // The lock is only released after the pending change is stored.
    expect(writes.at(-1)?.profile.xp).toBe(5);
    expect(devStatus.get().save).toBe('elsewhere');
    expect(progress.get().problem).toBeNull();

    const before = writes.length;
    updateSave((save) => ({ ...save, profile: { ...save.profile, xp: 999 } }));
    expect(await replaceSave(createDefaultSave(NOW))).toBe(false);
    await flushProgress();
    expect(writes).toHaveLength(before);
    expect(progress.get().save?.profile.xp).toBe(5);
    expect(isSavingHere()).toBe(false);
  });

  it('stays handed over when asked while the save is still loading', async () => {
    let finishLoad: (save: SaveData) => void = () => undefined;
    const storage: ProgressStorage = {
      load: () =>
        new Promise((resolve) => {
          finishLoad = resolve;
        }),
      write: () => Promise.resolve(),
    };
    const tab = otherTab();
    const starting = startProgress(storage, NOW, tab.coordination);
    await settle();
    void tab.grant();
    await settle();
    tab.asks();
    finishLoad(createDefaultSave(NOW));
    await starting;
    expect(progress.get().status).toBe('elsewhere');
    await settle();
    expect(devStatus.get().save).toBe('elsewhere');
  });

  it('hands over straight away when asked while still waiting for the save', async () => {
    const load = vi.fn(() => Promise.resolve(createDefaultSave(NOW)));
    const tab = otherTab();
    const starting = startProgress({ load, write: () => Promise.resolve() }, NOW, tab.coordination);
    await settle();
    tab.asks();
    const held = tab.grant();
    await starting;
    await held;
    expect(load).not.toHaveBeenCalled();
    expect(progress.get().status).toBe('elsewhere');
  });

  it('keeps the save when a tab that asked earlier is heard late, as when two open together', async () => {
    const load = vi.fn(() => Promise.resolve(createDefaultSave(NOW)));
    const tab = otherTab();
    const starting = startProgress({ load, write: () => Promise.resolve() }, NOW, tab.coordination);
    await settle();
    // The other tab asked first (time 0), and its ask arrives while this one still waits.
    tab.asks(0);
    void tab.grant();
    await starting;
    expect(load).toHaveBeenCalledOnce();
    expect(progress.get().status).toBe('ready');
    // Heard again once this tab holds the save: still older, so still ignored.
    tab.asks(0);
    expect(isSavingHere()).toBe(true);
  });

  it('ignores messages that are not asks for the save', async () => {
    const load = vi.fn(() => Promise.resolve(createDefaultSave(NOW)));
    const tab = otherTab();
    const starting = startProgress({ load, write: () => Promise.resolve() }, NOW, tab.coordination);
    await settle();
    void tab.grant();
    await starting;
    for (const listener of tab.listeners) {
      listener({ data: 'ship-it-handover' });
      listener({ data: { ask: 'ship-it-handover', at: 'soon', nonce: 1 } });
      listener({ data: null });
    }
    expect(isSavingHere()).toBe(true);
  });

  it('takes the save anyway when the other tab never answers', async () => {
    const { storage } = memoryStorage();
    const tab = otherTab();
    const starting = startProgress(storage, NOW, tab.coordination);
    // A frozen or cached tab never lets go; after the wait, this tab takes the lock.
    await vi.waitFor(
      () => {
        expect(tab.requests).toHaveLength(2);
      },
      { timeout: 3000 },
    );
    expect(tab.requests[1]?.options.steal).toBe(true);
    void tab.grant(1);
    await starting;
    expect(progress.get().status).toBe('ready');
  });

  it('does not steal the save from a newer tab when its own wait runs out', async () => {
    const load = vi.fn(() => Promise.resolve(createDefaultSave(NOW)));
    const tab = otherTab();
    const starting = startProgress({ load, write: () => Promise.resolve() }, NOW, tab.coordination);
    await settle();
    // A newer tab asked, and got the lock first, so this tab's wait times out.
    tab.asks();
    await starting;
    expect(tab.requests).toHaveLength(1);
    expect(load).not.toHaveBeenCalled();
    expect(progress.get().status).toBe('elsewhere');
  });

  it("steps aside when another tab's fallback takes the save without asking", async () => {
    const { storage } = memoryStorage();
    const tab = otherTab();
    const starting = startProgress(storage, NOW, tab.coordination);
    await settle();
    void tab.grant();
    await starting;
    tab.steals();
    await vi.waitFor(() => {
      expect(progress.get().status).toBe('elsewhere');
    });
  });

  it('says so when the last change could not be stored before handing over', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const write = vi.fn(() => Promise.reject(new Error('disk full')));
    const tab = otherTab();
    const starting = startProgress(
      { load: () => Promise.resolve(createDefaultSave(NOW)), write },
      NOW,
      tab.coordination,
    );
    await settle();
    const held = tab.grant();
    await starting;
    updateSave((save) => ({ ...save, profile: { ...save.profile, xp: 5 } }));
    tab.asks();
    await held;
    expect(progress.get().problem).toContain('could not be saved');
    // Never retried from this tab: the other tab owns the save now.
    const attempts = write.mock.calls.length;
    await flushProgress();
    expect(write.mock.calls.length).toBe(attempts);
  });

  it('ignores losing an older claim from this same page', async () => {
    const { storage, writes } = memoryStorage();
    const tab = otherTab();
    let starting = startProgress(storage, NOW, tab.coordination);
    await settle();
    void tab.grant(0);
    await starting;
    starting = startProgress(storage, NOW, tab.coordination);
    await settle();
    void tab.grant(1);
    await starting;
    tab.steals(0);
    await settle();
    expect(progress.get().status).toBe('ready');
    updateSave((save) => ({ ...save, profile: { ...save.profile, xp: 3 } }));
    await flushProgress();
    expect(writes.at(-1)?.profile.xp).toBe(3);
  });

  it('works in browsers without Web Locks or BroadcastChannel', async () => {
    const { storage, writes } = memoryStorage();
    await startProgress(storage, NOW, { locks: null, openChannel: null });
    updateSave((save) => ({ ...save, profile: { ...save.profile, xp: 7 } }));
    await flushProgress();
    expect(writes.at(-1)?.profile.xp).toBe(7);
  });
});
