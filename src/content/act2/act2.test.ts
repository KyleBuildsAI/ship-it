import { describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { scoreQuestionRound } from '../../game/missions/grading';
import { answerKey } from '../../game/missions/judgment';
import {
  ActSchema,
  isJudgmentDrill,
  MissionSchema,
  type Candidate,
  type JudgmentDrill,
} from '../../game/missions/schema';
import { validateAct } from '../../game/missions/validateAct';
import { completeLesson, recordPlacement } from '../../game/play/saveRules';
import { createDefaultSave } from '../../game/save/schema';
import { act2, act2Lessons, act2Missions } from '../index';
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
    expect(validateAct(act2, act2Missions, act2Lessons)).toEqual([]);
  });

  it('lists the five missions from DESIGN.md section 11, in order, then the final', () => {
    expect(act2.missionIds).toEqual([
      'three-rooms',
      'reading-history',
      'good-commits',
      'ignore-list',
      'undo-everything',
      'dirty-tree',
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
    expect([...covered].sort()).toEqual(act2Missions.map((mission) => mission.id).sort());
  });

  it('tests out by clicking: every placement drill is a judgment drill, of mixed kinds', () => {
    const byId = new Map(
      act2Missions.flatMap((mission) => mission.drills.map((drill) => [drill.id, drill])),
    );
    const drills = act2.placementTest.drillIds.map((id) => byId.get(id));
    // A typed drill would open the terminal; Act 2 is directed, so none may be typed.
    const judged = drills.filter(
      (drill): drill is JudgmentDrill => drill !== undefined && isJudgmentDrill(drill),
    );
    expect(judged).toHaveLength(drills.length);
    const kinds = new Set(judged.map((drill) => drill.kind));
    expect([...kinds].sort()).toEqual(['approve', 'diagnose', 'fix', 'predict']);
    // One approve to allow and one to deny, so "always deny" can't pass.
    const approveKeys = judged
      .filter((drill) => drill.kind === 'approve')
      .map((drill) => answerKey(drill, testDeps())[0]);
    expect(approveKeys).toContain('allow');
    expect(approveKeys).toContain('deny');
  });
});

describe("Act 2's final, The Dirty Tree", () => {
  const NOW = new Date('2026-10-14T12:00:00.000Z');
  const [final] = act2Lessons;

  it('is the one lesson, a timed final played last, in place of a boss fight', () => {
    expect(act2Lessons).toHaveLength(1);
    expect(final?.kind).toBe('final');
    expect(act2.finalLessonId).toBe(final?.id);
    expect(act2.missionIds.at(-1)).toBe(final?.id);
    expect(act2.boss).toBeUndefined();
    // The clock is a challenge, not a sprint: at least 40 seconds for every card.
    const seconds = final?.timeLimitSeconds ?? 0;
    expect(seconds / (final?.cards.length ?? 1)).toBeGreaterThanOrEqual(40);
  });

  it('asks what Kyle tells Otto more than once, and ends with an order card', () => {
    const cards = final?.cards ?? [];
    expect(cards.filter((card) => card.kind === 'prompt').length).toBeGreaterThanOrEqual(2);
    expect(cards.at(-1)?.kind).toBe('order');
  });

  it('records the boss as beaten when it is finished', () => {
    if (final === undefined) throw new Error('Act 2 has no final.');
    const save = completeLesson(createDefaultSave(NOW), act2, final, 100, NOW);
    expect(save.acts['2']?.bossCompletedAt).toBe(NOW.toISOString());
  });

  it('still completes the Act at once when the drill placement test is passed', () => {
    // A drill test proves every mission, so it skips the final and the Field Mission, as
    // Act 2's placement always has. Only a card test leaves the Field Mission to do.
    const passed = recordPlacement(
      createDefaultSave(NOW),
      act2,
      act2Missions,
      { percent: 100, testedOut: true },
      NOW,
    );
    expect(passed.acts['2']?.completedAt).toBe(NOW.toISOString());
    expect(passed.missions['dirty-tree']).toBeUndefined();
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
