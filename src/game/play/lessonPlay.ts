import { beginDrill, endDrill } from '../../mentor/drillGuard';
import { closeTerminal } from '../hud';
import {
  checkOrder,
  currentCard,
  finishLessonBriefing,
  firstTryPercent,
  moveStep,
  nextCard,
  pickOption,
  startLessonRun,
  tickLesson,
  type LessonRun,
} from '../missions/lessonRunner';
import { lessonPlacementResult, placementLesson } from '../missions/lessonPlacement';
import { requireLessonPlacement } from '../missions/schema';
import { progress, saveProgressNow } from '../progress';
import { beatZoneForAct } from '../world/beats';
import { zoneForAct } from '../world/zones';
import { travelTo, worldState, type ActIslandZone } from '../worldState';
import { findLesson, getAct } from './catalog';
import { lessonResumeFor, lessonResumeOf, lessonResumes, resumedLessonRun } from './lessonResume';
import { play, type Activity, type LessonActivity } from './playStore';
import {
  completeLesson,
  countPlacementAttempt,
  leftAfterTestOut,
  recordLessonResume,
  recordPlacement,
  startMissionProgress,
} from './saveRules';

/*
 * Plays one lesson (DESIGN.md section 5.5): briefing, then cards answered by clicking,
 * then a Done screen with stars. lessonRunner.ts decides what's legal; this file keeps
 * the run in the play store and writes answers and finished lessons to the save. A lesson
 * never touches the sandbox, so the terminal closes and the cards get the room.
 *
 * A lesson Act's placement test plays here too: its borrowed cards run as one timed,
 * locked lesson (one answer a card, no feedback until the score). The attempt is saved
 * when the first card shows, and the score when the run ends.
 */

function activity(): LessonActivity | null {
  const current = play.get().activity;
  return current?.kind === 'lesson' ? current : null;
}

/**
 * Saves a placement run the moment it ends, finished or timed out: either way it's an
 * attempt, and the cards never reached count as missed.
 */
function endPlacement(current: LessonActivity, run: LessonRun, nowMs: number): LessonActivity {
  const { placement, lesson } = current;
  if (placement === undefined) return { ...current, run };
  const result = lessonPlacementResult(run, lesson, placement.passPercent);
  const { act, lessons = [] } = getAct(placement.act);
  endDrill();
  saveProgressNow((save) => recordPlacement(save, act, lessons, result, new Date(nowMs)));
  return { ...current, run, placement: { ...placement, result } };
}

/**
 * Saves a lesson the moment its last card is answered. The Done screen shows the XP the
 * save actually paid: the lesson's XP the first time, the half a test-out left, or none.
 */
function finishLesson(current: LessonActivity, run: LessonRun, nowMs: number): LessonActivity {
  const { lesson } = current;
  const paid = saveProgressNow((save) =>
    completeLesson(
      save,
      getAct(lesson.act).act,
      lesson,
      firstTryPercent(run, lesson),
      new Date(nowMs),
    ),
  );
  return { ...current, run, xpEarned: paid };
}

/**
 * Whether a change added to what the resume point keeps: an answer, or a wrong try. Moving
 * an order card's steps or on to the next card adds nothing, so it saves nothing.
 */
function answersChanged(before: LessonRun, after: LessonRun): boolean {
  return (
    after.firstTry.length > before.firstTry.length ||
    after.card.picked.length > before.card.picked.length ||
    after.card.wrongOrders > before.card.wrongOrders
  );
}

/**
 * Applies a rule to the run, and saves when it ends. A timed-out final isn't saved as
 * completed: it ends, and can be tried again. An untimed lesson saves each answer as it
 * goes in, so leaving or reloading picks it up at the next card.
 */
function update(change: (run: LessonRun) => LessonRun, nowMs: number): void {
  const current = activity();
  if (current === null) return;
  const run = change(current.run);
  if (run === current.run) return;
  const ended = run.outcome !== 'running' && current.run.outcome === 'running';
  let next: LessonActivity = { ...current, run };
  if (ended && current.placement !== undefined) next = endPlacement(current, run, nowMs);
  else if (run.outcome === 'finished' && ended) next = finishLesson(current, run, nowMs);
  else if (
    current.placement === undefined &&
    lessonResumes(current.lesson) &&
    answersChanged(current.run, run)
  ) {
    const resume = lessonResumeOf(run, current.lesson);
    saveProgressNow((save) => recordLessonResume(save, current.lesson.id, resume));
  }
  play.update({ activity: next });
}

/**
 * Plays a lesson, leaving whatever was being played: from its briefing, or, for an
 * untimed lesson left partway, at its first unanswered card with its first tries kept.
 */
export function startLesson(lessonId: string, nowMs: number = Date.now()): void {
  const lesson = findLesson(lessonId);
  if (lesson === undefined) throw new Error(`No lesson has the id "${lessonId}".`);
  // A No-AI Drill in progress keeps Sage quiet; a lesson doesn't, so that ends here.
  endDrill();
  // Nothing in a lesson is typed, so the terminal steps aside and the cards get the room.
  closeTerminal();
  travelTo(zoneForAct(lesson.act));
  saveProgressNow((save) => startMissionProgress(save, lesson.id));
  const resume = lessonResumeFor(lesson, progress.get().save?.missions[lesson.id]);
  const run = resume === null ? startLessonRun(lesson) : resumedLessonRun(lesson, resume, nowMs);
  play.update({
    activity: { kind: 'lesson', lesson, run, xpEarned: 0 },
    checklist: [],
  });
}

/**
 * Starts a lesson Act's placement test from its briefing. Like a mission placement test,
 * it's a No-AI Drill: Sage stays quiet until it ends.
 */
export function startLessonPlacement(act: number): void {
  const content = getAct(act);
  const test = requireLessonPlacement(content.act);
  const { save } = progress.get();
  const lessons = content.lessons ?? [];
  // Each attempt shows the options in a new order, so a remembered position is no answer.
  const attempts = save?.acts[String(act)]?.placement.attempts ?? 0;
  // The briefing says what a pass would leave, read from the save, never a done part.
  const left = leftAfterTestOut(save, content.act, lessons);
  const lesson = placementLesson(content.act, lessons, attempts, left);
  endDrill();
  closeTerminal();
  beginDrill(`placement:${lesson.id}`);
  play.update({
    activity: {
      kind: 'lesson',
      lesson,
      run: startLessonRun(lesson, { locked: true }),
      xpEarned: 0,
      placement: { act, passPercent: test.passPercent, result: null },
    },
    checklist: [],
  });
}

/**
 * Ends the briefing and shows the first card. For a placement test, that's when the
 * attempt counts: from here a run left partway, or lost to a reload, is still a try.
 */
export function endLessonBriefing(nowMs: number = Date.now()): void {
  const current = activity();
  if (current?.placement !== undefined && current.run.phase === 'briefing') {
    const { act } = current.placement;
    saveProgressNow((save) => countPlacementAttempt(save, act));
  }
  update((run) => finishLessonBriefing(run, nowMs), nowMs);
}

export function answerLesson(optionId: string, nowMs: number = Date.now()): void {
  const lesson = activity()?.lesson;
  if (lesson !== undefined) update((run) => pickOption(run, lesson, optionId), nowMs);
}

export function moveLessonStep(
  stepId: string,
  direction: -1 | 1,
  nowMs: number = Date.now(),
): void {
  const lesson = activity()?.lesson;
  if (lesson !== undefined) update((run) => moveStep(run, lesson, stepId, direction), nowMs);
}

export function checkLessonOrder(nowMs: number = Date.now()): void {
  const lesson = activity()?.lesson;
  if (lesson !== undefined) update((run) => checkOrder(run, lesson), nowMs);
}

/** Next card, or the Done screen (and the save) after the last one. */
export function nextLessonCard(nowMs: number = Date.now()): void {
  const lesson = activity()?.lesson;
  if (lesson !== undefined) update((run) => nextCard(run, lesson), nowMs);
}

/** Called on a timer: runs a final's shared clock down, and ends the run at zero. */
export function lessonTick(nowMs: number = Date.now()): void {
  const lesson = activity()?.lesson;
  if (lesson !== undefined) update((run) => tickLesson(run, lesson, nowMs), nowMs);
}

/** The beat the screen asks for: the briefing's while it's read, then each card's once answered. */
interface WantedBeat {
  readonly key: string;
  readonly zone: ActIslandZone;
  readonly id: string;
}

function wantedBeat(current: Activity | null): WantedBeat | null {
  // A placement test gives no hints. Its cards are borrowed with their beats, and many of
  // those act out the right answer for anyone standing on the island.
  if (current?.kind !== 'lesson' || current.placement !== undefined) return null;
  const { lesson, run } = current;
  const zone = beatZoneForAct(lesson.act);
  // A card's scene waits for its answer. Many scenes act out the very thing the card asks
  // ("what will merging do?"), so played with the question they would hand over the
  // answer, and a final's stars would measure watching the island, not understanding.
  const id =
    run.phase === 'briefing'
      ? lesson.briefingBeat
      : run.card.solved
        ? currentCard(run, lesson)?.beat
        : undefined;
  if (zone === null || id === undefined) return null;
  // The key names the screen, not the beat, so the next card replays a repeated beat.
  return { key: `${lesson.id}/${run.phase}/${String(run.cardIndex)}`, zone, id };
}

/**
 * Keeps worldState.beat in step with the lesson on screen (DESIGN.md section 5.5, lesson
 * scenes), so the island can act out each card without this code touching three.js. Any
 * way a lesson ends, finished, left, or replaced by another activity, clears the beat.
 * Called once at startup; returns a stop function.
 */
export function watchLessonBeats(): () => void {
  let shownKey: string | null = null;
  let nonce = 0;
  const sync = () => {
    const wanted = wantedBeat(play.get().activity);
    if ((wanted?.key ?? null) === shownKey) return;
    shownKey = wanted?.key ?? null;
    if (wanted === null) {
      worldState.update({ beat: null });
      return;
    }
    nonce += 1;
    worldState.update({ beat: { zone: wanted.zone, id: wanted.id, nonce } });
  };
  sync();
  return play.subscribe(sync);
}
