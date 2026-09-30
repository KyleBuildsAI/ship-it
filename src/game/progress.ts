import { devStatus } from './devStatus';
import { createAutosave, type Autosave } from './save/autosave';
import { loadSave, requestPersistentStorage, writeSave } from './save/db';
import type { SaveData } from './save/schema';
import { createStore } from './store';

/** 'elsewhere': another tab has the save now, so this one stopped writing it. */
export type ProgressStatus = 'loading' | 'ready' | 'failed' | 'elsewhere';

export interface ProgressState {
  readonly status: ProgressStatus;
  /** The player's progress. Null while loading, or when the stored save couldn't be read. */
  readonly save: SaveData | null;
  /**
   * In words the player can act on: why the save couldn't be loaded, or that this tab's
   * last change couldn't be stored before handing over to another tab.
   */
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

/** The one Web Locks call the save uses. `navigator.locks` in the game; a fake in tests. */
export interface SaveLocks {
  request: (
    name: string,
    options: { steal?: boolean; signal?: AbortSignal },
    callback: () => Promise<void>,
  ) => Promise<unknown>;
}

/** How tabs of the game talk to each other. A BroadcastChannel in the game; a fake in tests. */
export interface TabChannel {
  postMessage: (message: unknown) => void;
  addEventListener: (type: 'message', listener: (event: { data: unknown }) => void) => void;
  close: () => void;
}

/** Everything tabs use to agree on who saves. Null parts mean "a browser without it". */
export interface TabCoordination {
  locks: SaveLocks | null;
  openChannel: (() => TabChannel) | null;
}

const SAVE_LOCK = 'ship-it-save';
const HANDOVER = 'ship-it-handover';
/** How long a new tab waits for the old one to hand over before taking the save anyway. */
export const HANDOVER_WAIT_MS = 1500;

function browserCoordination(): TabCoordination {
  // Read through honest types: older browsers have neither, and Node in tests has both.
  const scope = globalThis as {
    navigator?: { locks?: SaveLocks };
    BroadcastChannel?: new (name: string) => TabChannel;
  };
  const Channel = scope.BroadcastChannel;
  return {
    locks: scope.navigator?.locks ?? null,
    openChannel: Channel ? () => new Channel(HANDOVER) : null,
  };
}

/**
 * A tab asking for the save: when it asked, and a random tie-break for two tabs asking in
 * the same instant. Two tabs opened together each hear the other ask; comparing asks lets
 * exactly one of them, the newer, end up with the save.
 */
interface Ask {
  readonly ask: typeof HANDOVER;
  readonly at: number;
  readonly nonce: number;
}

function isAsk(data: unknown): data is Ask {
  if (typeof data !== 'object' || data === null) return false;
  const { ask, at, nonce } = data as Record<string, unknown>;
  return ask === HANDOVER && typeof at === 'number' && typeof nonce === 'number';
}

/** This tab's own ask. Null before it has asked. */
let ownAsk: Ask | null = null;

/** Whether `other` asked after this tab did: only a newer tab is given the save. */
function isNewer(other: Ask): boolean {
  if (ownAsk === null) return true;
  return other.at > ownAsk.at || (other.at === ownAsk.at && other.nonce > ownAsk.nonce);
}

/** Milliseconds since 1970, to a fraction of a millisecond, comparable across tabs. */
function askTime(): number {
  return performance.timeOrigin + performance.now();
}

let autosave: Autosave | null = null;
/** Set the moment this tab starts handing over, before anything else can write. */
let steppedAside = false;
/** A newer tab asked for the save while this one was still waiting for it. */
let handoverRequested = false;
/** Ends this tab's hold on the save lock. Null when it doesn't hold it. */
let releaseSave: (() => void) | null = null;
let channel: TabChannel | null = null;
/** Counts claims, so only the latest one in this page reacts to losing the save. */
let claims = 0;

/*
 * Two tabs each hold a copy of the save, so both writing would let the older copy
 * overwrite newer progress. So exactly one tab saves, and the newest one gets it:
 *
 * 1. A new tab asks for the save on a BroadcastChannel, and waits for the Web Lock.
 * 2. The tab that has it stops writing, stores anything still pending, then lets go.
 * 3. Only then does the new tab load the save, so it always reads the latest one.
 *
 * A tab that can't answer (frozen in the background, or kept in the back/forward cache)
 * never lets go, so after HANDOVER_WAIT_MS the new tab takes the lock anyway. A frozen tab
 * can't write while frozen, and when it wakes up it learns it lost the save.
 */

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  );
}

/** Stops this tab writing, stores what's pending, and tells the player. Final until reload. */
async function handOver(release: boolean): Promise<void> {
  if (steppedAside) return;
  steppedAside = true;
  progress.update({ status: 'elsewhere' });
  let lastChangeLost = false;
  try {
    await autosave?.flush();
  } catch (error) {
    lastChangeLost = true;
    console.error('[ship-it] saving before handing over to the other tab failed', error);
  }
  // Nothing in this tab may write again, not even a retry of a failed write.
  autosave = null;
  progress.update({
    problem: lastChangeLost ? 'Your latest change in this tab could not be saved.' : null,
  });
  devStatus.update({ save: 'elsewhere' });
  if (release) {
    releaseSave?.();
    releaseSave = null;
  }
}

function onTabMessage(event: { data: unknown }): void {
  // An older tab's ask arrives here too when two tabs start together. Giving it the save
  // would leave both tabs handed over, each to the other, and neither saving.
  if (steppedAside || !isAsk(event.data) || !isNewer(event.data)) return;
  // Still waiting for the lock ourselves: hand over as soon as it arrives.
  if (releaseSave === null) handoverRequested = true;
  else void handOver(true);
}

/** Resolves once this tab holds the save lock (or has to go without: no Web Locks). */
function acquireSave(locks: SaveLocks | null): Promise<void> {
  if (locks === null) return Promise.resolve();
  const claim = ++claims;
  return new Promise<void>((granted) => {
    let holding = false;
    const hold = () => {
      holding = true;
      granted();
      return new Promise<void>((release) => {
        releaseSave = release;
      });
    };
    const lost = (error: unknown) => {
      // A newer claim from this same page (a second startProgress) isn't another tab.
      if (claim !== claims) return;
      if (isAbortError(error)) void handOver(false);
      else console.error('[ship-it] this tab lost the save lock', error);
    };
    locks
      .request(SAVE_LOCK, { signal: AbortSignal.timeout(HANDOVER_WAIT_MS) }, hold)
      .catch((error: unknown) => {
        if (holding) {
          lost(error);
          return;
        }
        // A newer tab already asked: it should end up with the save, so don't steal it
        // from that tab only to hand straight over. Step aside without the lock instead.
        if (handoverPending()) {
          granted();
          return;
        }
        // Nobody handed over in time: a frozen or cached tab holds it. Take it anyway.
        locks.request(SAVE_LOCK, { steal: true }, hold).catch((stealError: unknown) => {
          if (holding) {
            lost(stealError);
            return;
          }
          console.error('[ship-it] this tab could not claim the save', stealError);
          granted();
        });
      });
  });
}

/**
 * Loads the save (creating a new game on first launch) and starts autosaving, once this tab
 * owns the save. A save that can't be read is left untouched in storage: the player
 * chooses what happens to it.
 */
export async function startProgress(
  storage: ProgressStorage = indexedDbStorage,
  now: Date = new Date(),
  coordination: TabCoordination = browserCoordination(),
): Promise<void> {
  // A second start in the same page lets go of the first one's claim before asking again.
  releaseSave?.();
  releaseSave = null;
  channel?.close();
  channel = null;
  steppedAside = false;
  handoverRequested = false;
  progress.update({ status: 'loading', save: null, problem: null });

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

  ownAsk = { ask: HANDOVER, at: askTime(), nonce: Math.random() };
  if (coordination.openChannel) {
    channel = coordination.openChannel();
    channel.addEventListener('message', onTabMessage);
    channel.postMessage(ownAsk);
  }
  await acquireSave(coordination.locks);
  // Read through functions: other tabs' messages change these flags during the awaits.
  if (handoverPending()) {
    await handOver(true);
    return;
  }

  try {
    const save = await storage.load(now);
    // Handed over while loading: keep the save to show, but this tab stays 'elsewhere'.
    if (!isSavingHere()) {
      progress.update({ save });
      return;
    }
    progress.update({ status: 'ready', save, problem: null });
    devStatus.update({ save: 'saved' });
    // Without this, a browser low on disk may treat IndexedDB as a cache and delete it.
    requestPersistentStorage().catch((error: unknown) => {
      console.warn('[ship-it] the browser would not keep the save permanently', error);
    });
  } catch (error) {
    if (!isSavingHere()) return;
    progress.update({ status: 'failed', save: null, problem: describeLoadProblem(error) });
    devStatus.update({ save: 'error' });
    console.error('[ship-it] the save could not be loaded', error);
  }
}

function describeLoadProblem(error: unknown): string {
  if (error instanceof Error && error.name === 'FutureSaveVersionError') {
    return 'Your save comes from a newer version of SHIP IT. Update the game to keep playing it.';
  }
  return 'Your save could not be read. Import a backup from Settings, or start over there.';
}

function handoverPending(): boolean {
  return handoverRequested;
}

/** False once another tab has the save: then nothing here can change it. */
export function isSavingHere(): boolean {
  return !steppedAside;
}

/**
 * Changes the player's progress and schedules an autosave. `change` gets the current save
 * and returns the new one; it must not modify its argument. Does nothing until a save loads,
 * or once another tab has the save.
 */
export function updateSave(change: (save: SaveData) => SaveData): void {
  const { save } = progress.get();
  if (save === null || steppedAside) return;
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

/**
 * Replaces the whole save, as an import does, and stores it straight away. Resolves false,
 * changing nothing, when another tab has the save.
 */
export async function replaceSave(save: SaveData): Promise<boolean> {
  if (steppedAside) return false;
  progress.update({ status: 'ready', save, problem: null });
  autosave?.schedule(save);
  await flushProgress();
  return true;
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
