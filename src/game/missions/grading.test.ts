import { describe, expect, it } from 'vitest';
import {
  InvalidPicksError,
  placementResult,
  scoreDrill,
  scoreQuestionRound,
  type DrillScore,
} from './grading';
import { sampleMission } from './sample.test-mission';

describe('scoreDrill', () => {
  it('passes a correct state inside the time limit', () => {
    expect(scoreDrill(true, 42.5, 90)).toEqual({ passed: true, seconds: 42.5, overtime: false });
    expect(scoreDrill(true, 90, 90)).toEqual({ passed: true, seconds: 90, overtime: false });
  });

  it('misses a wrong state, however fast', () => {
    expect(scoreDrill(false, 3, 90)).toEqual({ passed: false, seconds: 3, overtime: false });
  });

  it('misses a right answer that came too late, but says why', () => {
    expect(scoreDrill(true, 91, 90)).toEqual({ passed: false, seconds: 91, overtime: true });
  });

  it('marks a wrong answer as overtime too, when time also ran out', () => {
    expect(scoreDrill(false, 120, 90)).toEqual({ passed: false, seconds: 120, overtime: true });
  });

  it('never reports negative time from a clock that went backwards', () => {
    expect(scoreDrill(true, -2, 90).seconds).toBe(0);
  });
});

describe('scoreQuestionRound', () => {
  const { candidates } = sampleMission.questionRound;

  it('scores strong 2, okay 1, weak 0, out of 2 per pick', () => {
    const result = scoreQuestionRound(['when-lost', 'how-many', 'rewrite'], candidates, 3);
    expect(result.score).toBe(3);
    expect(result.max).toBe(6);
    expect(result.perPick).toEqual([
      {
        id: 'when-lost',
        quality: 'strong',
        rationale: 'Pins down the failure, so you fix the real bug instead of a guess.',
      },
      {
        id: 'how-many',
        quality: 'okay',
        rationale: 'Useful for priority, but it does not change what to build.',
      },
      {
        id: 'rewrite',
        quality: 'weak',
        rationale: 'Jumps to a big answer before knowing the question.',
      },
    ]);
  });

  it('allows fewer picks than the limit, keeping the same maximum', () => {
    expect(scoreQuestionRound(['done-means'], candidates, 3)).toMatchObject({ score: 2, max: 6 });
    expect(scoreQuestionRound([], candidates, 3)).toEqual({ score: 0, max: 6, perPick: [] });
  });

  it('refuses picks the UI should never have allowed', () => {
    expect(() =>
      scoreQuestionRound(['when-lost', 'how-many', 'rewrite', 'deadline'], candidates, 3),
    ).toThrow(InvalidPicksError);
    expect(() => scoreQuestionRound(['rewrite', 'rewrite'], candidates, 3)).toThrow(
      'The same question was picked twice.',
    );
    expect(() => scoreQuestionRound(['made-up'], candidates, 3)).toThrow(
      'No candidate question "made-up".',
    );
  });
});

describe('placementResult', () => {
  const results = (passed: number, total: number): DrillScore[] =>
    Array.from({ length: total }, (_, index) => ({
      passed: index < passed,
      seconds: 10,
      overtime: false,
    }));

  it('tests out at 85% or better', () => {
    expect(placementResult(results(17, 20))).toEqual({ percent: 85, testedOut: true });
    expect(placementResult(results(12, 12))).toEqual({ percent: 100, testedOut: true });
    expect(placementResult(results(9, 12))).toEqual({ percent: 75, testedOut: false });
  });

  it('decides on the exact score, not the rounded one', () => {
    // 11 of 13 is 84.6%: shown as 85, but still short of the bar.
    expect(placementResult(results(11, 13))).toEqual({ percent: 85, testedOut: false });
  });

  it('treats an empty test as not passed instead of dividing by zero', () => {
    expect(placementResult([])).toEqual({ percent: 0, testedOut: false });
  });

  it('accepts a different bar', () => {
    expect(placementResult(results(1, 2), 50).testedOut).toBe(true);
  });
});
