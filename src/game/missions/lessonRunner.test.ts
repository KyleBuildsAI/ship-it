import { describe, expect, it } from 'vitest';
import {
  allCardsSolved,
  checkOrder,
  checkReview,
  currentCard,
  finishLessonBriefing,
  firstTryPercent,
  lessonSecondsLeft,
  moveStep,
  nextCard,
  pickOption,
  scrambledOrder,
  setFlagIssue,
  startLessonRun,
  starsFor,
  stepsInPlace,
  tickLesson,
  toggleFlag,
  type LessonRun,
} from './lessonRunner';
import type { ReviewFlag } from './codeReview';
import type { Lesson, OrderCard } from './lessonSchema';
import { onReviewCard, sampleReviewLesson } from './sample.test-codeReview';
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

describe('a locked run (a placement test)', () => {
  const locked = () => finishLessonBriefing(startLessonRun(sampleLesson, { locked: true }), T0);

  it('is unlocked for a lesson, so a wrong pick can be tried again', () => {
    expect(cards().locked).toBe(false);
    const wrong = pickOption(cards(), sampleLesson, wrongOption(cards()));
    expect(wrong.card.solved).toBe(false);
  });

  it('ends a pick card on its first answer, right or wrong', () => {
    const run = locked();
    const missed = pickOption(run, sampleLesson, wrongOption(run));
    expect(missed.card).toMatchObject({ solved: true, picked: [wrongOption(run)] });
    expect(missed.firstTry).toEqual([false]);
    // Nothing can be picked after that, so the right answer is never confirmed.
    expect(pickOption(missed, sampleLesson, rightOption(run))).toBe(missed);
    const hit = pickOption(run, sampleLesson, rightOption(run));
    expect(hit.firstTry).toEqual([true]);
  });

  it('ends an order card on its first check, in order or not', () => {
    let run = locked();
    for (let index = 0; index < 2; index++) {
      run = nextCard(pickOption(run, sampleLesson, rightOption(run)), sampleLesson);
    }
    const wrong = checkOrder(run, sampleLesson);
    expect(wrong.card).toMatchObject({ solved: true, wrongOrders: 0 });
    expect(wrong.firstTry).toEqual([true, true, false]);
    const right = checkOrder(sortSteps(run), sampleLesson);
    expect(right.firstTry).toEqual([true, true, true]);
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

  it('stops once every card is answered, so Finish completes even after zero', () => {
    // Every card solved a second in, and the last explanation still on screen.
    let run = cards(sampleFinal);
    for (let index = 0; index < sampleFinal.cards.length - 1; index++) {
      run = nextCard(solve(run, sampleFinal), sampleFinal);
    }
    expect(allCardsSolved(run, sampleFinal)).toBe(false);
    run = solve(run, sampleFinal);
    expect(allCardsSolved(run, sampleFinal)).toBe(true);
    // The clock passes zero while Kyle reads: the run is still his to finish.
    expect(tickLesson(run, sampleFinal, T0 + 121_000)).toBe(run);
    const done = nextCard(tickLesson(run, sampleFinal, T0 + 500_000), sampleFinal);
    expect(done).toMatchObject({ phase: 'done', outcome: 'finished' });
    expect(firstTryPercent(done, sampleFinal)).toBe(100);
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

describe('a code review card', () => {
  /*
   * The sample review card: row 3 is the dropped check (security), rows 6 and 8-10 the
   * swallowed error (error-handling), rows 4, 5 and 7 are fine. Its right comment is
   * "specific", and "vague" is wrong.
   */
  const lesson = sampleReviewLesson;
  const RIGHT: ReviewFlag[] = [
    { row: 3, issue: 'security' },
    { row: 9, issue: 'error-handling' },
  ];

  /** Flags each row and picks its problem, as a player clicks them. */
  function flag(run: LessonRun, flags: readonly ReviewFlag[]): LessonRun {
    return flags.reduce((next, { row, issue }) => {
      const flagged = toggleFlag(next, lesson, row);
      return issue === null ? flagged : setFlagIssue(flagged, lesson, row, issue);
    }, run);
  }

  const passed = () => checkReview(flag(onReviewCard(), RIGHT), lesson);

  it('starts with nothing flagged, and every other kind of card has no review', () => {
    expect(cards(lesson).card.review).toBeNull();
    expect(onReviewCard().card.review).toEqual({
      flags: [],
      check: null,
      wrongChecks: 0,
      passed: false,
    });
  });

  it('flags and unflags changed rows only, kept in row order', () => {
    const run = onReviewCard();
    const flagged = toggleFlag(toggleFlag(run, lesson, 9), lesson, 3);
    expect(flagged.card.review?.flags).toEqual([
      { row: 3, issue: null },
      { row: 9, issue: null },
    ]);
    expect(toggleFlag(flagged, lesson, 9).card.review?.flags).toEqual([{ row: 3, issue: null }]);
    // A context row, a row off the diff, and a problem for a row not flagged do nothing.
    expect(toggleFlag(run, lesson, 1)).toBe(run);
    expect(toggleFlag(run, lesson, 12)).toBe(run);
    expect(setFlagIssue(run, lesson, 3, 'security')).toBe(run);
  });

  it('checks nothing while a flag has no problem picked', () => {
    const run = toggleFlag(onReviewCard(), lesson, 3);
    expect(checkReview(run, lesson)).toBe(run);
  });

  it('counts a wrong check, keeps its verdicts, and locks the row it found', () => {
    const run = checkReview(
      flag(onReviewCard(), [
        { row: 3, issue: 'security' },
        { row: 5, issue: 'scope' },
      ]),
      lesson,
    );
    expect(run.card.review).toMatchObject({
      wrongChecks: 1,
      passed: false,
      check: {
        verdicts: [
          { row: 3, verdict: 'found' },
          { row: 5, verdict: 'fine' },
        ],
        missedBugIds: ['quiet-failure'],
      },
    });
    expect(run.card.solved).toBe(false);
    expect(toggleFlag(run, lesson, 3)).toBe(run);
    expect(setFlagIssue(run, lesson, 3, 'logic')).toBe(run);
  });

  it("clears a row's verdict when its flag changes", () => {
    const run = checkReview(
      flag(onReviewCard(), [
        { row: 3, issue: 'logic' },
        { row: 5, issue: 'scope' },
      ]),
      lesson,
    );
    const rechipped = setFlagIssue(run, lesson, 3, 'security');
    expect(rechipped.card.review?.check?.verdicts).toEqual([{ row: 5, verdict: 'fine' }]);
    const removed = toggleFlag(rechipped, lesson, 5);
    expect(removed.card.review?.check?.verdicts).toEqual([]);
    expect(removed.card.review?.flags).toEqual([{ row: 3, issue: 'security' }]);
  });

  it('opens the comments only once a check is right, and then the flags lock', () => {
    const flagged = flag(onReviewCard(), RIGHT);
    expect(pickOption(flagged, lesson, 'specific')).toBe(flagged);
    const run = passed();
    expect(run.card.review).toMatchObject({ passed: true, wrongChecks: 0 });
    expect(run.card.solved).toBe(false);
    expect(toggleFlag(run, lesson, 4)).toBe(run);
    expect(setFlagIssue(run, lesson, 9, 'logic')).toBe(run);
    expect(checkReview(run, lesson)).toBe(run);
  });

  it('is right first time only with a right first check and a right first comment', () => {
    const perfect = pickOption(passed(), lesson, 'specific');
    expect(perfect.card.solved).toBe(true);
    expect(perfect.firstTry).toEqual([true]);
    const wrongComment = pickOption(pickOption(passed(), lesson, 'vague'), lesson, 'specific');
    expect(wrongComment.card.solved).toBe(true);
    expect(wrongComment.firstTry).toEqual([false]);
    const missed = checkReview(flag(onReviewCard(), RIGHT.slice(0, 1)), lesson);
    const fixed = checkReview(flag(missed, RIGHT.slice(1)), lesson);
    expect(fixed.card.review).toMatchObject({ passed: true, wrongChecks: 1 });
    expect(pickOption(fixed, lesson, 'specific').firstTry).toEqual([false]);
  });

  it('ends on its first check in a locked run, right or wrong', () => {
    const locked = { ...onReviewCard(), locked: true };
    const wrong = checkReview(flag(locked, RIGHT.slice(0, 1)), lesson);
    expect(wrong.card.solved).toBe(true);
    expect(wrong.firstTry).toEqual([false]);
    expect(checkReview(flag(locked, RIGHT), lesson).firstTry).toEqual([true]);
  });
});
