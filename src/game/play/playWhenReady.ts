import { progress } from '../progress';
import { createStore } from '../store';
import { startBossFight } from './bossPlay';
import { actOfDrill, actOfPart, isActLoaded, loadAct } from './catalog';
import { startFieldMission } from './fieldPlay';
import { startLesson } from './lessonPlay';
import { startMission } from './missionPlay';
import { startActPlacement } from './play';
import { startReview, todaysItems } from './seriesPlay';

/*
 * The one way a menu starts play. Menus draw from summaries, which are always here, but
 * playing needs an Act's content, which may still be downloading. So a Play button asks
 * playWhenReady, which loads every Act the request needs and only then calls its starter.
 * Buttons inside an activity (Replay, Try again) call starters directly: the activity's
 * Act has loaded already, and a loaded Act is never dropped.
 */

/** What a player pressed Play on, named by ids and Act numbers, never by content. */
export type PlayRequest =
  | { readonly kind: 'mission'; readonly id: string }
  | { readonly kind: 'lesson'; readonly id: string }
  | { readonly kind: 'placement' | 'boss' | 'field'; readonly act: number }
  | { readonly kind: 'review' };

/**
 * How a request ended. 'superseded': it did nothing, because before it could start a newer
 * click came, its menu closed, or the save wasn't ready (see startIfSaveReady).
 * 'failed': an Act it needed didn't download.
 */
export type PlayOutcome = 'started' | 'superseded' | 'failed';

export interface PendingPlay {
  /** The request whose Acts are downloading, so its button can say "Loading…". */
  readonly waiting: PlayRequest | null;
  /** The request whose download failed, so its menu can say so until the next click. */
  readonly failed: PlayRequest | null;
}

/** What the menus show about the newest click while its Acts download. */
export const pendingPlay = createStore<PendingPlay>({ waiting: null, failed: null });

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
 * Drops the request still on its way, as when its menu closes or switches Act: the player
 * has left the button they pressed, so play mustn't start behind their back.
 */
export function cancelPendingPlay(): void {
  latestTicket += 1;
  pendingPlay.update({ waiting: null, failed: null });
}

/**
 * Starts `request` once every Act it needs has loaded. When they all have (nearly always:
 * opening a menu prefetches its Act), play starts during the click itself, because an
 * async function runs straight through until its first await.
 */
export async function playWhenReady(
  request: PlayRequest,
  now: Date = new Date(),
): Promise<PlayOutcome> {
  latestTicket += 1;
  const ticket = latestTicket;
  pendingPlay.update({ waiting: null, failed: null });
  // A loop because a review's drills come from the save, which can change while an Act
  // downloads. Each round loads at least one more Act and none is ever dropped, so it ends.
  for (;;) {
    const missing = actsNeeded(request, now).filter((act) => !isActLoaded(act));
    if (missing.length === 0) return startIfSaveReady(request, now);
    pendingPlay.update({ waiting: request });
    try {
      await Promise.all(missing.map((act) => loadAct(act)));
    } catch {
      // loadAct has logged the error already. Here the player is told, unless a newer
      // click has taken over the menu since.
      if (ticket !== latestTicket) return 'superseded';
      pendingPlay.update({ waiting: null, failed: request });
      return 'failed';
    }
    // Checked after every wait, since between waits nothing else can run: the next round,
    // or the start, happens only for the newest click. A click that never waits is newest.
    if (ticket !== latestTicket) return 'superseded';
  }
}

/**
 * Calls the request's starter only while progress.status is 'ready', because play writes
 * to the save. Any other status starts nothing: 'loading' (the save isn't read yet),
 * 'elsewhere' (another tab has it) or 'failed' (it couldn't be read).
 */
function startIfSaveReady(request: PlayRequest, now: Date): PlayOutcome {
  pendingPlay.update({ waiting: null });
  if (progress.get().status !== 'ready') return 'superseded';
  start(request, now);
  return 'started';
}

/** The starters the menus' buttons called directly before Acts downloaded on demand. */
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
  }
}
