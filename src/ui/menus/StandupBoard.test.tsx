import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleAct, sampleMission } from '../../game/missions/sample.test-mission';
import { setCatalog } from '../../game/play/catalog';
import { reviewItemsToday } from '../../game/play/seriesPlay';
import { startProgress } from '../../game/progress';
import { localDay } from '../../game/progression/days';
import { createReviewItem } from '../../game/progression/reviewQueue';
import { createDefaultSave } from '../../game/save/schema';
import type { Store } from '../../game/store';
import { StandupBoard } from './StandupBoard';

// Rendered to an HTML string, as in ActMenu.test.tsx: the real hook has no server
// snapshot, so here it just reads the store.
vi.mock('../useStore', () => ({
  useStore: <T extends object>(store: Store<T>) => store.get(),
}));

function board(): string {
  return renderToStaticMarkup(<StandupBoard />)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('the Standup Board', () => {
  beforeEach(async () => {
    setCatalog({ acts: [{ act: sampleAct, missions: [sampleMission] }] });
    const now = new Date();
    // Ten drills a later build removed, more overdue than the one real drill.
    const removed = Array.from({ length: 10 }, (_, index) =>
      createReviewItem(`removed-drill-${String(index)}`, '2026-01-01'),
    );
    const save = {
      ...createDefaultSave(now),
      reviewQueue: [...removed, createReviewItem('sample-init', localDay(now))],
    };
    await startProgress({ load: () => Promise.resolve(save), write: () => Promise.resolve() }, now);
  });

  it('lists the same drills the Act menu counts and the review plays', () => {
    const text = board();
    expect(reviewItemsToday(new Date())).toBe(1);
    expect(text).toContain('1 due today · 1 in today’s set');
    expect(text).not.toContain('removed-drill');
  });
});
