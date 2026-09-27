import { devStatus } from './devStatus';
import { createAutosave, type Autosave } from './save/autosave';
import { loadSave, requestPersistentStorage, writeSave } from './save/db';
import type { SaveData } from './save/schema';
import { createStore } from './store';

export type ProgressStatus = 'loading' | 'ready' | 'failed';

export interface ProgressState {
  readonly status: ProgressStatus;
  /** The player's progress. Null while loading, or when the stored save couldn't be read. */
  readonly save: SaveData | null;
  /** Why the save couldn't be loaded, in words the player can act on. */
  readonly problem: string | null;
}

/**
 * The one copy of the player's progress the whole game reads. Changes go through
 * `updateSave`, which also autosaves them to IndexedDB (DESIGN.md pillar 7).
 */
export const progress = createStore<ProgressState>({
  status: 'loading',
  save: null,
  problem: null,
});

/** Where saves are read and written. IndexedDB in the game; a fake in tests. */
export interface ProgressStorage {
  load: (now: Date) => Promise<SaveData>;
  write: (save: SaveData) => Promise<void>;
}

const indexedDbStorage: ProgressStorage = { load: loadSave, write: writeSave };

let autosave: Autosave | null = null;

function describeLoadProblem(error: unknown): string {
  if (error instanceof Error && error.name === 'FutureSaveVersionError') {
    return 'Your save comes from a newer version of SHIP IT. Update the game to keep playing it.';
  }
  return 'Your save could not be read. Import a backup from Settings, or start over there.';
}

/**
 * Loads the save (creating a new game on first launch) and starts autosaving. A save that
 * can't be read is left untouched in storage: the player chooses what happens to it.
 */
export async function startProgress(
  storage: ProgressStorage = indexedDbStorage,
  now: Date = new Date(),
): Promise<void> {
  autosave = createAutosave(
    async (save) => {
      await storage.write(save);
      devStatus.update({ save: 'saved' });
    },
    {
      onError: (error) => {
        devStatus.update({ save: 'error' });
        console.error('[ship-it] autosave failed; recent progress is not stored yet', error);
      },
    },
  );
  try {
    const save = await storage.load(now);
    progress.update({ status: 'ready', save, problem: null });
    devStatus.update({ save: 'saved' });
    // Without this, a browser low on disk may treat IndexedDB as a cache and delete it.
    requestPersistentStorage().catch((error: unknown) => {
      console.warn('[ship-it] the browser would not keep the save permanently', error);
    });
  } catch (error) {
    progress.update({ status: 'failed', save: null, problem: describeLoadProblem(error) });
    devStatus.update({ save: 'error' });
    console.error('[ship-it] the save could not be loaded', error);
  }
}

/**
 * Changes the player's progress and schedules an autosave. `change` gets the current save
 * and returns the new one; it must not modify its argument. Does nothing until a save loads.
 */
export function updateSave(change: (save: SaveData) => SaveData): void {
  const { save } = progress.get();
  if (save === null) return;
  const next = change(save);
  if (next === save) return;
  progress.update({ save: next });
  autosave?.schedule(next);
}

/**
 * For play milestones (a finished step, drill, or mission): apply the change and store it
 * straight away, so closing the browser a moment later loses nothing (DESIGN.md pillar 7).
 * Quick settings changes use updateSave and ride the autosave debounce instead.
 */
export function saveProgressNow(change: (save: SaveData) => SaveData): void {
  updateSave(change);
  flushProgress().catch((error: unknown) => {
    console.error('[ship-it] saving progress failed', error);
  });
}

/** Replaces the whole save, as an import does, and stores it straight away. */
export async function replaceSave(save: SaveData): Promise<void> {
  progress.update({ status: 'ready', save, problem: null });
  autosave?.schedule(save);
  await flushProgress();
}

/** Writes any pending change now, e.g. when the tab is hidden or before an export. */
export async function flushProgress(): Promise<void> {
  await autosave?.flush();
}

/**
 * Resolves once the save has loaded (or failed to), or after `timeoutMs` at most, so the
 * 3D world can read settings like reduced motion without ever waiting on a stuck database.
 */
export function whenProgressSettles(timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    if (progress.get().status !== 'loading') {
      resolve();
      return;
    }
    const timer = setTimeout(finish, timeoutMs);
    const stop = progress.subscribe(() => {
      if (progress.get().status !== 'loading') finish();
    });
    function finish() {
      clearTimeout(timer);
      stop();
      resolve();
    }
  });
}
