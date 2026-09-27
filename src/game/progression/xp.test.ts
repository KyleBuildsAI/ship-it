import { describe, expect, it } from 'vitest';
import { createActProgress } from '../save/schema';
import {
  completedActNumbers,
  nextRank,
  placementTestOutXp,
  rankFor,
  RANKS,
  TEST_OUT_XP_SHARE,
  XP_AWARDS,
} from './xp';

describe('XP_AWARDS', () => {
  it('matches the tuning agreed for the game', () => {
    expect(XP_AWARDS).toEqual({
      briefing: 10,
      simStep: 20,
      drillCorrect: 15,
      questionStrong: 10,
      questionOkay: 5,
      boss: 150,
      fieldMission: 200,
      missionComplete: 50,
    });
  });
});

describe('placementTestOutXp', () => {
  it('grants half of the Act mission XP', () => {
    expect(TEST_OUT_XP_SHARE).toBe(0.5);
    expect(placementTestOutXp([200, 300, 100])).toBe(300);
  });

  it('rounds to a whole number', () => {
    expect(placementTestOutXp([101])).toBe(51);
    expect(placementTestOutXp([100, 1, 2])).toBe(52);
  });

  it('grants nothing for an Act with no missions', () => {
    expect(placementTestOutXp([])).toBe(0);
  });

  it.each([-10, Number.NaN, Number.POSITIVE_INFINITY])('rejects mission XP of %s', (xp) => {
    expect(() => placementTestOutXp([100, xp])).toThrow(RangeError);
  });
});

describe('rankFor', () => {
  it.each([
    [[], 'Intern'],
    [[1], 'Intern'],
    [[1, 2], 'Junior'],
    [[1, 2, 3], 'Junior'],
    [[1, 2, 3, 4], 'Mid'],
    [[1, 2, 3, 4, 5], 'Mid'],
    [[1, 2, 3, 4, 5, 6], 'Senior'],
    [[1, 2, 3, 4, 5, 6, 7], 'Staff'],
    [[1, 2, 3, 4, 5, 6, 7, 8], 'Staff'],
  ])('completed Acts %j make the player %s', (acts, rank) => {
    expect(rankFor(acts)).toBe(rank);
  });

  it('goes by the highest completed Act, not how many are completed', () => {
    // Testing out of Act 4 early promotes the player even with Acts 1-3 unfinished.
    expect(rankFor([4])).toBe('Mid');
    expect(rankFor([6, 2])).toBe('Senior');
  });

  it('ignores the order Acts were completed in', () => {
    expect(rankFor([3, 1, 2])).toBe('Junior');
  });

  it.each([0, 9, -1, 2.5, Number.NaN])('rejects Act number %s', (act) => {
    expect(() => rankFor([act])).toThrow(RangeError);
  });

  it('only ever returns a known rank', () => {
    for (let act = 1; act <= 8; act += 1) {
      expect(RANKS).toContain(rankFor([act]));
    }
  });
});

describe('nextRank', () => {
  it.each([
    [[], { rank: 'Junior', unlockedByAct: 2 }],
    [[1], { rank: 'Junior', unlockedByAct: 2 }],
    [[1, 2], { rank: 'Mid', unlockedByAct: 4 }],
    [[3], { rank: 'Mid', unlockedByAct: 4 }],
    [[4], { rank: 'Senior', unlockedByAct: 6 }],
    [[5], { rank: 'Senior', unlockedByAct: 6 }],
    [[6], { rank: 'Staff', unlockedByAct: 7 }],
  ])('after completing %j, the next rank is %j', (acts, expected) => {
    expect(nextRank(acts)).toEqual(expected);
  });

  it('returns null once the player is Staff', () => {
    expect(nextRank([7])).toBeNull();
    expect(nextRank([1, 2, 3, 4, 5, 6, 7, 8])).toBeNull();
  });

  it('always points one rank above the current one', () => {
    for (let act = 0; act <= 6; act += 1) {
      const completed = act === 0 ? [] : [act];
      const next = nextRank(completed);
      expect(RANKS.indexOf(next?.rank ?? 'Intern')).toBe(RANKS.indexOf(rankFor(completed)) + 1);
    }
  });

  it('rejects invalid Act numbers', () => {
    expect(() => nextRank([10])).toThrow(RangeError);
  });
});

describe('completedActNumbers', () => {
  const done = { ...createActProgress(), completedAt: '2026-09-27T12:00:00.000Z' };

  it('lists completed Acts as numbers in order', () => {
    const acts = { '3': done, '1': done, '2': createActProgress() };

    expect(completedActNumbers(acts)).toEqual([1, 3]);
  });

  it('counts an Act the player tested out of', () => {
    const testedOut = {
      ...createActProgress(),
      placement: { attempts: 1, bestPercent: 90, testedOut: true },
    };

    expect(completedActNumbers({ '2': testedOut })).toEqual([2]);
  });

  it('returns an empty list for a new game', () => {
    expect(completedActNumbers({})).toEqual([]);
  });

  it('feeds straight into rankFor', () => {
    expect(rankFor(completedActNumbers({ '1': done, '2': done }))).toBe('Junior');
  });
});
