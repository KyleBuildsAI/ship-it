import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { sampleLessonAct } from '../../game/missions/sample.test-lesson';
import { sampleAct, sampleMission, secondMission } from '../../game/missions/sample.test-mission';
import { summarizeAct } from '../../game/play/actSummary';
import { setLazyCatalog } from '../../game/play/catalog';
import { progress } from '../../game/progress';
import { createDefaultSave, createMissionProgress } from '../../game/save/schema';
import { TEST_NOW } from '../../game/save/testFixtures';
import type { Store } from '../../game/store';
import { TrophyWall } from './TrophyWall';

// Rendered to an HTML string, as in ActMenu.test.tsx: the real hook has no server
// snapshot, so here it just reads the store.
vi.mock('../useStore', () => ({
  useStore: <T extends object>(store: Store<T>) => store.get(),
}));

describe('the Trophy Wall', () => {
  it('ticks off finished missions from the summaries, and lists no lessons', () => {
    // The loader stands in for an Act's download. The wall reads summaries only.
    const load = vi.fn(() => {
      throw new Error('The Trophy Wall must never load an Act.');
    });
    const acts = [{ act: sampleAct, missions: [sampleMission, secondMission] }, sampleLessonAct()];
    setLazyCatalog(acts.map((content) => ({ summary: summarizeAct(content), load })));
    const save = createDefaultSave(TEST_NOW);
    const done = { ...createMissionProgress(), status: 'completed' as const };
    progress.update({
      status: 'ready',
      save: { ...save, missions: { [sampleMission.id]: done } },
      problem: null,
    });
    const items = [...renderToStaticMarkup(<TrophyWall />).matchAll(/<li[^>]*>(.*?)<\/li>/g)];
    expect(items.map((match) => match[1])).toEqual([
      `✓ ${sampleMission.title}`,
      `○ ${secondMission.title}`,
    ]);
    expect(load).not.toHaveBeenCalled();
  });
});
