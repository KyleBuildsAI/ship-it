import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hud } from '../../game/hud';
import { fullSampleLessonAct } from '../../game/missions/sample.test-lessonAct';
import { setCatalog } from '../../game/play/catalog';
import { progress } from '../../game/progress';
import { createDefaultSave } from '../../game/save/schema';
import { TEST_NOW } from '../../game/save/testFixtures';
import type { Store } from '../../game/store';
import { PlayPanel } from './PlayPanel';

// Rendered to a string, so the hook just reads the store (as in ActMenu.test.tsx).
vi.mock('../useStore', () => ({
  useStore: <T extends object>(store: Store<T>) => store.get(),
}));

afterEach(() => {
  hud.update({ actMenu: null });
});

describe('the play panel', () => {
  it('holds what it shows in the box that larger text sizes zoom', () => {
    const full = fullSampleLessonAct();
    setCatalog({ acts: [full] });
    progress.update({ status: 'ready', save: createDefaultSave(TEST_NOW), problem: null });
    hud.update({ actMenu: full.act.act });
    // theme.css zooms .play-panel__content for Large and Extra large text, never the
    // section placed on screen (panelLayout.test.ts). Without this box, those sizes would
    // change nothing in the panel.
    expect(renderToStaticMarkup(<PlayPanel />)).toMatch(
      /^<section class="glass play-panel" aria-label="Missions"><div class="play-panel__content">/,
    );
  });
});
