import { placementResult, type PlacementResult } from './grading';
import type { LessonRun } from './lessonRunner';
import type { Lesson, LessonCard } from './lessonSchema';
import { ContentError, requireLessonPlacement, type Act } from './schema';

/*
 * A lesson Act's placement test (DESIGN.md section 5, Lessons), as pure functions. It
 * borrows cards from the Act's lessons and plays them as one timed run, so it reuses the
 * lesson runner whole: the same clicks, the same shared clock as a final, the same rule
 * that only the first try counts. Only the scoring differs: 85% tests out.
 */

/** The id of an Act's placement run. It's never saved as a lesson, only as a placement. */
export function placementLessonId(act: number): string {
  return `placement-act-${String(act)}`;
}

/**
 * The placement test as a lesson the runner can play: the borrowed cards in the order the
 * Act lists them, on one clock. It's built as a final because a final is what has a clock.
 * Throws a ContentError for a card the Act's lessons don't have, which validateAct
 * catches in the tests long before a player could.
 */
export function placementLesson(act: Act, lessons: readonly Lesson[]): Lesson {
  const test = requireLessonPlacement(act);
  const cards = test.cardIds.map((id): LessonCard => {
    const card = lessons
      .filter((lesson) => lesson.id !== act.finalLessonId)
      .flatMap((lesson) => lesson.cards)
      .find((entry) => entry.id === id);
    if (card === undefined) {
      throw new ContentError(`Act ${String(act.act)}'s placement test has no card "${id}".`);
    }
    return card;
  });
  return {
    id: placementLessonId(act.act),
    act: act.act,
    title: `Act ${String(act.act)} placement test`,
    kind: 'final',
    briefing: [
      test.pitch,
      `${String(test.passPercent)}% right on the first try tests out of every lesson. No hints.`,
    ],
    cards,
    // A placement pays the test-out XP from its lessons, never XP of its own.
    xp: 0,
    timeLimitSeconds: test.timeLimitSeconds,
  };
}

/**
 * How a finished or timed-out run scores. A card never reached counts as missed, so
 * running out of time can't help the percent.
 */
export function lessonPlacementResult(
  run: LessonRun,
  lesson: Lesson,
  passPercent: number,
): PlacementResult {
  const results = lesson.cards.map((_, index) => ({ passed: run.firstTry[index] === true }));
  return placementResult(results, passPercent);
}
