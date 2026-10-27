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

/**
 * How many of `total` cards a pass needs. A percent rounds up to whole cards, so 85% of
 * 12 is 11, not 10: saying the count keeps "85%" from promising two misses.
 */
export function cardsToPass(total: number, passPercent: number): number {
  return Math.ceil((total * passPercent) / 100);
}

/** A guessing rule that ignores the question: always pick the option at this length rank. */
export interface LengthStrategy {
  /** Counted from the longest option (`longest`, 1 = longest) or the shortest. */
  readonly from: 'longest' | 'shortest';
  readonly rank: number;
  /** How many pick cards this rule answers right. */
  readonly right: number;
}

/**
 * Where the right option sits by length on one card, counted from both ends, or null when
 * its length ties another option's, since then no length rule can single it out.
 */
function rightLengthRanks(options: readonly { text: string; correct: boolean }[]) {
  const right = options.find((option) => option.correct);
  if (right === undefined) return null;
  const length = right.text.length;
  if (options.filter((option) => option.text.length === length).length > 1) return null;
  return {
    longest: 1 + options.filter((option) => option.text.length > length).length,
    shortest: 1 + options.filter((option) => option.text.length < length).length,
  };
}

/**
 * The best a player could score on these cards by never reading them: always picking the
 * longest option, or the second longest, or the shortest, and so on. Writers make right
 * answers longer without meaning to, because the right answer needs the detail. A
 * placement test hides its feedback, so a length habit like that is the one clue left, and
 * stars count only a lesson's first tries, so validateAct keeps the best rule here to half
 * the pick cards at most, in the placement test and in every lesson and final.
 */
export function bestLengthStrategy(cards: readonly LessonCard[]): LengthStrategy | null {
  const counts = new Map<string, LengthStrategy>();
  for (const card of cards.filter(isPickCard)) {
    const ranks = rightLengthRanks(card.options);
    if (ranks === null) continue;
    for (const from of ['longest', 'shortest'] as const) {
      const key = `${from}:${String(ranks[from])}`;
      const right = (counts.get(key)?.right ?? 0) + 1;
      counts.set(key, { from, rank: ranks[from], right });
    }
  }
  let best: LengthStrategy | null = null;
  for (const strategy of counts.values()) {
    if (best === null || strategy.right > best.right) best = strategy;
  }
  return best;
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
      `Get ${String(cardsToPass(cards.length, test.passPercent))} of ${String(cards.length)} right (${String(test.passPercent)}%), so ${missesAllowed(cards.length, test.passPercent)}, to test out of the lessons these cards come from. Each card takes one answer, and you see your score at the end. No hints.`,
      // Cards can be guessed and a Field Mission can't, so testing out never skips it.
      ...(act.fieldMission === undefined
        ? []
        : [
            `The Field Mission, "${act.fieldMission.title}", still needs doing on your real repo before the Act is complete.`,
          ]),
    ],
    cards,
    // A placement pays the test-out XP from its lessons, never XP of its own.
    xp: 0,
    timeLimitSeconds: test.timeLimitSeconds,
  };
}

/**
 * The pass mark in misses, since a percent hides how strict it is: 85% of 12 cards is 11,
 * so one miss, not the two "85%" seems to allow.
 */
export function missesAllowed(cardCount: number, passPercent: number): string {
  // Whole numbers only, so 100 * 12 * 0.85 can't round to 10.2 and allow a miss too many.
  const misses = Math.floor((cardCount * (100 - passPercent)) / 100);
  const of = `of ${String(cardCount)}`;
  if (misses === 0) return `answer all ${String(cardCount)} right`;
  return misses === 1 ? `miss at most one ${of}` : `miss at most ${String(misses)} ${of}`;
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
