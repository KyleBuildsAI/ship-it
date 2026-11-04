import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sampleAct, sampleMission } from '../../game/missions/sample.test-mission';
import { summarizeAct } from '../../game/play/actSummary';
import { setCatalog, setLazyCatalog } from '../../game/play/catalog';
import { cancelPendingPlay, pendingPlay } from '../../game/play/playWhenReady';
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
    .replaceAll('&#x27;', "'")
    .replace(/\s+/g, ' ');
}

/** The board's own button (the other is ×, which closes it), and whether it's disabled. */
function startButton(): string {
  const markup = renderToStaticMarkup(<StandupBoard />);
  const button = /<button[^>]*play-button[^>]*>(.*?)<\/button>/.exec(markup);
  if (button === null) throw new Error('The board has no Start review button.');
  return button[0].includes('disabled') ? `${button[1] ?? ''}, disabled` : (button[1] ?? '');
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

describe('the Standup Board with no Act content loaded', () => {
  // The loader stands in for an Act's download. The board reads summaries only.
  const load = vi.fn(() => {
    throw new Error('The Standup Board must never load an Act.');
  });
  const [first, second] = sampleMission.drills;
  if (first === undefined || second === undefined) throw new Error('Two drills are needed.');

  beforeEach(async () => {
    setLazyCatalog([
      { summary: summarizeAct({ act: sampleAct, missions: [sampleMission] }), load },
    ]);
    const now = new Date();
    const save = {
      ...createDefaultSave(now),
      reviewQueue: [first.id, 'removed-drill', second.id].map((id) =>
        createReviewItem(id, localDay(now)),
      ),
    };
    await startProgress({ load: () => Promise.resolve(save), write: () => Promise.resolve() }, now);
  });

  afterEach(() => {
    cancelPendingPlay();
    expect(load).not.toHaveBeenCalled();
  });

  it('lists each drill by the prompt in its summary, and leaves a removed one out', () => {
    const text = board();
    expect(text).toContain(`${first.prompt} Due ${second.prompt} Due`);
    expect(text).not.toContain('removed-drill');
  });

  it('says Loading… on Start review, and keeps it from a second press, while Acts download', () => {
    expect(startButton()).toBe('Start review');
    pendingPlay.update({ from: 'standup-board', waiting: { kind: 'review' } });
    expect(startButton()).toBe('Loading…, disabled');
  });

  it("names the Act that didn't load when Start review fails, and lets the player retry", () => {
    expect(board()).not.toContain("didn't load");
    pendingPlay.update({ from: 'standup-board', failed: { kind: 'review' } });
    // The review's drills come from the sample Act 2, which hasn't loaded.
    expect(board()).toContain(
      "Act 2 didn't load. Check SHIP IT is still running, then try again. " +
        'If it keeps failing, reload the page; your progress is saved.',
    );
    expect(startButton()).toBe('Start review');
  });

  it('shows neither Loading… nor an alert for a press made in an Act menu', () => {
    const before = renderToStaticMarkup(<StandupBoard />);
    pendingPlay.update({ from: 'act-menu', waiting: { kind: 'review' } });
    expect(renderToStaticMarkup(<StandupBoard />)).toBe(before);
    pendingPlay.update({ waiting: null, failed: { kind: 'review' } });
    expect(renderToStaticMarkup(<StandupBoard />)).toBe(before);
  });
});
