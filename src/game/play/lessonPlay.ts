import { endDrill } from '../../mentor/drillGuard';
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
import { progress, saveProgressNow } from '../progress';
import { findLesson, getAct } from './catalog';
import { play, type LessonActivity } from './playStore';
import { completeLesson, startMissionProgress } from './saveRules';

/*
 * Plays one lesson (DESIGN.md section 5.5): briefing, then cards answered by clicking,
 * then a Done screen with stars. lessonRunner.ts decides what's legal; this file keeps
 * the run in the play store and writes finished lessons to the save. A lesson never
 * touches the sandbox, so the terminal stays as it was.
 */

function activity(): LessonActivity | null {
  const current = play.get().activity;
  return current?.kind === 'lesson' ? current : null;
}

/**
 * Applies a rule to the run, and saves the lesson the moment its last card is answered.
 * A timed-out final isn't saved as completed: it ends, and can be tried again.
 */
function update(change: (run: LessonRun) => LessonRun, nowMs: number): void {
  const current = activity();
  if (current === null) return;
  const run = change(current.run);
  if (run === current.run) return;
  let { xpEarned } = current;
  if (run.outcome === 'finished' && current.run.outcome !== 'finished') {
    const { lesson } = current;
    const firstTime = progress.get().save?.missions[lesson.id]?.completedAt == null;
    xpEarned = firstTime ? lesson.xp : 0;
    saveProgressNow((save) =>
      completeLesson(
        save,
        getAct(lesson.act).act,
        lesson,
        firstTryPercent(run, lesson),
        new Date(nowMs),
      ),
    );
  }
  play.update({ activity: { ...current, run, xpEarned } });
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

export function endLessonBriefing(nowMs: number = Date.now()): void {
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
