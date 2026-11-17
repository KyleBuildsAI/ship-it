import { progress } from '../progress';
import { createStore } from '../store';
import { startBossFight } from './bossPlay';
import { actOfDrill, actOfPart, isActLoaded, loadAct, prefetchAct } from './catalog';
import { startFieldMission } from './fieldPlay';
import { startLesson } from './lessonPlay';
import { startMission } from './missionPlay';
import { startActPlacement } from './play';
import { startReview, todaysItems } from './seriesPlay';

/*
 * The one way a menu starts play. Menus draw from summaries, which are always here, but
 * playing needs an Act's content, which may still be downloading. So a Play button asks
 * playWhenReady, which loads every Act the request needs and only then calls its starter.
 * Buttons inside an activity (Replay, Try again) start at once through playAgain: the
 * activity's Act has loaded already, and a loaded Act is never dropped.
 *
 * The Act menus and the Standup Board press it through PlayButton (src/ui/play). The game
 * downloads each Act on demand (src/content/lazyActs.ts), and opening a menu prefetches its
 * Act, so play nearly always starts during the press.
 */

/** What a player pressed Play on, named by ids and Act numbers, never by content. */
export type PlayRequest =
  | { readonly kind: 'mission'; readonly id: string }
  | { readonly kind: 'lesson'; readonly id: string }
  | { readonly kind: 'placement' | 'boss' | 'field'; readonly act: number }
  | { readonly kind: 'review' };

/**
 * How a request ended. 'superseded': it did nothing, because before it could start a newer
 * click came, the menu it came from closed, or the save wasn't ready (see startIfSaveReady).
 * 'failed': an Act it needed didn't download.
 */
export type PlayOutcome = 'started' | 'superseded' | 'failed';

/**
 * The menu a press came from. The Standup Board opens over the Act menu, so both can be
 * open at once, and each one shows (and on closing, drops) only its own press.
 */
export type PlayMenu = 'act-menu' | 'standup-board';

/** A press whose download failed, and the Act that didn't arrive, for the menu to name. */
export interface FailedPlay {
  readonly request: PlayRequest;
  readonly act: number;
}

export interface PendingPlay {
  /** The menu the waiting or failed press came from. Only that menu shows them. */
  readonly from: PlayMenu | null;
  /** The request whose Acts are downloading, so its button can say "Loading…". */
  readonly waiting: PlayRequest | null;
  /** The press whose download failed, so its menu can say so until the next click. */
  readonly failed: FailedPlay | null;
}

/** What the menus show about the newest click while its Acts download. */
export const pendingPlay = createStore<PendingPlay>({ from: null, waiting: null, failed: null });

/**
 * Numbers the clicks. A request keeps its number and may start or report anything only
 * while no newer click has come, so a slow download never starts play over a later click.
 */
let latestTicket = 0;

/** A request as text, so two can be compared: "mission:<id>", "boss:2", "review". */
function requestKey(request: PlayRequest): string {
  switch (request.kind) {
    case 'mission':
    case 'lesson':
      return `${request.kind}:${request.id}`;
    case 'placement':
    case 'boss':
    case 'field':
      return `${request.kind}:${String(request.act)}`;
    case 'review':
      return request.kind;
  }
}

/** Whether two requests ask for the same play, so a menu can find the button one came from. */
export function samePlayRequest(a: PlayRequest | null, b: PlayRequest): boolean {
  return a !== null && requestKey(a) === requestKey(b);
}

/**
 * The Acts that must be loaded before `request` can start. Summaries answer it, so it never
 * downloads anything. A review is planned for `now`, the day startReview will be given.
 */
export function actsNeeded(request: PlayRequest, now: Date): readonly number[] {
  switch (request.kind) {
    case 'mission':
    case 'lesson': {
      // An id no Act has needs nothing loaded, so its starter runs and says the id is unknown.
      const act = actOfPart(request.id);
      return act === undefined ? [] : [act];
    }
    case 'placement':
    case 'boss':
    case 'field':
      return [request.act];
    case 'review': {
      // todaysItems keeps only drills this build has, so each has an Act. Several drills
      // often share one, and the Set lists it once.
      const acts = todaysItems(now).flatMap((item) => actOfDrill(item.drillId) ?? []);
      return [...new Set(acts)];
    }
  }
}

/**
 * Drops the request still on its way, so play never starts behind the player's back.
 * - Named a menu (as when that menu closes or switches Act), it drops the press only if it
 *   came from there. A press from the other menu, still open, carries on.
 * - Named no menu, it drops whatever is on its way: something started play without the
 *   gate, and that newer choice must not be replaced when an old download arrives.
 */
export function cancelPendingPlay(menu?: PlayMenu): void {
  if (menu !== undefined && pendingPlay.get().from !== menu) return;
  latestTicket += 1;
  pendingPlay.update({ from: null, waiting: null, failed: null });
}

/**
 * Starts play from a button inside an activity (Start mission over, Try again, Replay). Its
 * Act has loaded already, so `starter` runs at once, with no download to wait for. That makes
 * it the player's newest choice, so it first drops a menu's press still waiting for a
 * download. The Standup Board can be open over an activity, and its review must not replace
 * the activity the player just restarted when its Act arrives.
 */
export function playAgain(starter: () => void): void {
  cancelPendingPlay();
  starter();
}

/**
 * What a menu does while it's open. Opening it starts downloading the Acts its buttons
 * need, so Play is nearly always instant. The function it returns is for when the menu
 * closes or switches Act: it drops the menu's own press still waiting for a download. A
 * menu's effect returns that function, so React runs it at the right moment.
 */
export function whileMenuOpen(menu: PlayMenu, acts: readonly number[]): () => void {
  for (const act of acts) prefetchAct(act);
  return () => {
    cancelPendingPlay(menu);
  };
}

/**
 * Starts `request`, pressed in `from`, once every Act it needs has loaded. When they all
 * have (nearly always: opening a menu prefetches its Act), play starts during the click
 * itself, because an async function runs straight through until its first await.
 */
export async function playWhenReady(
  request: PlayRequest,
  from: PlayMenu,
  now: Date = new Date(),
): Promise<PlayOutcome> {
  latestTicket += 1;
  const ticket = latestTicket;
  // A new press clears what the last one left on screen, in whichever menu.
  pendingPlay.update({ from: null, waiting: null, failed: null });
  // A loop because a review's drills come from the save, which can change while an Act
  // downloads. Each round loads at least one more Act and none is ever dropped, so it ends.
  for (;;) {
    const missing = actsNeeded(request, now).filter((act) => !isActLoaded(act));
    if (missing.length === 0) return startIfSaveReady(request, now);
    pendingPlay.update({ from, waiting: request });
    const failedAct = await firstFailedDownload(missing);
    // JavaScript runs everything between two awaits without stopping, so no other click can
    // get in between this check and the next round or the start. That makes one check after
    // each await enough. A click that never awaits is still the newest when it starts.
    if (ticket !== latestTicket) return 'superseded';
    if (failedAct !== undefined) {
      // loadAct has logged the error already. Here the player is told which Act it was.
      pendingPlay.update({ waiting: null, failed: { request, act: failedAct } });
      return 'failed';
    }
  }
}

/**
 * Downloads every Act in `acts` at once, then names the first that failed, or undefined
 * if they all arrived. It waits for all of them, even after one fails: that way the menu
 * names an Act that really failed, never one still on its way.
 */
async function firstFailedDownload(acts: readonly number[]): Promise<number | undefined> {
  const results = await Promise.allSettled(acts.map((act) => loadAct(act)));
  return acts.find((_, index) => results[index]?.status === 'rejected');
}

/**
 * Calls the request's starter only while progress.status is 'ready', because play writes
 * to the save. Any other status starts nothing: 'loading' (the save isn't read yet),
 * 'elsewhere' (another tab has it) or 'failed' (it couldn't be read).
 */
function startIfSaveReady(request: PlayRequest, now: Date): PlayOutcome {
  pendingPlay.update({ from: null, waiting: null });
  if (progress.get().status !== 'ready') return 'superseded';
  start(request, now);
  return 'started';
}

/**
 * Hands the request to the starter for its kind. The gate only decides when play starts;
 * what starting does stays in the starters, so buttons inside an activity can call them too.
 */
function start(request: PlayRequest, now: Date): void {
  // A boss's clock and a lesson's resume read the time when play starts, not when the
  // button was pressed, so a slow download doesn't eat into them.
  switch (request.kind) {
    case 'mission':
      startMission(request.id);
      return;
    case 'lesson':
      startLesson(request.id);
      return;
    case 'placement':
      startActPlacement(request.act);
      return;
    case 'boss':
      startBossFight(request.act);
      return;
    case 'field':
      startFieldMission(request.act);
      return;
    case 'review':
      // The day actsNeeded planned for, so the drills it loaded are the drills played.
      startReview(now);
      return;
    default: {
      // Every kind returned above, so TypeScript knows `request` can't be anything here
      // (its type is `never`). Add a kind to PlayRequest without a case, and this line stops
      // compiling, instead of the gate saying 'started' while nothing plays.
      const unhandled: never = request;
      throw new Error(`No starter for the play request ${JSON.stringify(unhandled)}.`);
    }
  }
}
