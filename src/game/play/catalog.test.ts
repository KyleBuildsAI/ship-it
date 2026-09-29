import { beforeEach, describe, expect, it } from 'vitest';
import {
  earlySampleAct,
  otherSampleAct,
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../missions/sample.test-mission';
import {
  createActProgress,
  createDefaultSave,
  createMissionProgress,
  type ActProgress,
  type MissionStatus,
  type SaveData,
} from '../save/schema';
import { TEST_NOW } from '../save/testFixtures';
import {
  allMissions,
  findDrill,
  findMission,
  getAct,
  hasWorkLeft,
  recommendedAct,
  setCatalog,
} from './catalog';

const finished = { act: sampleAct, missions: [sampleMission, secondMission, thirdMission] };
const other = otherSampleAct();
const early = earlySampleAct();
const EARLY_MISSION = 'early-three-rooms';

beforeEach(() => {
  setCatalog({ acts: [finished, other] });
});

function withCompleted(...acts: number[]): SaveData {
  const save = createDefaultSave(TEST_NOW);
  const entries = acts.map((act) => [
    String(act),
    { ...createActProgress(), completedAt: TEST_NOW.toISOString() },
  ]);
  return { ...save, acts: Object.fromEntries(entries) as SaveData['acts'] };
}

/** The save with each named mission set to `status`. */
function withMissions(save: SaveData, status: MissionStatus, ...ids: string[]): SaveData {
  const missions = { ...save.missions };
  for (const id of ids) missions[id] = { ...createMissionProgress(), status };
  return { ...save, missions };
}

/** The save with Act `number`'s progress changed, starting from a fresh Act. */
function withActProgress(save: SaveData, number: number, changes: Partial<ActProgress>): SaveData {
  const progress = { ...createActProgress(), ...changes };
  return { ...save, acts: { ...save.acts, [String(number)]: progress } };
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

  it('moves on from a tested-out Act, though its boss was never fought', () => {
    const testedOut = withMissions(
      createDefaultSave(TEST_NOW),
      'tested-out',
      ...sampleAct.missionIds,
    );
    const save = withActProgress(testedOut, 2, {
      placement: { attempts: 1, bestPercent: 90, testedOut: true },
      completedAt: TEST_NOW.toISOString(),
    });
    expect(recommendedAct(save)).toBe(3);
  });
});

describe('recommendedAct with an early-access Act first', () => {
  beforeEach(() => {
    setCatalog({ acts: [early, finished] });
  });

  it('offers the early-access Act to a new player', () => {
    expect(recommendedAct(null)).toBe(1);
    expect(recommendedAct(createDefaultSave(TEST_NOW))).toBe(1);
  });

  it('stays on it while a built mission is unfinished', () => {
    const save = withMissions(createDefaultSave(TEST_NOW), 'in-progress', EARLY_MISSION);
    expect(recommendedAct(save)).toBe(1);
  });

  it('moves on once every built mission is done, though the Act never completes', () => {
    const save = withMissions(createDefaultSave(TEST_NOW), 'completed', EARLY_MISSION);
    expect(save.acts['1']).toBeUndefined();
    expect(recommendedAct(save)).toBe(2);
  });

  it('comes back when the early-access Act ships another mission', () => {
    const grown = { ...early, act: { ...early.act, missionIds: [EARLY_MISSION, 'early-next'] } };
    setCatalog({ acts: [grown, finished] });
    const save = withMissions(createDefaultSave(TEST_NOW), 'completed', EARLY_MISSION);
    expect(recommendedAct(save)).toBe(1);
  });

  it('goes back to the first Act once everything built is done', () => {
    const save = withMissions(withCompleted(2), 'completed', EARLY_MISSION);
    expect(recommendedAct(save)).toBe(1);
  });
});

describe('hasWorkLeft', () => {
  const allMissionsDone = withMissions(
    createDefaultSave(TEST_NOW),
    'completed',
    ...sampleAct.missionIds,
  );

  it('counts a mission that is not done yet', () => {
    expect(hasWorkLeft(createDefaultSave(TEST_NOW), sampleAct)).toBe(true);
    const oneLeft = withMissions(allMissionsDone, 'in-progress', sampleMission.id);
    expect(hasWorkLeft(oneLeft, sampleAct)).toBe(true);
  });

  it('counts a boss that is not beaten, or a Field Mission that is not verified', () => {
    expect(hasWorkLeft(allMissionsDone, sampleAct)).toBe(true);
    const bossBeaten = withActProgress(allMissionsDone, 2, {
      bossCompletedAt: TEST_NOW.toISOString(),
    });
    expect(hasWorkLeft(bossBeaten, sampleAct)).toBe(true);
  });

  it('has nothing left once every mission, the boss, and the Field Mission are done', () => {
    const at = TEST_NOW.toISOString();
    const everything = withActProgress(allMissionsDone, 2, {
      bossCompletedAt: at,
      fieldMissionCompletedAt: at,
    });
    expect(hasWorkLeft(everything, sampleAct)).toBe(false);
  });

  it('counts a tested-out mission as done', () => {
    const save = withMissions(createDefaultSave(TEST_NOW), 'tested-out', EARLY_MISSION);
    expect(hasWorkLeft(save, early.act)).toBe(false);
  });

  it('skips the parts an early-access Act has not built, and counts them once it has', () => {
    const save = withMissions(createDefaultSave(TEST_NOW), 'completed', EARLY_MISSION);
    expect(hasWorkLeft(save, early.act)).toBe(false);
    expect(hasWorkLeft(save, { ...early.act, boss: sampleAct.boss })).toBe(true);
    expect(hasWorkLeft(save, { ...early.act, fieldMission: sampleAct.fieldMission })).toBe(true);
  });
});
