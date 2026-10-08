import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { directedMission, sampleMission } from '../../game/missions/sample.test-mission';
import type { SeriesActivity } from '../../game/play/playStore';
import type { Store } from '../../game/store';
import { SeriesView } from './SeriesView';

// Rendered to an HTML string, as in ActMenu.test.tsx: the real hook has no server
// snapshot, so here it just reads the store.
vi.mock('../useStore', () => ({
  useStore: <T extends object>(store: Store<T>) => store.get(),
}));

/** A review of the directed sample's judgment drills, as plain text. */
function review(extra: Partial<SeriesActivity> = {}): string {
  const activity: SeriesActivity = {
    kind: 'review',
    act: null,
    drills: directedMission.drills.slice(0, 2),
    active: null,
    results: [],
    placement: null,
    scene: null,
    ...extra,
  };
  return renderToStaticMarkup(<SeriesView activity={activity} checklist={[]} />)
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&#x27;', "'")
    .replace(/\s+/g, ' ');
}

const missed = { drillId: 'sample-predict-typo', passed: false, seconds: 9, overtime: false };

describe('judgment drills in a series', () => {
  it('shows the question card while a judgment drill is on the clock', () => {
    const text = review({ active: { index: 0, startedAtMs: Date.now() } });
    expect(text).toContain('1 of 2');
    expect(text).toContain('Otto is about to run this. What happens?');
    expect(text).not.toContain('I’m done');
  });

  it('waits for the scene before the question shows', () => {
    expect(review({ scene: { index: 0 } })).toContain('The clock starts when Otto stops.');
  });

  it('reveals the last answer before the next drill, and on the summary', () => {
    const between = review({ results: [{ ...missed, keyId: 'error' }] });
    expect(between).toContain('The right answer: An error, and Otto stays at home');
    expect(between).toContain('Start 2 of 2');
    const second = { ...missed, drillId: 'sample-diagnose-home', passed: true, keyId: 'home' };
    const done = review({ results: [missed, second] });
    expect(done).toContain('A fresh terminal stands at home.');
    expect(done).toContain('1 of 2 passed');
  });

  it("keeps a typed drill's checklist and I'm done button", () => {
    const text = review({
      drills: sampleMission.drills.slice(0, 1),
      active: { index: 0, startedAtMs: Date.now() },
    });
    expect(text).toContain('I’m done');
  });
});
