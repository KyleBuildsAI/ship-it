import { describe, expect, it } from 'vitest';
import { sampleFinal, sampleLesson, sampleLessonAct } from '../missions/sample.test-lesson';
import {
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../missions/sample.test-mission';
import {
  createMissionProgress,
  type DrillAttempt,
  type MissionProgress,
  type SaveData,
} from '../save/schema';
import { TEST_NOW } from '../save/testFixtures';
import { summarizeAct } from '../play/actSummary';
import { skillTree } from '../play/skillTree';
import { portalShare, portalShares } from './portalShare';

// A mission Act (Act 2: three missions) and a lesson Act (Act 4: two lessons and a final).
const SUMMARIES = [
  summarizeAct({ act: sampleAct, missions: [sampleMission, secondMission, thirdMission] }),
  summarizeAct(sampleLessonAct()),
];
const BOTH_OPEN = new Set([2, 4]);

function completed(bestDrillScore: number): MissionProgress {
  return { ...createMissionProgress(), status: 'completed', bestDrillScore };
}

/** Ten attempts at the first sample mission's drills, from a pattern like "xxxx.xxxxx". */
function attempts(pattern: string): DrillAttempt[] {
  const drillIds = sampleMission.drills.map((drill) => drill.id);
  return Array.from(pattern, (mark, index) => ({
    drillId: drillIds[index % drillIds.length] ?? '',
    correct: mark === 'x',
    seconds: 10,
    at: TEST_NOW.toISOString(),
  }));
}

/** Each Act's pips, worked out the way the Campus does: from the skill tree of this save. */
function pipsFor(
  save: Pick<SaveData, 'missions' | 'drillHistory'>,
  openActs: ReadonlySet<number> = BOTH_OPEN,
) {
  const shares = portalShares(skillTree(SUMMARIES, save), openActs);
  return Object.fromEntries([...shares].map(([act, share]) => [act, share.pips]));
}

describe('portalShares', () => {
  it('gives each Act one dark pip per part on a fresh save', () => {
    expect(pipsFor({ missions: {}, drillHistory: [] })).toEqual({
      2: [false, false, false],
      4: [false, false, false],
    });
  });

  it("lights the pip of each lit node, in its Act's play order", () => {
    const save = {
      // The second lesson is left alone; the first and the final finish at ★★★.
      missions: { [sampleLesson.id]: completed(100), [sampleFinal.id]: completed(90) },
      // 9 of the last 10 right at the first mission's drills masters it.
      drillHistory: attempts('xxxx.xxxxx'),
    };
    expect(pipsFor(save)).toEqual({ 2: [true, false, false], 4: [true, false, true] });
  });

  it('keeps a done part dark until its node is lit', () => {
    const save = {
      missions: {
        [secondMission.id]: completed(100),
        [sampleLesson.id]: completed(80),
        [sampleFinal.id]: { ...createMissionProgress(), status: 'tested-out' as const },
      },
      drillHistory: [],
    };
    expect(pipsFor(save)).toEqual({ 2: [false, false, false], 4: [false, false, false] });
  });

  it('darkens a mission pip again when new misses dim its node', () => {
    const history = attempts('xxxxxxxxxx..');
    // 10 of the last 10 right: the first mission's pip is lit.
    const lit = pipsFor({ missions: {}, drillHistory: history.slice(0, 10) });
    expect(lit[2]).toEqual([true, false, false]);
    // Two misses later the last 10 hold 8 right, under the bar, so the same pip goes dark.
    const dimmed = pipsFor({ missions: {}, drillHistory: history });
    expect(dimmed[2]).toEqual([false, false, false]);
  });

  it("shows no pips on a locked Act's portal, so it never looks like it has progress", () => {
    const save = { missions: { [sampleLesson.id]: completed(100) }, drillHistory: [] };
    expect(pipsFor(save, new Set([2]))).toEqual({ 2: [false, false, false], 4: [] });
  });
});

describe('portalShare', () => {
  it("gives a branch's pips in play order, and none while its Act is locked", () => {
    const [, lessons] = skillTree(SUMMARIES, {
      missions: { [sampleLesson.id]: completed(100), [sampleFinal.id]: completed(95) },
      drillHistory: [],
    });
    expect(portalShare(lessons, false)).toEqual({ pips: [true, false, true] });
    expect(portalShare(lessons, true)).toEqual({ pips: [] });
  });

  it('shows nothing for an Act the game does not ship', () => {
    expect(portalShare(undefined, false)).toEqual({ pips: [] });
  });
});
