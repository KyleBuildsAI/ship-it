import { beforeEach, describe, expect, it } from 'vitest';
import {
  otherSampleAct,
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../missions/sample.test-mission';
import { createActProgress, createDefaultSave, type SaveData } from '../save/schema';
import { TEST_NOW } from '../save/testFixtures';
import { allMissions, findDrill, findMission, getAct, recommendedAct, setCatalog } from './catalog';

const other = otherSampleAct();

beforeEach(() => {
  setCatalog({
    acts: [{ act: sampleAct, missions: [sampleMission, secondMission, thirdMission] }, other],
  });
});

function withCompleted(...acts: number[]): SaveData {
  const save = createDefaultSave(TEST_NOW);
  const entries = acts.map((act) => [
    String(act),
    { ...createActProgress(), completedAt: TEST_NOW.toISOString() },
  ]);
  return { ...save, acts: Object.fromEntries(entries) as SaveData['acts'] };
}

describe('the catalog of Acts', () => {
  it('finds each Act by its number', () => {
    expect(getAct(2).act.title).toBe(sampleAct.title);
    expect(getAct(3).act.title).toBe('Other Sample');
  });

  it('says clearly when an Act is missing', () => {
    expect(() => getAct(7)).toThrow('The game has no Act 7.');
  });

  it('finds missions and drills in any Act', () => {
    expect(allMissions()).toHaveLength(6);
    expect(findMission(sampleMission.id).act).toBe(2);
    expect(findMission(`other-${sampleMission.id}`).act).toBe(3);
    const drill = sampleMission.drills[0];
    expect(drill && findDrill(`other-${drill.id}`).id).toBe(`other-${String(drill?.id)}`);
  });
});

describe('recommendedAct', () => {
  it('offers the first Act to a new player', () => {
    expect(recommendedAct(null)).toBe(2);
    expect(recommendedAct(createDefaultSave(TEST_NOW))).toBe(2);
  });

  it('moves on to the next unfinished Act', () => {
    expect(recommendedAct(withCompleted(2))).toBe(3);
  });

  it('goes back to the first Act once every Act is done', () => {
    expect(recommendedAct(withCompleted(2, 3))).toBe(2);
  });
});
