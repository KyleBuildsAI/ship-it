import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleLesson, sampleLessonAct } from '../missions/sample.test-lesson';
import {
  earlySampleAct,
  otherSampleAct,
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../missions/sample.test-mission';
import { ContentError } from '../missions/schema';
import {
  createActProgress,
  createDefaultSave,
  createMissionProgress,
  type ActProgress,
  type MissionStatus,
  type SaveData,
} from '../save/schema';
import { TEST_NOW } from '../save/testFixtures';
import { summarizeAct } from './actSummary';
import {
  actOfDrill,
  actOfPart,
  actSummaries,
  ActNotLoadedError,
  allMissions,
  drillPrompt,
  findAct,
  findActSummary,
  findDrill,
  findMission,
  getAct,
  hasWorkLeft,
  isActLoaded,
  knownDrillIds,
  loadAct,
  prefetchAct,
  recommendedAct,
  setCatalog,
  setLazyCatalog,
  type ActContent,
} from './catalog';

const finished = { act: sampleAct, missions: [sampleMission, secondMission, thirdMission] };
const other = otherSampleAct();
const early = earlySampleAct();
const EARLY_MISSION = 'early-three-rooms';
const firstDrill = sampleMission.drills[0];
if (firstDrill === undefined) throw new Error('The sample mission needs a drill.');

beforeEach(() => {
  setCatalog({ acts: [finished, other] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A catalog entry as the game will have it: the summary now, the content when asked. */
function lazy(content: ActContent, load = () => Promise.resolve(content)) {
  return { summary: summarizeAct(content), load: vi.fn(load) };
}

/** loadAct logs a failed download; this counts those calls and keeps them out of the output. */
function captureConsoleError() {
  return vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

describe('setCatalog', () => {
  it('has every Act loaded already, with a summary of each', async () => {
    expect(isActLoaded(2)).toBe(true);
    expect(isActLoaded(3)).toBe(true);
    expect(actSummaries()).toEqual([summarizeAct(finished), summarizeAct(other)]);
    await expect(loadAct(3)).resolves.toBe(other);
  });

  it('puts an Act’s free-play sandbox on its summary', () => {
    const freePlay = { steps: [], notice: 'Nothing here is graded.' };
    setCatalog({ acts: [{ ...finished, freePlay }] });
    expect(findActSummary(2)?.freePlay).toBe(freePlay);
  });
});

describe('setLazyCatalog', () => {
  it('has every summary straight away and loads nothing', () => {
    const entries = [lazy(finished), lazy(other)];
    setLazyCatalog(entries);
    expect(actSummaries().map(({ act }) => act.title)).toEqual([sampleAct.title, 'Other Sample']);
    expect(findActSummary(3)?.parts).toHaveLength(3);
    expect(findActSummary(7)).toBeUndefined();
    expect(isActLoaded(2)).toBe(false);
    for (const entry of entries) expect(entry.load).not.toHaveBeenCalled();
  });

  it('downloads an Act once, however many ask for it at the same time', async () => {
    const entries = [lazy(finished), lazy(other)];
    setLazyCatalog(entries);
    const first = loadAct(2);
    expect(loadAct(2)).toBe(first);
    await expect(first).resolves.toBe(finished);
    expect(isActLoaded(2)).toBe(true);
    await expect(loadAct(2)).resolves.toBe(finished);
    expect(entries[0]?.load).toHaveBeenCalledTimes(1);
    expect(entries[1]?.load).not.toHaveBeenCalled();
  });

  it('forgets a failed download, so the next call tries again', async () => {
    const error = captureConsoleError();
    const load = vi
      .fn<() => Promise<ActContent>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(() => {
        throw new Error('no such file');
      })
      .mockResolvedValue(finished);
    setLazyCatalog([{ summary: summarizeAct(finished), load }]);
    await expect(loadAct(2)).rejects.toThrow('offline');
    expect(isActLoaded(2)).toBe(false);
    // A loader that throws before it returns a promise fails the same way, not mid-call.
    await expect(loadAct(2)).rejects.toThrow('no such file');
    await expect(loadAct(2)).resolves.toBe(finished);
    expect(load).toHaveBeenCalledTimes(3);
    // One log for each of the two failed downloads.
    expect(error).toHaveBeenCalledTimes(2);
  });

  it('logs a failed download once, however many callers share it', async () => {
    const error = captureConsoleError();
    setLazyCatalog([lazy(finished, () => Promise.reject(new Error('offline')))]);
    const first = loadAct(2);
    const second = loadAct(2);
    await expect(first).rejects.toThrow('offline');
    await expect(second).rejects.toThrow('offline');
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('[ship-it] Act 2 did not load', expect.any(Error));
  });

  it('refuses content for a different Act than the one asked for', async () => {
    const error = captureConsoleError();
    setLazyCatalog([lazy(finished, () => Promise.resolve(other))]);
    await expect(loadAct(2)).rejects.toThrow(ContentError);
    expect(isActLoaded(2)).toBe(false);
    expect(isActLoaded(3)).toBe(false);
    expect(error).toHaveBeenCalledOnce();
  });

  it('says clearly when the game has no such Act', async () => {
    const error = captureConsoleError();
    setLazyCatalog([lazy(finished)]);
    await expect(loadAct(7)).rejects.toThrow('The game has no Act 7.');
    expect(error).toHaveBeenCalledOnce();
  });

  it('drops a download that finishes after the catalog was replaced', async () => {
    setLazyCatalog([lazy(finished)]);
    const stale = loadAct(2);
    setLazyCatalog([lazy(finished)]);
    await stale;
    expect(isActLoaded(2)).toBe(false);
  });
});

describe('prefetchAct', () => {
  it('starts the download that a later loadAct shares', async () => {
    const entry = lazy(finished);
    setLazyCatalog([entry]);
    prefetchAct(2);
    expect(entry.load).toHaveBeenCalledTimes(1);
    await loadAct(2);
    expect(entry.load).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an Act the game doesn’t ship, like a roadmap tab', () => {
    const entry = lazy(finished);
    setLazyCatalog([entry]);
    expect(() => {
      prefetchAct(7);
    }).not.toThrow();
    expect(entry.load).not.toHaveBeenCalled();
  });

  it('logs one failure when a menu’s prefetch and a click share the download', async () => {
    const error = captureConsoleError();
    setLazyCatalog([lazy(finished, () => Promise.reject(new Error('offline')))]);
    // React's StrictMode runs a menu's effect twice in dev, so a menu prefetches twice.
    prefetchAct(2);
    prefetchAct(2);
    // The player clicks Play before the download finishes, so the click joins it.
    await expect(loadAct(2)).rejects.toThrow('offline');
    expect(error).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith('[ship-it] Act 2 did not load', expect.any(Error));
    expect(isActLoaded(2)).toBe(false);
  });
});

describe('summary lookups', () => {
  beforeEach(() => {
    // Lazy, with loaders that must not run: every lookup here reads summaries only.
    const refuse = () => Promise.reject(new Error('a summary lookup loaded an Act'));
    setLazyCatalog([lazy(finished, refuse), lazy(other, refuse), lazy(sampleLessonAct(), refuse)]);
  });

  it('finds the Act a mission, lesson or drill belongs to', () => {
    expect(actOfPart(sampleMission.id)).toBe(2);
    expect(actOfPart(`other-${sampleMission.id}`)).toBe(3);
    expect(actOfPart(sampleLesson.id)).toBe(4);
    expect(actOfPart('nothing')).toBeUndefined();
    expect(actOfDrill(firstDrill.id)).toBe(2);
    expect(actOfDrill(`other-${firstDrill.id}`)).toBe(3);
    expect(actOfDrill('nothing')).toBeUndefined();
  });

  it('knows every drill id and prompt', () => {
    const drills = [...finished.missions, ...other.missions].flatMap((mission) => mission.drills);
    expect(knownDrillIds()).toEqual(new Set(drills.map((drill) => drill.id)));
    expect(drillPrompt(firstDrill.id)).toBe(firstDrill.prompt);
    expect(drillPrompt('removed-in-a-later-build')).toBeUndefined();
  });
});

describe('the old getters on a lazy catalog', () => {
  it('throw ActNotLoadedError until the Act loads, then find it', async () => {
    setLazyCatalog([lazy(finished), lazy(other)]);
    expect(() => getAct(2)).toThrow(ActNotLoadedError);
    expect(() => allMissions()).toThrow(ActNotLoadedError);
    expect(findAct(7)).toBeUndefined();
    await loadAct(2);
    expect(getAct(2)).toBe(finished);
    // Every mission means every Act, and Act 3 is still waiting.
    expect(() => findMission(sampleMission.id)).toThrow("Act 3 isn't loaded.");
    await loadAct(3);
    expect(findMission(`other-${sampleMission.id}`).act).toBe(3);
    expect(findDrill(firstDrill.id).prompt).toBe(firstDrill.prompt);
  });

  it('point at the fix when an Act is missing', () => {
    const error = new ActNotLoadedError(5);
    expect(error.act).toBe(5);
    expect(error.name).toBe('ActNotLoadedError');
    expect(error.message).toContain('playWhenReady');
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
