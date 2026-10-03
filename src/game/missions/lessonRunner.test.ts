import { describe, expect, it } from 'vitest';
import {
  checkOrder,
  currentCard,
  finishLessonBriefing,
  firstTryPercent,
  lessonSecondsLeft,
  moveStep,
  nextCard,
  pickOption,
  scrambledOrder,
  startLessonRun,
  starsFor,
  stepsInPlace,
  tickLesson,
  type LessonRun,
} from './lessonRunner';
import type { Lesson, OrderCard } from './lessonSchema';
import { sampleFinal, sampleLesson } from './sample.test-lesson';

const T0 = 1_000_000;

function cards(lesson: Lesson = sampleLesson): LessonRun {
  return finishLessonBriefing(startLessonRun(lesson), T0);
}

/** The right option of a pick card, by id. */
function rightOption(run: LessonRun, lesson: Lesson = sampleLesson): string {
  const card = currentCard(run, lesson);
  if (card === undefined || card.kind === 'order') throw new Error('not a pick card');
  const option = card.options.find((entry) => entry.correct);
  if (option === undefined) throw new Error('no right option');
  return option.id;
}

function wrongOption(run: LessonRun, lesson: Lesson = sampleLesson): string {
  const card = currentCard(run, lesson);
  if (card === undefined || card.kind === 'order') throw new Error('not a pick card');
  const option = card.options.find((entry) => !entry.correct);
  if (option === undefined) throw new Error('no wrong option');
  return option.id;
}

function orderCard(lesson: Lesson = sampleLesson): OrderCard {
  const card = lesson.cards.find((entry) => entry.kind === 'order');
  if (card?.kind !== 'order') throw new Error('no order card');
  return card;
}

/** Sorts an order card's steps into place with moves, the way a player would. */
function sortSteps(run: LessonRun, lesson: Lesson = sampleLesson): LessonRun {
  const card = orderCard(lesson);
  let next = run;
  card.steps.forEach((step, target) => {
    while (next.card.order.indexOf(step.id) > target) next = moveStep(next, lesson, step.id, -1);
  });
  return next;
}

/** Solves the current card, first try, whatever its kind. */
function solve(run: LessonRun, lesson: Lesson = sampleLesson): LessonRun {
  const card = currentCard(run, lesson);
  if (card?.kind === 'order') return checkOrder(sortSteps(run, lesson), lesson);
  return pickOption(run, lesson, rightOption(run, lesson));
}

/** Plays every card right on the first try. */
function playAll(lesson: Lesson = sampleLesson): LessonRun {
  let run = cards(lesson);
  lesson.cards.forEach(() => {
    run = nextCard(solve(run, lesson), lesson);
  });
  return run;
}

describe('a lesson run', () => {
  it('starts at the briefing, and the cards (and clock) start after it', () => {
    const run = startLessonRun(sampleLesson);
    expect(run.phase).toBe('briefing');
    expect(currentCard(run, sampleLesson)).toBeUndefined();
    // Nothing can be answered during the briefing.
    expect(pickOption(run, sampleLesson, 'ask-units')).toBe(run);
    const started = finishLessonBriefing(run, T0);
    expect(started).toMatchObject({ phase: 'cards', startedAtMs: T0, cardIndex: 0 });
    expect(finishLessonBriefing(started, T0 + 5)).toBe(started);
  });

  it('solves a card with a right pick, first try', () => {
    const run = pickOption(cards(), sampleLesson, 'ask-units');
    expect(run.card).toMatchObject({ solved: true, picked: ['ask-units'] });
    expect(run.firstTry).toEqual([true]);
  });

  it('keeps the card open after a wrong pick, and a later right pick is not first try', () => {
    const wrong = pickOption(cards(), sampleLesson, 'approve');
    expect(wrong.card).toMatchObject({ solved: false, picked: ['approve'] });
    expect(wrong.firstTry).toEqual([]);
    // The same wrong option can't be picked twice, and an unknown one does nothing.
    expect(pickOption(wrong, sampleLesson, 'approve')).toBe(wrong);
    expect(pickOption(wrong, sampleLesson, 'no-such-option')).toBe(wrong);
    const right = pickOption(wrong, sampleLesson, 'ask-units');
    expect(right.card.solved).toBe(true);
    expect(right.firstTry).toEqual([false]);
    // A solved card takes no more picks.
    expect(pickOption(right, sampleLesson, 'rewrite')).toBe(right);
  });

  it('only moves on from a solved card', () => {
    const open = cards();
    expect(nextCard(open, sampleLesson)).toBe(open);
    const moved = nextCard(solve(open), sampleLesson);
    expect(moved.cardIndex).toBe(1);
    expect(moved.card).toMatchObject({ picked: [], solved: false });
  });

  it('ends with every first try recorded, and 100% is three stars', () => {
    const run = playAll();
    expect(run).toMatchObject({ phase: 'done', outcome: 'finished' });
    expect(run.firstTry).toEqual([true, true, true, true, true, true]);
    expect(firstTryPercent(run, sampleLesson)).toBe(100);
    expect(starsFor(100)).toBe(3);
  });

  it('gives stars by first-try share: 3 from 90%, 2 from 60%, else 1', () => {
    expect(starsFor(90)).toBe(3);
    expect(starsFor(89)).toBe(2);
    expect(starsFor(60)).toBe(2);
    expect(starsFor(59)).toBe(1);
    expect(starsFor(0)).toBe(1);
  });
});

describe('an order card', () => {
  const card = orderCard();

  it('is never shown already in order, and is the same scramble every time', () => {
    const order = scrambledOrder(card);
    expect(order).not.toEqual(card.steps.map((step) => step.id));
    expect([...order].sort()).toEqual(card.steps.map((step) => step.id).sort());
    expect(scrambledOrder(card)).toEqual(order);
    // Even a card whose seeded shuffle lands on the answer gets turned out of order.
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const other = { ...card, id };
      expect(scrambledOrder(other)).not.toEqual(card.steps.map((step) => step.id));
    }
  });

  /** A run on the order card, the third card of the sample. */
  function atOrderCard(): LessonRun {
    let run = cards();
    for (let index = 0; index < 2; index++) run = nextCard(solve(run), sampleLesson);
    expect(currentCard(run, sampleLesson)?.kind).toBe('order');
    return run;
  }

  it('moves steps up and down, but not off either end', () => {
    const run = atOrderCard();
    const [first] = run.card.order;
    if (first === undefined) throw new Error('no steps');
    expect(moveStep(run, sampleLesson, first, -1)).toBe(run);
    const down = moveStep(run, sampleLesson, first, 1);
    expect(down.card.order[1]).toBe(first);
    expect(moveStep(run, sampleLesson, 'no-such-step', 1)).toBe(run);
    // An order move on a pick card does nothing.
    expect(moveStep(cards(), sampleLesson, first, 1).card.order).toEqual([]);
  });

  it('counts a wrong check, then solves when in order, not first try', () => {
    const run = atOrderCard();
    const wrong = checkOrder(run, sampleLesson);
    expect(wrong.card).toMatchObject({ solved: false, wrongOrders: 1 });
    expect(stepsInPlace(wrong, card)).toBeLessThan(card.steps.length);
    const sorted = sortSteps(wrong);
    expect(stepsInPlace(sorted, card)).toBe(card.steps.length);
    const solved = checkOrder(sorted, sampleLesson);
    expect(solved.card.solved).toBe(true);
    expect(solved.firstTry).toEqual([true, true, false]);
    // Once solved, the steps stay put.
    expect(moveStep(solved, sampleLesson, card.steps[0]?.id ?? '', 1)).toBe(solved);
    expect(checkOrder(solved, sampleLesson)).toBe(solved);
  });

  it('does nothing when checked on a pick card', () => {
    const run = cards();
    expect(checkOrder(run, sampleLesson)).toBe(run);
  });
});

describe("a final's shared clock", () => {
  it('has no clock on a plain lesson', () => {
    expect(lessonSecondsLeft(cards(), sampleLesson, T0 + 999_000)).toBeNull();
    const run = cards();
    expect(tickLesson(run, sampleLesson, T0 + 999_000)).toBe(run);
  });

  it('shows the full time until the cards start, then counts down', () => {
    expect(lessonSecondsLeft(startLessonRun(sampleFinal), sampleFinal, T0)).toBe(120);
    const run = cards(sampleFinal);
    expect(lessonSecondsLeft(run, sampleFinal, T0 - 500)).toBe(120);
    expect(lessonSecondsLeft(run, sampleFinal, T0 + 30_000)).toBe(90);
    expect(lessonSecondsLeft(run, sampleFinal, T0 + 500_000)).toBe(0);
  });

  it('times out at zero, counting unanswered cards as missed', () => {
    const run = nextCard(solve(cards(sampleFinal), sampleFinal), sampleFinal);
    expect(tickLesson(run, sampleFinal, T0 + 119_000)).toBe(run);
    const out = tickLesson(run, sampleFinal, T0 + 120_000);
    expect(out).toMatchObject({ phase: 'done', outcome: 'timed-out' });
    expect(firstTryPercent(out, sampleFinal)).toBe(17);
    // A finished run ignores the clock.
    expect(tickLesson(out, sampleFinal, T0 + 200_000)).toBe(out);
  });

  it('can be answered wrong too, in a final', () => {
    const run = pickOption(
      cards(sampleFinal),
      sampleFinal,
      wrongOption(cards(sampleFinal), sampleFinal),
    );
    expect(run.card.solved).toBe(false);
  });
});
