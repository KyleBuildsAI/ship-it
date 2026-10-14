import { beginDrill, endDrill } from '../../mentor/drillGuard';
import { closeTerminal } from '../hud';
import {
  checkOrder,
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
import { findLesson, getAct } from './catalog';
import { play, type LessonActivity } from './playStore';
import {
  completeLesson,
  countPlacementAttempt,
  recordPlacement,
  startMissionProgress,
} from './saveRules';

/*
 * Plays one lesson (DESIGN.md section 5.5): briefing, then cards answered by clicking,
 * then a Done screen with stars. lessonRunner.ts decides what's legal; this file keeps
 * the run in the play store and writes finished lessons to the save. A lesson never
 * touches the sandbox, so the terminal closes and the cards get the room.
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

/** Saves a lesson the moment its last card is answered, paying its XP the first time. */
function finishLesson(current: LessonActivity, run: LessonRun, nowMs: number): LessonActivity {
  const { lesson } = current;
  const firstTime = progress.get().save?.missions[lesson.id]?.completedAt == null;
  saveProgressNow((save) =>
    completeLesson(
      save,
      getAct(lesson.act).act,
      lesson,
      firstTryPercent(run, lesson),
      new Date(nowMs),
    ),
  );
  return { ...current, run, xpEarned: firstTime ? lesson.xp : 0 };
}

/**
 * Applies a rule to the run, and saves when it ends. A timed-out final isn't saved as
 * completed: it ends, and can be tried again.
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
  play.update({ activity: next });
}

/** Starts a lesson from its briefing, leaving whatever was being played. */
export function startLesson(lessonId: string): void {
  const lesson = findLesson(lessonId);
  if (lesson === undefined) throw new Error(`No lesson has the id "${lessonId}".`);
  // A No-AI Drill in progress keeps Sage quiet; a lesson doesn't, so that ends here.
  endDrill();
  // Nothing in a lesson is typed, so the terminal steps aside and the cards get the room.
  closeTerminal();
  saveProgressNow((save) => startMissionProgress(save, lesson.id));
  play.update({
    activity: { kind: 'lesson', lesson, run: startLessonRun(lesson), xpEarned: 0 },
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
  // Each attempt shows the options in a new order, so a remembered position is no answer.
  const attempts = progress.get().save?.acts[String(act)]?.placement.attempts ?? 0;
  const lesson = placementLesson(content.act, content.lessons ?? [], attempts);
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
