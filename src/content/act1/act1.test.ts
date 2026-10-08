import { describe, expect, it } from 'vitest';
import { isJudgmentDrill } from '../../game/missions/schema';
import { validateAct } from '../../game/missions/validateAct';
import { act1, act1Missions } from './index';

const mission = act1Missions[0];
if (mission === undefined) throw new Error('Act 1 has no mission');

describe('Act 1', () => {
  it('parses, ships Mission 1.1 in early access, and passes validateAct', () => {
    expect(act1.earlyAccess).toBe(true);
    expect(act1.missionIds).toEqual(['where-things-live']);
    expect(act1.upcoming).toHaveLength(5);
    expect(validateAct(act1, act1Missions)).toEqual([]);
  });
});

describe('Mission 1.1, Where Things Live, as a directed mission', () => {
  it('has 3-5 steps, every one directed, and pauses Otto before deletes', () => {
    expect(mission.approvals).toBe('destructive');
    expect(mission.steps.length).toBeGreaterThanOrEqual(3);
    expect(mission.steps.length).toBeLessThanOrEqual(5);
    for (const step of mission.steps) expect(step.agent, step.id).toBeDefined();
  });

  it('has 5-8 judgment drills of at least 3 kinds, each 30-60 seconds', () => {
    const drills = mission.drills.filter(isJudgmentDrill);
    expect(drills).toHaveLength(mission.drills.length);
    expect(drills.length).toBeGreaterThanOrEqual(5);
    expect(drills.length).toBeLessThanOrEqual(8);
    expect(new Set(drills.map((drill) => drill.kind)).size).toBeGreaterThanOrEqual(3);
    for (const drill of drills) {
      expect(drill.id.startsWith('wtl-'), drill.id).toBe(true);
      expect(drill.timeLimitSeconds).toBeGreaterThanOrEqual(30);
      expect(drill.timeLimitSeconds).toBeLessThanOrEqual(60);
    }
  });

  it('gives the Question Round strong, okay and weak questions', () => {
    const qualities = new Set(mission.questionRound.candidates.map((entry) => entry.quality));
    expect([...qualities].sort()).toEqual(['okay', 'strong', 'weak']);
  });
});
