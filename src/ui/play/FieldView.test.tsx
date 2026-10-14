import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { fullSampleLessonAct } from '../../game/missions/sample.test-lessonAct';
import { setCatalog } from '../../game/play/catalog';
import { progress } from '../../game/progress';
import { createDefaultSave, type SaveData } from '../../game/save/schema';
import { TEST_NOW } from '../../game/save/testFixtures';
import type { Store } from '../../game/store';
import { FieldView } from './FieldView';

// Rendered to a string, so the hook just reads the store (as in ActMenu.test.tsx).
vi.mock('../useStore', () => ({
  useStore: <T extends object>(store: Store<T>) => store.get(),
}));

const full = fullSampleLessonAct();

function view(save: SaveData = createDefaultSave(TEST_NOW)): string {
  setCatalog({ acts: [full] });
  progress.update({ status: 'ready', save, problem: null });
  return renderToStaticMarkup(<FieldView activity={{ kind: 'field', act: full.act.act }} />)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('a Field Mission outside Act 2', () => {
  it('names its own repo and says plainly that no token or key is needed', () => {
    const markup = view();
    expect(markup).toContain('Field Mission: Land a Real Branch (sample)');
    expect(markup).toContain('On your real SandCastles repo');
    expect(markup).toContain('No GitHub token or API key needed');
    expect(markup).toContain('git log --oneline -3');
  });

  it('ticks a check already passed, and says when every one is verified', () => {
    const base = createDefaultSave(TEST_NOW);
    const save: SaveData = {
      ...base,
      fieldMissions: {
        'sample-full-field': {
          checklist: { 'sample-full-clean': true, 'sample-full-history': true },
          verifiedAt: TEST_NOW.toISOString(),
          githubRepo: 'kyle/sandcastles',
          githubVerifiedAt: TEST_NOW.toISOString(),
        },
      },
    };
    const markup = view(save);
    expect(markup).toContain('✓ Run git status in your repo');
    expect(markup).toContain('Verified. Real work, really done.');
    expect(markup).toContain('✓ Optional: let GitHub confirm the PR that landed it.');
  });

  it('offers the GitHub check as an extra that needs no sign-in', () => {
    const markup = view();
    expect(markup).toContain('Check on GitHub');
    expect(markup).toContain('No sign-in or token');
    expect(markup).not.toContain('✓ Optional');
  });
});
