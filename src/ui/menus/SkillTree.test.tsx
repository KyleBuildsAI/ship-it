import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  sampleFinal,
  sampleLesson,
  sampleLessonAct,
  sampleSecondLesson,
} from '../../game/missions/sample.test-lesson';
import {
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from '../../game/missions/sample.test-mission';
import { summarizeAct } from '../../game/play/actSummary';
import { setLazyCatalog } from '../../game/play/catalog';
import {
  createActProgress,
  createDefaultSave,
  createMissionProgress,
  type DrillAttempt,
  type MissionProgress,
  type SaveData,
} from '../../game/save/schema';
import { TEST_NOW } from '../../game/save/testFixtures';
import type { Mission } from '../../game/missions/schema';
import { SkillTree } from './SkillTree';

// The loader stands in for an Act's download. The tree reads summaries only.
const load = vi.fn(() => {
  throw new Error('The skill tree must never load an Act.');
});

beforeEach(() => {
  load.mockClear();
  const acts = [
    { act: sampleAct, missions: [sampleMission, secondMission, thirdMission] },
    sampleLessonAct(),
  ];
  setLazyCatalog(acts.map((content) => ({ summary: summarizeAct(content), load })));
});

function completed(bestDrillScore: number | null = null): MissionProgress {
  return { ...createMissionProgress(), status: 'completed', bestDrillScore };
}

/** Attempts at `mission`'s drills from a pattern like "xx.x" (x right, . a miss). */
function attempts(mission: Mission, pattern: string): DrillAttempt[] {
  return Array.from(pattern, (mark, index) => ({
    drillId: mission.drills[index % mission.drills.length]?.id ?? '',
    correct: mark === 'x',
    seconds: 10,
    at: TEST_NOW.toISOString(),
  }));
}

/**
 * A save with a node in every state. Act 2: 2.1 and 2.2 lit by their drills, 2.3 done
 * with two tries. Act 4: 4.1 done at ★★☆, 4.2 lit at ★★★, the final new.
 */
function mixedSave(): SaveData {
  return {
    ...createDefaultSave(TEST_NOW),
    missions: {
      [thirdMission.id]: completed(),
      [sampleLesson.id]: completed(75),
      [sampleSecondLesson.id]: completed(90),
    },
    drillHistory: [
      ...attempts(sampleMission, 'xxxx.xxxxx'),
      ...attempts(secondMission, 'xxxxxxxxxx'),
      ...attempts(thirdMission, 'x.'),
    ],
  };
}

/** Each Act's row, as `<details …>…</details>` markup. */
function branchesOf(markup: string): string[] {
  return [...markup.matchAll(/<details[^>]*>.*?<\/details>/g)].map(([branch]) => branch);
}

/** Each node row's state and text, from its class and its label and note. */
function rowsOf(markup: string): string[] {
  return [...markup.matchAll(/<li class="skill-node skill-node--(\w+)">(.*?)<\/li>/g)].map(
    ([, state = '', row = '']) => `${state}: ${row.replace(/<[^>]+>/g, ' ').trim()}`,
  );
}

describe('the skill tree', () => {
  it('draws a row per Act from the summaries, and never loads one', () => {
    const markup = renderToStaticMarkup(<SkillTree save={createDefaultSave(TEST_NOW)} />);
    expect(markup).toContain('aria-label="Skill tree"');
    expect(markup).toContain('A mission lights at 9 of its last 10 drills right.');
    const branches = branchesOf(markup);
    expect(branches).toHaveLength(2);
    expect(branches[0]).toContain(`Act 2 · ${sampleAct.title}`);
    expect(branches[0]).toContain('0 of 3 lit');
    expect(branches[1]).toContain('Act 4 · GitHub Team Flow (sample)');
    expect(load).not.toHaveBeenCalled();
  });

  it('starts with only the recommended Act open', () => {
    const fresh = branchesOf(
      renderToStaticMarkup(<SkillTree save={createDefaultSave(TEST_NOW)} />),
    );
    expect(fresh.map((branch) => branch.includes('open=""'))).toEqual([true, false]);
    // With Act 2 complete, the recommended Act moves on to Act 4, and so does the open row.
    const save = createDefaultSave(TEST_NOW);
    const act2 = { ...createActProgress(), completedAt: TEST_NOW.toISOString() };
    const later = branchesOf(
      renderToStaticMarkup(<SkillTree save={{ ...save, acts: { ...save.acts, '2': act2 } }} />),
    );
    expect(later.map((branch) => branch.includes('open=""'))).toEqual([false, true]);
  });

  it('shows each node lit, done or new, with its note', () => {
    const markup = renderToStaticMarkup(<SkillTree save={mixedSave()} />);
    expect(rowsOf(markup)).toEqual([
      `lit: 2.1 ${sampleMission.title} Mastered · 9 of last 10`,
      `lit: 2.2 ${secondMission.title} Mastered · 10 of last 10`,
      `done: 2.3 ${thirdMission.title} 2 tries · 1 right · needs 10`,
      `done: 4.1 ${sampleLesson.title} ★★☆ · replay for ★★★`,
      `lit: 4.2 ${sampleSecondLesson.title} ★★★ · Mastered`,
      `new: 4.3 Final: ${sampleFinal.title} Not played yet`,
    ]);
    const [act2, act4] = branchesOf(markup);
    expect(act2).toContain('2 of 3 lit');
    expect(act4).toContain('1 of 3 lit');
  });

  it("marks each row's dot with its state, and draws the final's as a diamond", () => {
    const markup = renderToStaticMarkup(<SkillTree save={mixedSave()} />);
    const dots = [...markup.matchAll(/<li[^>]*><span class="(skill-dot[^"]*)"/g)];
    expect(dots.map(([, dot]) => dot)).toEqual([
      'skill-dot skill-dot--lit',
      'skill-dot skill-dot--lit',
      'skill-dot skill-dot--done',
      'skill-dot skill-dot--done',
      'skill-dot skill-dot--lit',
      'skill-dot skill-dot--new skill-dot--final',
    ]);
  });
});
