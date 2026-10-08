import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { startDrill, startRun, submitAnsweredDrill } from '../../game/missions/runner';
import {
  directedMission,
  notesMission,
  sampleMission,
} from '../../game/missions/sample.test-mission';
import { isJudgmentDrill, type Mission } from '../../game/missions/schema';
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

/** The drills phase of the directed sample, whose drills are all judgment drills. */
function drillsScreen(extra: Partial<MissionActivity> = {}, onClock = false): string {
  const drills = { ...startRun(directedMission), phase: 'drills' as const };
  const activity: MissionActivity = {
    kind: 'mission',
    attempt: 1,
    mission: directedMission,
    run: onClock ? startDrill(drills, directedMission, 0, Date.now()) : drills,
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
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&#x27;', "'")
    .replace(/\s+/g, ' ');
}

describe('judgment drills in a mission', () => {
  it('says the drills are about judging Otto, not recall', () => {
    expect(drillsScreen()).toContain('judge what Otto does');
  });

  it('shows the question card, with no "I’m done", while the drill is on the clock', () => {
    const text = drillsScreen({}, true);
    expect(text).toContain('Otto is about to run this. What happens?');
    expect(text).toContain('Drill 1 of 5');
    expect(text).not.toContain('I’m done');
  });

  it('waits for the scene before the question shows', () => {
    const text = drillsScreen({ scene: { index: 0 } });
    expect(text).toContain('The clock starts when Otto stops.');
    expect(text).not.toContain('Start drill');
  });

  it('reveals the last answer, with its explanation, before the next drill', () => {
    const lastDrill = {
      drillId: 'sample-predict-typo',
      passed: false,
      seconds: 9,
      overtime: false,
      keyId: 'error',
    };
    const text = drillsScreen({ lastDrill });
    expect(text).toContain('Missed');
    expect(text).toContain('quilwork is misspelled');
    expect(text).toContain('Start drill 1');
  });
});

describe('the last drill of a mission', () => {
  it('reveals the final judgment drill above the Question Round', () => {
    // Every drill played through the runner as a miss: the last answer moves the run on.
    let run: MissionActivity['run'] = { ...startRun(directedMission), phase: 'drills' };
    directedMission.drills.forEach((_drill, index) => {
      run = submitAnsweredDrill(
        startDrill(run, directedMission, index, 0),
        directedMission,
        false,
        6_000,
      );
    });
    const last = run.drillResults.at(-1);
    const final = directedMission.drills.at(-1);
    if (last === undefined || final === undefined || !isJudgmentDrill(final)) {
      throw new Error('the directed sample ends with a judgment drill');
    }
    expect(run.phase).toBe('question');
    const text = drillsScreen({ run, lastDrill: { ...last, keyId: 'deny' } });
    expect(text).toContain('Question Round');
    expect(text).toContain('Missed');
    expect(text).toContain('The right answer: Deny');
    expect(text).toContain(final.explain.replaceAll(/\s+/g, ' '));
  });

  it('shows no reveal after a typed mission’s last drill, as before', () => {
    const drill = sampleMission.drills.at(-1);
    if (drill === undefined) throw new Error('the sample has no drills');
    const lastDrill = { drillId: drill.id, passed: false, seconds: 6, overtime: false };
    const text = drillsScreen({
      mission: sampleMission,
      run: { ...startRun(sampleMission), phase: 'question' },
      lastDrill,
    });
    expect(text).toContain('Question Round');
    expect(text).not.toContain('Missed');
    expect(text).not.toContain('Not quite');
  });
});
