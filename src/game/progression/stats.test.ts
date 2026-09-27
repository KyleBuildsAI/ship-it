import { describe, expect, it } from 'vitest';
import { DRILL_HISTORY_LIMIT, type DrillAttempt, type Profile } from '../save/schema';
import {
  averageSeconds,
  drillAccuracy,
  MASTERY_ACCURACY,
  MASTERY_ATTEMPTS,
  masteredConcept,
  practiceDayCount,
  recordDrillAttempt,
  recordPractice,
} from './stats';

const AT = '2026-09-27T12:00:00.000Z';

function attempt(drillId: string, correct: boolean, seconds = 10): DrillAttempt {
  return { drillId, correct, seconds, at: AT };
}

/** A history built from a pattern like "xx.x", where x is correct and . is a miss. */
function attempts(drillId: string, pattern: string): DrillAttempt[] {
  return Array.from(pattern, (mark) => attempt(drillId, mark === 'x'));
}

function profileWithDays(practiceDays: string[]): Profile {
  return { xp: 0, createdAt: AT, practiceDays };
}

describe('drillAccuracy', () => {
  it('is null with no attempts, rather than a discouraging 0%', () => {
    expect(drillAccuracy([])).toBeNull();
    expect(drillAccuracy([], 10)).toBeNull();
  });

  it('is the share of correct attempts, from 0 to 1', () => {
    expect(drillAccuracy(attempts('d', 'xx.x'))).toBe(0.75);
    expect(drillAccuracy(attempts('d', 'xxxx'))).toBe(1);
    expect(drillAccuracy(attempts('d', '....'))).toBe(0);
  });

  it('can look at only the most recent attempts', () => {
    const history = attempts('d', '....xxxx');

    expect(drillAccuracy(history, 4)).toBe(1);
    expect(drillAccuracy(history, 8)).toBe(0.5);
  });

  it('uses the whole history when lastN is larger than it', () => {
    expect(drillAccuracy(attempts('d', 'x.'), 50)).toBe(0.5);
  });

  it.each([0, -1, 2.5])('rejects lastN of %s', (lastN) => {
    expect(() => drillAccuracy(attempts('d', 'x'), lastN)).toThrow(RangeError);
  });
});

describe('averageSeconds', () => {
  it('is null with no attempts', () => {
    expect(averageSeconds([])).toBeNull();
  });

  it('averages the time over every attempt, right or wrong', () => {
    const history = [attempt('a', true, 10), attempt('b', false, 20), attempt('c', true, 45)];

    expect(averageSeconds(history)).toBe(25);
  });

  it('keeps fractions of a second', () => {
    expect(averageSeconds([attempt('a', true, 1.5), attempt('a', true, 2)])).toBe(1.75);
  });
});

describe('recordDrillAttempt', () => {
  it('adds the attempt at the end without modifying the original history', () => {
    const history = [attempt('a', true)];

    const updated = recordDrillAttempt(history, attempt('b', false));

    expect(updated.map((entry) => entry.drillId)).toEqual(['a', 'b']);
    expect(history).toHaveLength(1);
  });

  it(`keeps only the newest ${String(DRILL_HISTORY_LIMIT)} attempts`, () => {
    const full = Array.from({ length: DRILL_HISTORY_LIMIT }, (_, index) =>
      attempt(`old-${String(index)}`, true),
    );

    const updated = recordDrillAttempt(full, attempt('newest', true));

    expect(updated).toHaveLength(DRILL_HISTORY_LIMIT);
    expect(updated[0]?.drillId).toBe('old-1');
    expect(updated.at(-1)?.drillId).toBe('newest');
  });
});

describe('practiceDayCount', () => {
  it('counts practice days, and is 0 for a new player', () => {
    expect(practiceDayCount(profileWithDays([]))).toBe(0);
    expect(practiceDayCount(profileWithDays(['2026-09-01', '2026-09-27']))).toBe(2);
  });
});

describe('recordPractice', () => {
  it('adds a new day', () => {
    const updated = recordPractice(profileWithDays(['2026-09-25']), '2026-09-27');

    expect(updated.practiceDays).toEqual(['2026-09-25', '2026-09-27']);
  });

  it('counts a second session on the same day once, and returns the same object', () => {
    const profile = profileWithDays(['2026-09-25', '2026-09-27']);

    const updated = recordPractice(profile, '2026-09-27');

    expect(updated).toBe(profile);
    expect(practiceDayCount(updated)).toBe(2);
  });

  it('keeps the days sorted even when a day arrives out of order', () => {
    const updated = recordPractice(profileWithDays(['2026-09-20', '2026-09-27']), '2026-09-24');

    expect(updated.practiceDays).toEqual(['2026-09-20', '2026-09-24', '2026-09-27']);
  });

  it('never punishes a gap: missed days simply do not count', () => {
    const updated = recordPractice(profileWithDays(['2026-01-01']), '2026-09-27');

    expect(practiceDayCount(updated)).toBe(2);
  });

  it('accepts leap days and rejects impossible ones', () => {
    expect(recordPractice(profileWithDays([]), '2024-02-29').practiceDays).toEqual(['2024-02-29']);
    expect(() => recordPractice(profileWithDays([]), '2026-02-29')).toThrow(RangeError);
  });

  it('keeps the rest of the profile and leaves the original untouched', () => {
    const profile = { ...profileWithDays([]), xp: 120 };

    const updated = recordPractice(profile, '2026-09-27');

    expect(updated.xp).toBe(120);
    expect(profile.practiceDays).toEqual([]);
  });
});

describe('masteredConcept', () => {
  const conceptDrills = ['stage-file', 'stage-all'];

  it('uses 90% over the last 10 attempts, per DESIGN.md', () => {
    expect(MASTERY_ATTEMPTS).toBe(10);
    expect(MASTERY_ACCURACY).toBe(0.9);
  });

  it('is mastered at exactly 9 of the last 10 correct', () => {
    expect(masteredConcept(attempts('stage-file', 'xxxx.xxxxx'), conceptDrills)).toBe(true);
  });

  it('is not mastered at 8 of the last 10', () => {
    expect(masteredConcept(attempts('stage-file', 'xx.xx.xxxx'), conceptDrills)).toBe(false);
  });

  it('is not mastered with fewer than 10 attempts, even if all are correct', () => {
    expect(masteredConcept(attempts('stage-file', 'xxxxxxxxx'), conceptDrills)).toBe(false);
    expect(masteredConcept([], conceptDrills)).toBe(false);
  });

  it('only looks at the most recent 10, so early misses stop counting', () => {
    const history = attempts('stage-file', '.....xxxxxxxxxx');

    expect(masteredConcept(history, conceptDrills)).toBe(true);
  });

  it('can be lost again after new misses', () => {
    const history = attempts('stage-file', 'xxxxxxxxxx..');

    expect(masteredConcept(history, conceptDrills)).toBe(false);
  });

  it('pools every drill of the concept and ignores other concepts', () => {
    const history = [
      ...attempts('stage-file', 'xxxxx'),
      ...attempts('unrelated', '..........'),
      ...attempts('stage-all', 'xxxx.'),
    ];

    expect(masteredConcept(history, conceptDrills)).toBe(true);
    expect(masteredConcept(history, ['unrelated'])).toBe(false);
  });

  it('is never mastered for a concept with no drills', () => {
    expect(masteredConcept(attempts('stage-file', 'xxxxxxxxxx'), [])).toBe(false);
  });
});
