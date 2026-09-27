import { describe, expect, it } from 'vitest';
import type { ReviewItem } from '../save/schema';
import { addDays } from './days';
import {
  addMiss,
  applyReview,
  createReviewItem,
  dailySet,
  INITIAL_EASINESS,
  qualityFor,
  review,
  type ReviewQuality,
} from './reviewQueue';

const TODAY = '2026-09-27';

function item(drillId: string, patch: Partial<ReviewItem> = {}): ReviewItem {
  return { ...createReviewItem(drillId, TODAY), ...patch };
}

/** Reviews an item several times in a row, one review on each item's due day. */
function reviewSequence(start: ReviewItem, qualities: readonly ReviewQuality[]): ReviewItem[] {
  const history: ReviewItem[] = [];
  let current = start;
  for (const quality of qualities) {
    current = review(current, quality, current.dueOn);
    history.push(current);
  }
  return history;
}

function ids(items: readonly ReviewItem[]): string[] {
  return items.map((entry) => entry.drillId);
}

describe('qualityFor', () => {
  it('scores a correct answer in under half the time limit as 5', () => {
    expect(qualityFor(true, 10, 30)).toBe(5);
    expect(qualityFor(true, 0, 30)).toBe(5);
  });

  it('scores a slower correct answer as 4, starting at exactly half the limit', () => {
    expect(qualityFor(true, 15, 30)).toBe(4);
    expect(qualityFor(true, 29, 30)).toBe(4);
    expect(qualityFor(true, 45, 30)).toBe(4);
  });

  it('scores a wrong answer as 1, however fast', () => {
    expect(qualityFor(false, 2, 30)).toBe(1);
    expect(qualityFor(false, 60, 30)).toBe(1);
  });

  it.each([
    [10, 0],
    [10, -30],
    [-1, 30],
    [Number.NaN, 30],
    [10, Number.NaN],
  ])('rejects %s seconds against a %s second limit', (seconds, limit) => {
    expect(() => qualityFor(true, seconds, limit)).toThrow(RangeError);
  });
});

describe('createReviewItem', () => {
  it('starts a drill at default easiness, due today', () => {
    expect(createReviewItem('unstage-file', TODAY)).toEqual({
      drillId: 'unstage-file',
      easiness: INITIAL_EASINESS,
      repetitions: 0,
      intervalDays: 0,
      dueOn: TODAY,
    });
    expect(INITIAL_EASINESS).toBe(2.5);
  });

  it('rejects an invalid day', () => {
    expect(() => createReviewItem('d', '2026-02-29')).toThrow(RangeError);
  });
});

describe('review', () => {
  it('schedules passing reviews 1 day, then 6 days, then interval x easiness apart', () => {
    const [first, second, third, fourth] = reviewSequence(item('d'), [5, 5, 5, 4]);

    expect(first).toMatchObject({
      repetitions: 1,
      intervalDays: 1,
      easiness: 2.6,
      dueOn: '2026-09-28',
    });
    expect(second).toMatchObject({
      repetitions: 2,
      intervalDays: 6,
      easiness: 2.7,
      dueOn: '2026-10-04',
    });
    // round(6 x 2.7) = round(16.2) = 16
    expect(third).toMatchObject({
      repetitions: 3,
      intervalDays: 16,
      easiness: 2.8,
      dueOn: '2026-10-20',
    });
    // round(16 x 2.8) = round(44.8) = 45. A quality of 4 leaves easiness unchanged.
    expect(fourth).toMatchObject({
      repetitions: 4,
      intervalDays: 45,
      easiness: 2.8,
      dueOn: '2026-12-04',
    });
  });

  it('uses the easiness from before the review to size the new gap, as SM-2 does', () => {
    const reviewed = review(item('d', { repetitions: 2, intervalDays: 6 }), 3, TODAY);

    // round(6 x 2.5) = 15, even though easiness drops to 2.36 in the same review.
    expect(reviewed.intervalDays).toBe(15);
    expect(reviewed.easiness).toBe(2.36);
  });

  it.each([
    [5, 2.6],
    [4, 2.5],
    [3, 2.36],
    [2, 2.18],
    [1, 1.96],
    [0, 1.7],
  ] as const)('quality %s moves easiness from 2.5 to %s', (quality, easiness) => {
    expect(review(item('d'), quality, TODAY).easiness).toBe(easiness);
  });

  it('resets a failed item to tomorrow with its repetitions cleared', () => {
    const learned = item('d', { repetitions: 4, intervalDays: 45, easiness: 2.8 });

    const failed = review(learned, 1, TODAY);

    expect(failed).toEqual({
      drillId: 'd',
      repetitions: 0,
      intervalDays: 1,
      easiness: 2.26,
      dueOn: '2026-09-28',
    });
  });

  it('treats quality 2 as a fail and quality 3 as a pass', () => {
    const learned = item('d', { repetitions: 2, intervalDays: 6 });

    expect(review(learned, 2, TODAY).repetitions).toBe(0);
    expect(review(learned, 3, TODAY).repetitions).toBe(3);
  });

  it('never lets easiness fall below 1.3', () => {
    const hard = item('d', { easiness: 1.4 });

    expect(review(hard, 0, TODAY).easiness).toBe(1.3);
    expect(reviewSequence(item('d'), [0, 0, 0, 0, 0]).at(-1)?.easiness).toBe(1.3);
  });

  it('keeps easiness at two decimals with no floating-point noise', () => {
    const history = reviewSequence(item('d'), [3, 5, 3, 5, 3, 5, 3, 2, 5, 5]);

    for (const entry of history) {
      expect(Math.round(entry.easiness * 100) / 100).toBe(entry.easiness);
    }
  });

  it('always schedules at least one day ahead', () => {
    const odd = item('d', { repetitions: 3, intervalDays: 0 });

    expect(review(odd, 5, TODAY).dueOn).toBe('2026-09-28');
  });

  it('counts due days across a leap day correctly', () => {
    const reviewed = review(item('d', { repetitions: 1 }), 5, '2028-02-26');

    expect(reviewed.dueOn).toBe('2028-03-03');
  });

  it('does not modify the item it was given', () => {
    const original = item('d');
    const before = { ...original };

    review(original, 5, TODAY);

    expect(original).toEqual(before);
  });

  it('rejects an invalid day', () => {
    expect(() => review(item('d'), 5, '27/09/2026')).toThrow(RangeError);
  });
});

describe('addMiss', () => {
  it('adds a new drill, due today', () => {
    const queue = addMiss([item('a')], 'b', TODAY);

    expect(queue).toEqual([item('a'), createReviewItem('b', TODAY)]);
  });

  it('restarts a drill already in the queue but keeps its easiness', () => {
    const learned = item('a', {
      repetitions: 3,
      intervalDays: 16,
      easiness: 2.1,
      dueOn: '2026-10-10',
    });
    const other = item('b', { dueOn: '2026-09-30' });

    const queue = addMiss([learned, other], 'a', TODAY);

    expect(queue).toEqual([
      { drillId: 'a', repetitions: 0, intervalDays: 0, easiness: 2.1, dueOn: TODAY },
      other,
    ]);
  });

  it('never adds the same drill twice', () => {
    const queue = addMiss(addMiss([], 'a', TODAY), 'a', '2026-09-28');

    expect(ids(queue)).toEqual(['a']);
    expect(queue[0]?.dueOn).toBe('2026-09-28');
  });

  it('does not modify the queue it was given', () => {
    const original = [item('a', { repetitions: 2 })];

    addMiss(original, 'a', TODAY);
    addMiss(original, 'b', TODAY);

    expect(original).toEqual([item('a', { repetitions: 2 })]);
  });

  it('rejects an invalid day', () => {
    expect(() => addMiss([], 'a', 'today')).toThrow(RangeError);
  });
});

describe('applyReview', () => {
  it('reviews only the matching item', () => {
    const queue = [item('a'), item('b')];

    const updated = applyReview(queue, 'b', 5, TODAY);

    expect(updated[0]).toBe(queue[0]);
    expect(updated[1]).toEqual(review(item('b'), 5, TODAY));
  });

  it('throws for a drill that is not in the queue', () => {
    expect(() => applyReview([item('a')], 'missing', 5, TODAY)).toThrow(
      'Drill "missing" is not in the review queue.',
    );
  });
});

describe('dailySet', () => {
  it('is empty when the queue is empty', () => {
    expect(dailySet([], TODAY)).toEqual([]);
  });

  it('puts the longest-overdue items first, and counts items due today as due', () => {
    const queue = [
      item('today', { dueOn: TODAY }),
      item('last-week', { dueOn: '2026-09-20' }),
      item('yesterday', { dueOn: '2026-09-26' }),
      item('two-days', { dueOn: '2026-09-25' }),
      item('three-days', { dueOn: '2026-09-24' }),
    ];

    expect(ids(dailySet(queue, TODAY))).toEqual([
      'last-week',
      'three-days',
      'two-days',
      'yesterday',
      'today',
    ]);
  });

  it('breaks ties on the same due day with the hardest (lowest easiness) item first', () => {
    const queue = [
      item('easy', { easiness: 2.9 }),
      item('hard', { easiness: 1.3 }),
      item('medium', { easiness: 2.0 }),
      item('medium-too', { easiness: 2.0 }),
    ];

    expect(ids(dailySet(queue, TODAY, { min: 0, max: 10 }))).toEqual([
      'hard',
      'medium',
      'medium-too',
      'easy',
    ]);
  });

  it('never returns more than 10 items by default', () => {
    const queue = Array.from({ length: 14 }, (_, index) =>
      item(`d${String(index).padStart(2, '0')}`, { dueOn: addDays(TODAY, -index) }),
    );

    const set = dailySet(queue, TODAY);

    expect(set).toHaveLength(10);
    // The 10 most overdue: d13 is 13 days late, down to d04 at 4 days late.
    expect(set[0]?.drillId).toBe('d13');
    expect(set[9]?.drillId).toBe('d04');
  });

  it('tops up to 5 with the soonest upcoming items when fewer are due', () => {
    const queue = [
      item('due-1', { dueOn: '2026-09-26' }),
      item('due-2', { dueOn: TODAY }),
      item('next-month', { dueOn: '2026-10-27' }),
      item('tomorrow-easy', { dueOn: '2026-09-28', easiness: 2.8 }),
      item('tomorrow-hard', { dueOn: '2026-09-28', easiness: 1.5 }),
      item('next-week', { dueOn: '2026-10-04' }),
    ];

    expect(ids(dailySet(queue, TODAY))).toEqual([
      'due-1',
      'due-2',
      'tomorrow-hard',
      'tomorrow-easy',
      'next-week',
    ]);
  });

  it('fills the set with upcoming items when nothing is due yet', () => {
    const queue = [item('later', { dueOn: '2026-10-01' }), item('soon', { dueOn: '2026-09-28' })];

    expect(ids(dailySet(queue, TODAY))).toEqual(['soon', 'later']);
  });

  it('does not top up when at least 5 are due', () => {
    const due = Array.from({ length: 6 }, (_, index) => item(`due-${String(index)}`));
    const upcoming = item('tomorrow', { dueOn: '2026-09-28' });

    expect(ids(dailySet([...due, upcoming], TODAY))).not.toContain('tomorrow');
  });

  it('accepts custom limits', () => {
    const queue = [item('a'), item('b'), item('c'), item('later', { dueOn: '2026-10-01' })];

    expect(ids(dailySet(queue, TODAY, { min: 0, max: 2 }))).toEqual(['a', 'b']);
    expect(ids(dailySet(queue, TODAY, { min: 4, max: 4 }))).toEqual(['a', 'b', 'c', 'later']);
  });

  it('does not reorder the queue it was given', () => {
    const queue = [item('b', { dueOn: '2026-09-26' }), item('a', { dueOn: '2026-09-20' })];

    dailySet(queue, TODAY);

    expect(ids(queue)).toEqual(['b', 'a']);
  });

  it.each([
    { min: 6, max: 5 },
    { min: -1, max: 5 },
    { min: 1.5, max: 5 },
    { min: 1, max: Number.POSITIVE_INFINITY },
  ])('rejects limits %j', (limits) => {
    expect(() => dailySet([], TODAY, limits)).toThrow(RangeError);
  });

  it('rejects an invalid day', () => {
    expect(() => dailySet([], '2026-13-01')).toThrow(RangeError);
  });
});
