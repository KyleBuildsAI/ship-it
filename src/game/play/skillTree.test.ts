import { describe, expect, it } from 'vitest';
import { starsFor } from '../missions/lessonRunner';
import { sampleFinal, sampleLesson, sampleLessonAct } from '../missions/sample.test-lesson';
import {
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../missions/sample.test-mission';
import {
  createDefaultSave,
  createMissionProgress,
  type DrillAttempt,
  type MissionProgress,
  type MissionStatus,
  type SaveData,
} from '../save/schema';
import { TEST_NOW } from '../save/testFixtures';
import { summarizeAct } from './actSummary';
import { recordDrill, recordReview } from './saveRules';
import {
  LESSON_MASTERY_PERCENT,
  lessonMastered,
  nodeLabel,
  nodeNote,
  skillTree,
  type SkillNode,
} from './skillTree';

// A mission Act (Act 2) and a lesson Act (Act 4), summarized as the game ships them.
const SUMMARIES = [
  summarizeAct({ act: sampleAct, missions: [sampleMission, secondMission, thirdMission] }),
  summarizeAct(sampleLessonAct()),
];
const FIRST_DRILLS = sampleMission.drills.map((drill) => drill.id);

function progressAt(status: MissionStatus, bestDrillScore: number | null = null): MissionProgress {
  return { ...createMissionProgress(), status, bestDrillScore };
}

/** A lesson left after its first card, so Play would pick it up at the second. */
const LEFT_PARTWAY: MissionProgress = {
  ...progressAt('in-progress'),
  lessonResume: {
    answered: [{ cardId: sampleLesson.cards[0]?.id ?? '', firstTry: true }],
    open: null,
  },
};

/** Attempts from a pattern like "xx.x" (x right, . a miss), taking `drillIds` in turn. */
function attempts(pattern: string, drillIds: readonly string[] = FIRST_DRILLS): DrillAttempt[] {
  return Array.from(pattern, (mark, index) => ({
    drillId: drillIds[index % drillIds.length] ?? '',
    correct: mark === 'x',
    seconds: 10,
    at: TEST_NOW.toISOString(),
  }));
}

/** One node of the sample tree, worked out from a save holding these missions and attempts. */
function nodeOf(id: string, missions: SaveData['missions'], drillHistory: DrillAttempt[] = []) {
  const nodes = skillTree(SUMMARIES, { missions, drillHistory }).flatMap((branch) => branch.nodes);
  const found = nodes.find((node) => node.id === id);
  if (found === undefined) throw new Error(`No node ${id}.`);
  return found;
}

/** The first sample mission's node, after `pattern` at its drills and with `status` saved. */
function firstMission(pattern: string, status?: MissionStatus): SkillNode {
  const missions = status === undefined ? {} : { [sampleMission.id]: progressAt(status) };
  return nodeOf(sampleMission.id, missions, attempts(pattern));
}

/** A lesson's node (the first sample lesson's by default), with `progress` saved for it. */
function lessonOf(progress?: MissionProgress, id = sampleLesson.id): SkillNode {
  return nodeOf(id, progress === undefined ? {} : { [id]: progress });
}

describe('skillTree', () => {
  it('has a branch per Act and a node per part, numbered as the Act menu numbers them', () => {
    const tree = skillTree(SUMMARIES, { missions: {}, drillHistory: [] });
    expect(tree.map(({ act, title, lit }) => `${String(act)} ${title} ${String(lit)}`)).toEqual([
      `2 ${sampleAct.title} 0`,
      '4 GitHub Team Flow (sample) 0',
    ]);
    const nodes = tree.flatMap((branch) => branch.nodes);
    expect(nodes.map((node) => `${node.number} ${node.kind}`).join(', ')).toBe(
      '2.1 mission, 2.2 mission, 2.3 mission, 4.1 lesson, 4.2 lesson, 4.3 final',
    );
    expect(nodes.every((node) => node.state === 'new' && node.status === 'available')).toBe(true);
  });
});

describe('a mission node', () => {
  it('lights at 9 of its last 10 drills right, but not at 8, nor at 9 of 9', () => {
    expect(firstMission('xxxx.xxxxx').state).toBe('lit');
    expect(firstMission('xx.xx.xxxx').state).toBe('started');
    expect(firstMission('xxxxxxxxx').state).toBe('started');
  });

  it('counts attempts from a placement test and a review alike', () => {
    let save = createDefaultSave(TEST_NOW);
    // The placement test records each drill as a mission does; a review records it too.
    for (const drill of sampleMission.drills) {
      save = recordDrill(save, drill, { passed: true, seconds: 5 }, TEST_NOW);
      save = recordReview(save, drill, { passed: true, seconds: 5 }, TEST_NOW);
    }
    expect(nodeOf(sampleMission.id, save.missions, save.drillHistory).state).toBe('lit');
  });

  it('dims after new misses, and is done once completed, even with no attempts left', () => {
    expect(firstMission('xxxxxxxxxx..').state).toBe('started');
    expect(firstMission('xxxxxxxxxx..', 'completed').state).toBe('done');
    expect(firstMission('', 'completed')).toMatchObject({ state: 'done', recent: [] });
  });

  it('ignores attempts at drills it does not own', () => {
    // A drill no build ships any more, and one of the next mission's.
    const others = attempts('xxxxxxxxxxxx', ['removed-drill', 'history-sample-init']);
    expect(nodeOf(sampleMission.id, {}, others)).toMatchObject({ state: 'new', recent: [] });
  });

  it('keeps its last 10 results, oldest first', () => {
    const recent = [true, true, true, true, false, true, true, true, false, true];
    expect(firstMission('...xxxx.xxx.x')).toMatchObject({ recent });
  });
});

describe('a lesson or final node', () => {
  it('lights at ★★★, the same 90% bar, and is done below it', () => {
    expect(starsFor(LESSON_MASTERY_PERCENT)).toBe(3);
    expect(starsFor(LESSON_MASTERY_PERCENT - 1)).toBe(2);
    expect(lessonOf(progressAt('completed', 90))).toMatchObject({ state: 'lit', stars: 3 });
    expect(lessonOf(progressAt('completed', 89))).toMatchObject({ state: 'done', stars: 2 });
  });

  it('is done when tested out, never lit; started when left partway; new with no entry', () => {
    expect(lessonOf(progressAt('tested-out'))).toMatchObject({ state: 'done', stars: 0 });
    expect(lessonMastered(progressAt('tested-out', 100))).toBe(false);
    expect(lessonOf(LEFT_PARTWAY)).toMatchObject({ state: 'started', stars: 0 });
    expect(lessonOf()).toMatchObject({ state: 'new', stars: 0 });
  });

  it('looks new, as its Act menu row does, when Play would start it over', () => {
    // Left at its briefing: in progress, with no answer kept to pick up.
    expect(lessonOf(progressAt('in-progress')).state).toBe('new');
    // A timed final never resumes, so one that ran out starts over too.
    expect(lessonOf(progressAt('in-progress'), sampleFinal.id).state).toBe('new');
  });

  it('follows the same rules for a final', () => {
    expect(lessonOf(progressAt('completed', 100), sampleFinal.id).state).toBe('lit');
    expect(lessonOf(progressAt('completed', 80), sampleFinal.id).state).toBe('done');
  });
});

describe('a branch', () => {
  it('counts its lit nodes only', () => {
    const missions = {
      [secondMission.id]: progressAt('completed'),
      [sampleLesson.id]: progressAt('completed', 90),
      [sampleFinal.id]: progressAt('completed', 70),
    };
    const tree = skillTree(SUMMARIES, { missions, drillHistory: attempts('xxxxxxxxxx') });
    expect(tree.map((branch) => branch.lit)).toEqual([1, 1]);
  });
});

describe('nodeLabel', () => {
  it('names a node as the Act menu does, a final included', () => {
    expect(nodeLabel(firstMission(''))).toBe(`2.1 ${sampleMission.title}`);
    expect(nodeLabel(lessonOf(undefined, sampleFinal.id))).toBe(`4.3 Final: ${sampleFinal.title}`);
  });
});

describe('nodeNote', () => {
  it.each([
    ['xxxx.xxxxx', undefined, 'Mastered · 9 of last 10'],
    ['xx.xx.xxxx', 'completed', '8 of last 10 · needs 9'],
    ['x', undefined, '1 try · 1 right · needs 10'],
    ['x.x', 'in-progress', '3 tries · 2 right · needs 10'],
    ['', 'completed', 'Done · no recent drills'],
    ['', 'tested-out', 'Tested out · no drills yet'],
    ['', 'in-progress', 'Started · no drills yet'],
    ['', undefined, 'Not played yet'],
  ] as const)('reads "%s" with status %s as "%s" for a mission', (pattern, status, note) => {
    expect(nodeNote(firstMission(pattern, status))).toBe(note);
  });

  it.each([
    [progressAt('completed', 90), '★★★ · Mastered'],
    [progressAt('completed', 75), '★★☆ · replay for ★★★'],
    [progressAt('completed', 40), '★☆☆ · replay for ★★★'],
    [progressAt('tested-out'), 'Tested out · play for ★★★'],
    [LEFT_PARTWAY, 'Started · not finished'],
    [progressAt('in-progress'), 'Not finished yet'],
    [undefined, 'Not played yet'],
  ])('reads %o as "%s" for a lesson', (progress, note) => {
    expect(nodeNote(lessonOf(progress))).toBe(note);
  });
});
