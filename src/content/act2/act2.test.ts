import { describe, expect, it } from 'vitest';
import { scoreQuestionRound } from '../../game/missions/grading';
import { ActSchema, MissionSchema, type Candidate } from '../../game/missions/schema';
import { validateAct } from '../../game/missions/validateAct';
import { act2, act2Missions } from '../index';
import { act2Input, act2MissionInputs } from './act';

/** Every way to pick up to `limit` candidates, including picking none. */
function pickings(ids: readonly string[], limit: number): string[][] {
  if (limit === 0 || ids.length === 0) return [[]];
  const [first, ...rest] = ids;
  if (first === undefined) return [[]];
  const without = pickings(rest, limit);
  const withFirst = pickings(rest, limit - 1).map((picks) => [first, ...picks]);
  return [...without, ...withFirst];
}

describe('Act 2 content', () => {
  it.each(act2MissionInputs.map((mission) => [mission.id, mission] as const))(
    'mission %s parses with MissionSchema',
    (_id, mission) => {
      const result = MissionSchema.safeParse(mission);
      // Printing the issues makes a content typo readable straight from the test output.
      expect(result.success ? [] : result.error.issues).toEqual([]);
    },
  );

  it('parses with ActSchema', () => {
    const result = ActSchema.safeParse(act2Input);
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });

  it('passes validateAct with no issues', () => {
    expect(validateAct(act2, act2Missions)).toEqual([]);
  });

  it('lists the five missions from DESIGN.md section 11, in order', () => {
    expect(act2.missionIds).toEqual([
      'three-rooms',
      'reading-history',
      'good-commits',
      'ignore-list',
      'undo-everything',
    ]);
    expect(act2Missions.map((mission) => mission.act)).toEqual([2, 2, 2, 2, 2]);
  });

  it('gives every mission 3 to 6 steps and 5 to 8 drills', () => {
    for (const mission of act2Missions) {
      expect(mission.steps.length, mission.id).toBeGreaterThanOrEqual(3);
      expect(mission.steps.length, mission.id).toBeLessThanOrEqual(6);
      expect(mission.drills.length, mission.id).toBeGreaterThanOrEqual(5);
      expect(mission.drills.length, mission.id).toBeLessThanOrEqual(8);
    }
  });

  it('keeps drill time limits between 30 seconds and 3 minutes', () => {
    for (const drill of act2Missions.flatMap((mission) => mission.drills)) {
      expect(drill.timeLimitSeconds, drill.id).toBeGreaterThanOrEqual(30);
      expect(drill.timeLimitSeconds, drill.id).toBeLessThanOrEqual(180);
    }
  });

  it('draws the placement test from every mission', () => {
    const missionOf = new Map(
      act2Missions.flatMap((mission) => mission.drills.map((drill) => [drill.id, mission.id])),
    );
    const covered = new Set(act2.placementTest.drillIds.map((id) => missionOf.get(id)));
    expect([...covered].sort()).toEqual([...act2.missionIds].sort());
  });

  it('gives the boss 3:00 on the clock and its twist at 1:00', () => {
    expect(act2.boss.timeLimitSeconds).toBe(180);
    expect(act2.boss.twists.map((twist) => twist.atSecondsRemaining)).toEqual([60]);
  });
});

describe('Act 2 Question Rounds', () => {
  it.each(act2Missions.map((mission) => [mission.id, mission.questionRound] as const))(
    '%s has strong, okay, and weak candidates',
    (_id, round) => {
      const count = (quality: Candidate['quality']) =>
        round.candidates.filter((candidate) => candidate.quality === quality).length;
      expect(round.candidates.length).toBe(8);
      expect(count('strong')).toBeGreaterThanOrEqual(2);
      expect(count('okay')).toBeGreaterThanOrEqual(1);
      expect(count('weak')).toBeGreaterThanOrEqual(2);
    },
  );

  it.each(act2Missions.map((mission) => [mission.id, mission.questionRound] as const))(
    '%s scores highest when the strongest questions are picked',
    (_id, round) => {
      const { candidates, pickLimit } = round;
      const order = { strong: 0, okay: 1, weak: 2 };
      const best = [...candidates]
        .sort((a, b) => order[a.quality] - order[b.quality])
        .slice(0, pickLimit)
        .map((candidate) => candidate.id);
      const bestScore = scoreQuestionRound(best, candidates, pickLimit).score;

      const everyScore = pickings(
        candidates.map((candidate) => candidate.id),
        pickLimit,
      ).map((picks) => scoreQuestionRound(picks, candidates, pickLimit).score);
      expect(bestScore).toBe(Math.max(...everyScore));

      const weakest = candidates.filter((candidate) => candidate.quality === 'weak');
      const weakScore = scoreQuestionRound(
        weakest.slice(0, pickLimit).map((candidate) => candidate.id),
        candidates,
        pickLimit,
      ).score;
      expect(bestScore).toBeGreaterThan(weakScore);
    },
  );
});
