import { devStatus } from './devStatus';
import { createAutosave, type Autosave } from './save/autosave';
import { loadSave, requestPersistentStorage, writeSave } from './save/db';
import type { SaveData } from './save/schema';
import { createStore } from './store';
import { webSaveLocks, type WebLocks } from './webLocks';

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
  /**
   * Reads the save. A new game, or an old save it upgrades, is stored with `store`, so that
   * write follows the same rules as every other one (storeLoadedSave).
   */
  load: (now: Date, store: (save: SaveData) => Promise<void>) => Promise<SaveData>;
  write: (save: SaveData) => Promise<void>;
}

const indexedDbStorage: ProgressStorage = { load: loadSave, write: writeSave };

/**
 * The Web Locks calls the save uses. Made from `navigator.locks` in the game (webLocks.ts); a
 * fake in tests.
 */
export interface SaveLocks {
  request: (
    name: string,
    options: { steal?: boolean; signal?: AbortSignal },
    callback: () => Promise<void>,
  ) => Promise<unknown>;
  /** Asks the browser whether this tab holds the lock `name` right now. */
  isHolding: (name: string) => Promise<boolean>;
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
    navigator?: { locks?: WebLocks };
    BroadcastChannel?: new (name: string) => TabChannel;
  };
  const Channel = scope.BroadcastChannel;
  const locks = scope.navigator?.locks;
  return {
    locks: locks ? webSaveLocks(locks) : null,
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
  /**
   * When the asking tab stops waiting and takes the save anyway (Date.now() time). A tab that
   * only hears the ask after this has lost the save already, though the news may not have
   * reached it yet.
   */
  readonly takesAt: number;
  /**
   * True when the asking tab says it has just taken the lock by stealing it, rather than
   * waiting for it. That can be old news: another tab may have stolen the lock from it since.
   */
  readonly stole: boolean;
}

function isAsk(data: unknown): data is Ask {
  if (typeof data !== 'object' || data === null) return false;
  const { ask, at, nonce, takesAt, stole } = data as Record<string, unknown>;
  return (
    ask === HANDOVER &&
    typeof at === 'number' &&
    typeof nonce === 'number' &&
    typeof takesAt === 'number' &&
    typeof stole === 'boolean'
  );
}

/**
 * This tab's ask, made now. `waitMs` is how long it waits before taking the save anyway;
 * `stole` says it has just taken the lock by stealing it.
 */
function askNow(waitMs: number, stole: boolean): Ask {
  return {
    ask: HANDOVER,
    at: askTime(),
    nonce: Math.random(),
    takesAt: Date.now() + waitMs,
    stole,
  };
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
/**
 * Whether this tab may write the save: it holds the lock, or the browser has no Web Locks.
 * Cleared the moment this tab learns the lock is gone, and checked as each write starts.
 */
let holdsSave = false;
/**
 * When the tab this one is handing over to takes the save anyway (its ask's `takesAt`). From
 * then on no write may start here, even before the news that the lock is gone arrives.
 */
let newOwnerTakesAt = Number.POSITIVE_INFINITY;
/** A newer tab asked for the save while this one was still waiting for it. */
let handoverRequested = false;
/** Ends this tab's hold on the save lock. Null when it doesn't hold it. */
let releaseSave: (() => void) | null = null;
let channel: TabChannel | null = null;
/** Counts claims, so only the latest one in this page reacts to losing the save. */
let claims = 0;
/** The Web Locks this tab claimed the save with, for asking the browser who holds it. */
let saveLocks: SaveLocks | null = null;
/**
 * Set while this tab asks the browser whether it still holds the lock, after another tab said
 * it stole it. No write starts until the answer is in.
 */
let lockCheck: Promise<void> | null = null;

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
 * can't write while frozen, and when it wakes up it learns it lost the save. Taking the
 * lock counts as asking again at that moment, so an ask from before it that arrives late
 * (as on an overloaded machine) can't make this tab hand the save straight back. The new
 * ask goes out on the channel too, so a third tab still waiting steps aside instead of
 * stealing the save in turn from a tab that would have answered it.
 *
 * That new ask can be old news (#223). Say tab b's steal goes through while b is too busy to
 * notice, and tab c, which hasn't heard from b, steals the lock from b in turn. When b
 * catches up, it says it took the save (after c did), and only then hears the lock is gone.
 * If c handed over to b's ask, as to any newer ask, neither tab would save. No tab can tell
 * that old news from a real steal, but the browser knows who holds the lock. So a tab that
 * holds it asks the browser before giving the save up to a tab that says it stole it,
 * starting no write until the answer comes, and keeps the save if the lock is still its own.
 *
 * Only a tab holding the lock writes (#198). Once a tab knows it lost the lock, nothing in
 * it starts a write again: the new owner may already have loaded the save, so a late write
 * would put this tab's older copy over newer progress. A tab knows it two ways: the lock is
 * taken from it, or the `takesAt` of an ask it heard has passed, when the asker takes the
 * save even if that news hasn't arrived (for a tab that says it stole the lock, the
 * browser's answer above decides instead). A tab can't know sooner than that, so two writes
 * can still land late: one already on its way when the lock goes, and one started before
 * the tab could hear either (say, a click handled straight after a long freeze). Only a
 * check inside IndexedDB itself could stop those (#224).
 */

/**
 * What the other-tab notice says when this tab dropped its last change on purpose. It offers
 * no export then (ElsewhereNotice.tsx): this tab's copy may be older than the other tab's,
 * so importing it there would undo progress.
 */
export const CHANGE_DROPPED =
  "Your last change in this tab wasn't saved, because the other tab took over the save first. Keep playing there.";

/**
 * What the notice says when a change couldn't be stored for any other reason: the write
 * failed, or the browser dropped the lock without another tab taking it. The notice offers
 * the change as an export then, so the player can keep it.
 */
const CHANGE_NOT_SAVED = 'Your latest change in this tab could not be saved.';

/** A write refused because this tab no longer holds the save lock. */
class SaveElsewhereError extends Error {
  override name = 'SaveElsewhereError';
  constructor() {
    super('Another tab has the save now, so this tab must not write it.');
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  );
}

/**
 * Stops this tab writing, stores what's pending if it still holds the lock, and tells the
 * player. `lockFault`: the browser dropped the lock without another tab taking it. Final
 * until reload.
 */
async function handOver(release: boolean, lockFault = false): Promise<void> {
  if (steppedAside) return;
  steppedAside = true;
  progress.update({ status: 'elsewhere' });
  let problem: string | null = null;
  try {
    // While this tab holds the lock, the new tab loads only after this write, so it gets the
    // change. Once the lock is gone, or the new tab's wait has run out, the write is refused
    // and the change dropped, on purpose. Handing it to the new owner instead isn't safe:
    // it's a whole save built on this tab's copy, which may be older than the one the new
    // owner loaded and has changed since, and two saves can't be merged without guessing. So
    // the player is told, and plays on in the tab that has the save. Only what hadn't reached
    // IndexedDB yet is lost, and finished steps go there the moment they happen
    // (saveProgressNow), so it's usually a settings change still in the autosave delay.
    await autosave?.flush();
  } catch (error) {
    if (!(error instanceof SaveElsewhereError)) {
      problem = CHANGE_NOT_SAVED;
      console.error('[ship-it] saving before handing over to the other tab failed', error);
    } else if (lockFault) {
      // Refused, but not for another tab's sake (lost() has logged the fault), so there may
      // be no other tab to play on in. The player can keep the change as an export.
      problem = CHANGE_NOT_SAVED;
    } else {
      problem = CHANGE_DROPPED;
      console.warn(
        '[ship-it] another tab took the save first, so this tab dropped its last change',
      );
    }
  }
  // Nothing in this tab may write again, not even a retry of a failed write.
  autosave = null;
  progress.update({ problem });
  devStatus.update({ save: 'elsewhere' });
  if (release) {
    holdsSave = false;
    releaseSave?.();
    releaseSave = null;
  }
}

function onTabMessage(event: { data: unknown }): void {
  // An older tab's ask arrives here too when two tabs start together. Giving it the save
  // would leave both tabs handed over, each to the other, and neither saving.
  if (steppedAside || !isAsk(event.data) || !isNewer(event.data)) return;
  // Still waiting for the lock ourselves: hand over as soon as it arrives.
  if (releaseSave === null) {
    handoverRequested = true;
    return;
  }
  // A tab that says it stole the lock may have lost it to this one since (#223).
  if (event.data.stole && saveLocks !== null) {
    checkStillHolding(saveLocks, event.data.takesAt);
    return;
  }
  // Once the asker's wait runs out, it takes the lock and may load the save, whether or not
  // this tab has let go. So no write may start here after that: not one heard too late (this
  // tab was frozen, say), nor one still queued behind a slow write when the moment passes.
  newOwnerTakesAt = event.data.takesAt;
  void handOver(true);
}

/**
 * Another tab said it stole the lock. Asks the browser whether this tab holds it all the same,
 * and steps aside only if it doesn't. Writes wait for the answer (lockCheck).
 */
function checkStillHolding(locks: SaveLocks, stolenAt: number): void {
  const claim = claims;
  const check: Promise<void> = locks.isHolding(SAVE_LOCK).then(
    (holding) => {
      if (lockCheck === check) lockCheck = null;
      // Still its own: the other tab's steal was taken from it before it knew. Keep saving.
      // An answer about an older claim from this same page changes nothing.
      if (holding || claim !== claims) return;
      holdsSave = false;
      void handOver(false);
    },
    (error: unknown) => {
      if (lockCheck === check) lockCheck = null;
      if (claim !== claims) return;
      console.error('[ship-it] could not ask the browser which tab has the save', error);
      // No answer, so believe the other tab, as for any newer ask: no write from now on.
      newOwnerTakesAt = stolenAt;
      void handOver(true);
    },
  );
  lockCheck = check;
}

/** Resolves once this tab holds the save lock (or has to go without: no Web Locks). */
function acquireSave(locks: SaveLocks | null): Promise<void> {
  if (locks === null) {
    // Without Web Locks no tab can know who saves, so every tab writes, as before.
    holdsSave = true;
    return Promise.resolve();
  }
  const claim = ++claims;
  return new Promise<void>((granted) => {
    let holding = false;
    const hold = () => {
      holding = true;
      holdsSave = true;
      granted();
      return new Promise<void>((release) => {
        releaseSave = release;
      });
    };
    // Taking the lock is asking for the save again, now. Every ask heard so far, and any
    // still on its way, was made before this moment. It may come from the tab the steal
    // just pushed out, which has stepped aside, so handing over to it would leave no tab
    // saving. Ignoring those asks is only safe if no other tab still waiting for the lock
    // takes it by stealing in turn, so this tab says it asked again: a waiting tab hears a
    // newer ask than its own and steps aside when its wait runs out.
    const holdStolen = () => {
      // It has the lock already, so its deadline for taking it is now: the tab it took the
      // lock from may hear this ask before the news of the steal, and must write nothing more.
      ownAsk = askNow(0, true);
      handoverRequested = false;
      channel?.postMessage(ownAsk);
      return hold();
    };
    const lost = (error: unknown) => {
      // A newer claim from this same page (a second startProgress) isn't another tab.
      if (claim !== claims) return;
      // Before anything else runs: a write already waiting must not start now.
      holdsSave = false;
      // Another tab's steal is the one expected way to lose it. Any other is a browser fault,
      // and still means this tab doesn't hold the lock, so it stops writing all the same.
      const stolen = isAbortError(error);
      if (!stolen) console.error('[ship-it] this tab lost the save lock', error);
      void handOver(false, !stolen);
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
        locks.request(SAVE_LOCK, { steal: true }, holdStolen).catch((stealError: unknown) => {
          if (holding) {
            lost(stealError);
            return;
          }
          console.error('[ship-it] this tab could not claim the save', stealError);
          // Web Locks failed here, so this tab saves as a browser without them would.
          holdsSave = true;
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
  holdsSave = false;
  newOwnerTakesAt = Number.POSITIVE_INFINITY;
  handoverRequested = false;
  saveLocks = coordination.locks;
  lockCheck = null;
  progress.update({ status: 'loading', save: null, problem: null });

  // Every write goes through here: changes, the store before a handover, and the load's own.
  autosave = createAutosave(
    async (save) => {
      // Another tab says it stole the lock: whether this one may write is the browser's answer.
      while (lockCheck !== null) await lockCheck;
      // Checked as each write starts, so one queued behind another can't start late.
      if (!holdsSave || Date.now() >= newOwnerTakesAt) throw new SaveElsewhereError();
      await storage.write(save);
      devStatus.update({ save: 'saved' });
    },
    {
      onError: (error) => {
        // Refused because another tab has the save: expected, and handOver tells the player.
        if (error instanceof SaveElsewhereError) return;
        devStatus.update({ save: 'error' });
        console.error('[ship-it] autosave failed; recent progress is not stored yet', error);
      },
    },
  );

  ownAsk = askNow(HANDOVER_WAIT_MS, false);
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
    const save = await storage.load(now, storeLoadedSave);
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

/**
 * How a load stores a new game, or an old save it has upgraded. It goes through the autosave
 * queue like every other write, so it passes the same check, and a handover waits for it to
 * finish before letting go of the lock.
 */
function storeLoadedSave(save: SaveData): Promise<void> {
  // Handed over mid-load: skipping loses nothing, because the tab that gets the save loads it
  // itself and stores its own new game or upgrade.
  if (autosave === null || !isSavingHere()) return Promise.resolve();
  autosave.schedule(save);
  return autosave.flush();
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
 *
 * Returns the XP the change actually paid, so a "+N XP" line shows what the save got
 * rather than working it out again (and disagreeing on replays, which pay less).
 */
export function saveProgressNow(change: (save: SaveData) => SaveData): number {
  const before = progress.get().save?.profile.xp ?? 0;
  updateSave(change);
  flushProgress().catch((error: unknown) => {
    console.error('[ship-it] saving progress failed', error);
  });
  return (progress.get().save?.profile.xp ?? before) - before;
}

/**
 * Replaces the whole save, as an import does, and stores it straight away. Resolves false,
 * changing nothing, while the save is still loading or when another tab has the save.
 */
export async function replaceSave(save: SaveData): Promise<boolean> {
  // Not while loading: the load would then show the save it read, not this one, and the
  // next change made on that would be written over this one.
  if (steppedAside || progress.get().status === 'loading') return false;
  progress.update({ status: 'ready', save, problem: null });
  autosave?.schedule(save);
  return storePending();
}

/** Writes any pending change now, e.g. when the tab is hidden or before an export. */
export async function flushProgress(): Promise<void> {
  await storePending();
}

/**
 * Writes any pending change now. False when it was refused because another tab took the
 * save first: that's expected, and handOver tells the player, so callers needn't report it.
 */
async function storePending(): Promise<boolean> {
  try {
    await autosave?.flush();
    return true;
  } catch (error) {
    if (error instanceof SaveElsewhereError) return false;
    throw error;
  }
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
