import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHANGE_DROPPED, progress } from '../game/progress';
import { createDefaultSave } from '../game/save/schema';
import { TEST_NOW } from '../game/save/testFixtures';
import type { Store } from '../game/store';
import { ElsewhereNotice } from './ElsewhereNotice';

// Rendered to an HTML string, as in textSizeBoxes.test.tsx: the real hook has no server
// snapshot, so here it just reads the store.
vi.mock('./useStore', () => ({
  useStore: <T extends object>(store: Store<T>) => store.get(),
}));

afterEach(() => {
  progress.update({ status: 'loading', save: null, problem: null });
});

function noticeFor(problem: string): string {
  progress.update({ status: 'elsewhere', save: createDefaultSave(TEST_NOW), problem });
  return renderToStaticMarkup(<ElsewhereNotice />);
}

describe('the notice shown when another tab has the save', () => {
  it('offers this tab’s copy to export when its last change failed to store', () => {
    const html = noticeFor('Your latest change in this tab could not be saved.');
    expect(html).toContain('Export it now to keep a copy');
    expect(html).toContain('Export save</button>');
  });

  it('offers no export for a change dropped because the other tab took the save first', () => {
    // That copy may be older than the other tab's: importing it there would undo progress.
    const html = noticeFor(CHANGE_DROPPED);
    expect(html).toContain('the other tab took over the save first. Keep playing there.</p>');
    expect(html).not.toContain('Export');
  });
});
