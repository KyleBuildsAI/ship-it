import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { startRun } from '../../game/missions/runner';
import { notesMission, sampleMission } from '../../game/missions/sample.test-mission';
import type { Mission } from '../../game/missions/schema';
import type { MissionActivity, SlipMet } from '../../game/play/playStore';
import type { Store } from '../../game/store';
import { MissionView } from './MissionView';

// Rendered to an HTML string, as in ActMenu.test.tsx: the real hook has no server
// snapshot, so here it just reads the store.
vi.mock('../useStore', () => ({
  useStore: <T extends object>(store: Store<T>) => store.get(),
}));

/** The Done screen for `mission`, as plain text with the markup taken out. */
function doneScreen(mission: Mission, extra: Partial<MissionActivity> = {}): string {
  const activity: MissionActivity = {
    kind: 'mission',
    attempt: 1,
    mission,
    run: { ...startRun(mission), phase: 'done' },
    hint: null,
    hintLoading: false,
    lastDrill: null,
    questionScore: null,
    freeTextGrade: null,
    xpEarned: 0,
    agent: null,
    stars: {},
    slips: [],
    scene: null,
    ...extra,
  };
  return renderToStaticMarkup(<MissionView activity={activity} checklist={[]} />)
    .replace(/<[^>]+>/g, '')
    .replaceAll('&#x27;', "'");
}

const caught: SlipMet = {
  stepId: 'notes-in-the-api',
  planId: 'bare-name',
  slip: 'wrong-place',
  caught: true,
};

describe('the Done screen', () => {
  it("counts the slips Kyle caught, and shows each directed step's stars", () => {
    const stars = { 'notes-in-the-api': { plan: false, safety: true, check: true } };
    const missed = { ...caught, caught: false };
    const text = doneScreen(notesMission, { stars, slips: [caught, missed] });
    expect(text).toContain("You caught 1 of 2 of Otto's slips.");
    expect(text).toContain('Have Otto make a notes folder inside the API project.');
    expect(text).toContain('Plan (not earned)');
    expect(text).toContain('Safety (earned)');
  });

  it('says so when no slip reached a gate or a check', () => {
    expect(doneScreen(notesMission)).toContain("None of Otto's slips reached a gate or a check.");
  });

  it('shows nothing about Otto for a typed mission', () => {
    expect(doneScreen(sampleMission)).not.toContain('Otto');
  });
});
