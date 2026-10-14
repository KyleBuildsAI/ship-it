import { placementResult, type PlacementResult } from './grading';
import type { LessonRun } from './lessonRunner';
import { isPickCard, type Lesson, type LessonCard } from './lessonSchema';
import { ContentError, requireLessonPlacement, type Act } from './schema';

/*
 * A lesson Act's placement test (DESIGN.md section 5, Lessons), as pure functions. It
 * borrows cards from the Act's lessons and plays them as one timed run, so it reuses the
 * lesson runner whole: the same clicks and the same shared clock as a final. Two things
 * differ, so retrying can't turn one run's answers into the next run's score: the run is
 * locked (the first answer on a card is final, and nothing says whether it was right),
 * and each attempt shows the options in a new order. 85% right tests out.
 */

/**
 * A list in an order set by `seed`: the same seed gives the same order, so a test can
 * replay it, and a new attempt number gives a new one.
 */
export function shuffledBy<T>(items: readonly T[], seed: string): T[] {
  // FNV-1a hashes the seed text into a starting number for a small LCG.
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    state = Math.imul(state ^ seed.charCodeAt(index), 16777619) >>> 0;
  }
  const next = () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state;
  };
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = next() % (index + 1);
    const a = shuffled[index];
    const b = shuffled[other];
    if (a === undefined || b === undefined) continue;
    shuffled[index] = b;
    shuffled[other] = a;
  }
  return shuffled;
}

/** A borrowed card with its options in this attempt's order. Order cards scramble anyway. */
function forAttempt(card: LessonCard, attempt: number): LessonCard {
  if (!isPickCard(card)) return card;
  return { ...card, options: shuffledBy(card.options, `${card.id}:${String(attempt)}`) };
}

/** The id of an Act's placement run. It's never saved as a lesson, only as a placement. */
export function placementLessonId(act: number): string {
  return `placement-act-${String(act)}`;
}

/**
 * The placement test as a lesson the runner can play: the borrowed cards in the order the
 * Act lists them, on one clock. It's built as a final because a final is what has a clock.
 * `attempt` (how many tries the save has counted so far) picks the options' order.
 * Throws a ContentError for a card the Act's lessons don't have, which validateAct
 * catches in the tests long before a player could.
 */
export function placementLesson(act: Act, lessons: readonly Lesson[], attempt = 0): Lesson {
  const test = requireLessonPlacement(act);
  const cards = test.cardIds.map((id): LessonCard => {
    const card = lessons
      .filter((lesson) => lesson.id !== act.finalLessonId)
      .flatMap((lesson) => lesson.cards)
      .find((entry) => entry.id === id);
    if (card === undefined) {
      throw new ContentError(`Act ${String(act.act)}'s placement test has no card "${id}".`);
    }
    return forAttempt(card, attempt);
  });
  return {
    id: placementLessonId(act.act),
    act: act.act,
    title: `Act ${String(act.act)} placement test`,
    kind: 'final',
    briefing: [
      test.pitch,
      `${String(test.passPercent)}% right tests out of the lessons these cards come from. Each card takes one answer, and you see your score at the end. No hints.`,
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
