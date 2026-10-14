import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { describeChanges } from '../../game/agent/effects';
import { INSTANT_PACE } from '../../game/agent/pace';
import { dryRun } from '../../game/agent/replay';
import { hud } from '../../game/hud';
import { evaluate, type Predicate } from '../../game/missions/predicates';
import { ActSchema, MissionSchema } from '../../game/missions/schema';
import { checkClaim, decide, nextStep, pickCard, predict } from '../../game/play/agentPlay';
import { setCatalog } from '../../game/play/catalog';
import { endBriefing, startMission } from '../../game/play/missionPlay';
import { framePlay, leavePlay } from '../../game/play/play';
import { play, type MissionActivity } from '../../game/play/playStore';
import { currentQueries } from '../../game/play/sandboxControl';
import { flushProgress, progress, startProgress, type ProgressStorage } from '../../game/progress';
import { createDefaultSave, type SaveData } from '../../game/save/schema';
import { describeDirectedMission, describeJudgmentDrills } from '../act1/directed.test-helpers';
import { beginStep, canonicalStart } from '../act1/play.test-helpers';
import { goodCommits } from './goodCommits';

/*
 * Mission 2.3 played card by card through agentRunner and replay.ts, the way the game
 * plays it. Every commit pauses (`changes`), and the dry run alone decides which ones do
 * harm: a bundle, or a docs change typed fix:. These tables pin what each card does.
 */

const mission = MissionSchema.parse(goodCommits);

/** The commit lines Otto types most, spelled once so the gate table stays readable. */
const FIX = 'git commit -m "fix: trim spaces from login emails"';
const FIX_AM = 'git commit -am "fix: trim spaces from login emails"';
const DOCS = 'git commit -m "docs: fix install command in readme"';
const ADD_BOTH = 'git add src/theme.ts src/app.ts';
const FEAT = 'git commit -m "feat: add dark mode"';
const FEAT_AM = 'git commit -am "feat: add dark mode"';
const CHORE_AM = 'git commit -am "chore: bump version to 1.1.0"';

describeDirectedMission(mission, {
  start: {
    'commit-fix': {
      'just-fix': { passed: true, check: 'alone' },
      'save-all': { passed: false, check: 'none' },
      'am-fix': { 'allow-all': { passed: false, check: 'bundled' }, 'deny-harmful': 'direct' },
    },
    'commit-docs': {
      'just-docs': { passed: true, check: 'alone' },
      'type-fix': {
        'allow-all': { passed: false, check: 'mislabelled' },
        'deny-harmful': { passed: true, check: 'alone' },
      },
      'commit-docs': {
        'allow-all': { passed: false, check: 'bundled' },
        'deny-harmful': 'direct',
      },
    },
    'commit-feature': {
      'name-both': { passed: true, check: 'feature' },
      'am-feature': {
        'allow-all': { passed: false, check: 'no-theme' },
        'deny-harmful': 'direct',
      },
      'app-only': { 'allow-all': { passed: false, check: 'no-theme' }, 'deny-harmful': 'direct' },
    },
    'commit-am': {
      'am-bump': { passed: true, check: 'both' },
      'one-file': { passed: false, check: 'half' },
      'quick-bump': {
        'allow-all': { passed: false, check: 'untyped' },
        'deny-harmful': 'direct',
      },
    },
  },
  fixes: {
    'commit-fix': {
      'save-all > unload-fix': { passed: true, check: 'alone' },
      // With the fix already sealed in a bundle there is nothing left to commit.
      'am-fix > unload-fix': 'direct',
    },
    'commit-docs': {
      'type-fix > retype': { passed: true, check: 'alone' },
      // reset --soft keeps the whole bundle on the dock, so retyping reseals all of it.
      'commit-docs > retype': { passed: false, check: 'bundled' },
    },
    'commit-feature': {
      'am-feature > split-feature': { passed: true, check: 'feature' },
      'app-only > split-feature': { passed: true, check: 'feature' },
      'am-feature > name-both': { passed: false, check: 'mixed' },
    },
    'commit-am': {
      'one-file > redo-bump': { passed: true, check: 'both' },
      'quick-bump > redo-bump': { passed: true, check: 'both' },
      'one-file > am-bump': { passed: false, check: 'half' },
    },
  },
  rewindOnly: ['commit-fix > am-fix', 'commit-docs > commit-docs'],
  // Every line that pauses in `changes` mode, and whether a dry run finds it harmful. Only
  // a line that seals a change wrongly (bundled, or under the wrong type) does harm.
  gates: {
    'commit-fix > just-fix > git add src/login.ts': false,
    [`commit-fix > just-fix > ${FIX}`]: false,
    'commit-fix > save-all > git add .': false,
    'commit-fix > save-all > just-fix > git commit -m "fix: trim spaces from login emails"': true,
    'commit-fix > save-all > unload-fix > git restore --staged .': false,
    'commit-fix > save-all > unload-fix > git add src/login.ts': false,
    [`commit-fix > save-all > unload-fix > ${FIX}`]: false,
    [`commit-fix > save-all > am-fix > ${FIX_AM}`]: true,
    [`commit-fix > am-fix > ${FIX_AM}`]: true,
    'commit-fix > am-fix > save-all > git add .': false,

    'commit-docs > just-docs > git add README.md': false,
    [`commit-docs > just-docs > ${DOCS}`]: false,
    'commit-docs > type-fix > git add README.md': false,
    'commit-docs > type-fix > git commit -m "fix: correct install typo"': true,
    // Denied, Otto retypes the message: the line he runs instead pauses too, and is safe.
    [`commit-docs > type-fix > ${DOCS}`]: false,
    'commit-docs > type-fix > retype > git reset --soft HEAD~1': false,
    [`commit-docs > type-fix > retype > ${DOCS}`]: false,
    'commit-docs > type-fix > commit-docs > git add .': false,
    // The README fix is already sealed under fix:, so this bundle breaks no guard that held.
    'commit-docs > type-fix > commit-docs > git commit -m "docs: update readme"': false,
    'commit-docs > commit-docs > git add .': false,
    'commit-docs > commit-docs > git commit -m "docs: update readme"': true,
    'commit-docs > commit-docs > retype > git reset --soft HEAD~1': false,
    // The whole bundle is still on the dock, so resealing it does the same harm again.
    [`commit-docs > commit-docs > retype > ${DOCS}`]: true,

    [`commit-feature > name-both > ${ADD_BOTH}`]: false,
    [`commit-feature > name-both > ${FEAT}`]: false,
    [`commit-feature > am-feature > ${FEAT_AM}`]: true,
    [`commit-feature > am-feature > name-both > ${ADD_BOTH}`]: false,
    [`commit-feature > am-feature > name-both > ${FEAT}`]: false,
    'commit-feature > am-feature > split-feature > git reset HEAD~1': false,
    [`commit-feature > am-feature > split-feature > ${ADD_BOTH}`]: false,
    [`commit-feature > am-feature > split-feature > ${FEAT}`]: false,
    'commit-feature > app-only > git add src/app.ts': false,
    [`commit-feature > app-only > ${FEAT}`]: true,
    [`commit-feature > app-only > am-feature > ${FEAT_AM}`]: false,
    [`commit-feature > app-only > name-both > ${ADD_BOTH}`]: false,
    [`commit-feature > app-only > name-both > ${FEAT}`]: false,
    'commit-feature > app-only > split-feature > git reset HEAD~1': false,
    [`commit-feature > app-only > split-feature > ${ADD_BOTH}`]: false,
    [`commit-feature > app-only > split-feature > ${FEAT}`]: false,

    [`commit-am > am-bump > ${CHORE_AM}`]: false,
    'commit-am > one-file > git add package.json': false,
    'commit-am > one-file > git commit -m "chore: bump version to 1.1.0"': false,
    [`commit-am > one-file > am-bump > ${CHORE_AM}`]: false,
    'commit-am > one-file > quick-bump > git commit -am "bump"': true,
    'commit-am > one-file > redo-bump > git reset --soft HEAD~1': false,
    [`commit-am > one-file > redo-bump > ${CHORE_AM}`]: false,
    'commit-am > quick-bump > git commit -am "bump"': true,
    'commit-am > quick-bump > redo-bump > git reset --soft HEAD~1': false,
    [`commit-am > quick-bump > redo-bump > ${CHORE_AM}`]: false,
  },
});

describeJudgmentDrills(mission, {
  'commits-type-fix': { key: ['fix-type'], wrong: 'feat-type' },
  'commits-scope': { key: ['right'], wrong: 'no-scope' },
  'commits-split-two': { key: ['two-commits'], wrong: 'one-am' },
  'commits-leave-debug': { key: ['deny'], wrong: 'allow' },
  'commits-am-tracked': { key: ['allow'], wrong: 'deny' },
  'commits-am-trap': { key: ['app-only'], wrong: 'both' },
});

describe('Good Commits, directed', () => {
  it('pauses on every change, and keeps the drill ids the placement test names', () => {
    expect(mission.approvals).toBe('changes');
    expect(mission.drills.map((drill) => drill.id)).toEqual(
      expect.arrayContaining(['commits-split-two', 'commits-am-trap']),
    );
  });

  it("says in plain words what Otto's -am bundle seals, and which guard it breaks", () => {
    const [step] = mission.steps;
    if (step?.agent === undefined) throw new Error('Step 1 is directed.');
    const start = beginStep(canonicalStart(mission, 0), step);
    const line = 'git commit -am "fix: trim spaces from login emails"';
    const dry = dryRun(start, { do: 'run', line }, { guards: step.agent.guards }, testDeps());
    expect(dry.harmful).toBe(true);
    expect(dry.broken).toEqual(['The login fix is its own fix commit']);
    expect(describeChanges(dry.changes, (path) => path)).toEqual([
      'Seals 5 files into a new commit: "fix: trim spaces from login emails"',
    ]);
  });
});

/*
 * The mission played the way the game plays it: Otto's lines go through the live sandbox
 * the Git World watches, and a step's resume point brings the Vault back for the next
 * step's dry runs.
 */
describe('Good Commits in the game', () => {
  const NOW = new Date('2026-10-14T12:00:00.000Z');
  let stored: SaveData;
  const storage: ProgressStorage = {
    load: () => Promise.resolve(stored),
    write: (save) => {
      stored = save;
      return Promise.resolve();
    },
  };
  // A scratch Act holding only this mission, so it starts unlocked.
  const act = ActSchema.parse({
    act: 2,
    title: 'Git Core',
    earlyAccess: true,
    missionIds: [mission.id],
  });

  function current(): MissionActivity {
    const activity = play.get().activity;
    if (activity?.kind !== 'mission') throw new Error('no mission is being played');
    return activity;
  }
  const stage = () => current().agent?.stage;
  const holds = (predicate: Predicate) => evaluate(predicate, currentQueries());

  /** Lets Otto run until he waits for Kyle, allowing every safe gate on the way. */
  function untilKyle(prediction?: string): void {
    for (let turns = 0; turns < 20; turns++) {
      framePlay(16, INSTANT_PACE);
      const now = stage();
      if (now?.at === 'predict' && prediction !== undefined) predict(prediction);
      else if (now?.at === 'gate' && !now.gate.harmful) decide(true);
      else return;
    }
    throw new Error('Otto never stopped for Kyle.');
  }

  beforeEach(async () => {
    stored = createDefaultSave(NOW);
    setCatalog({ acts: [{ act, missions: [mission] }] });
    await startProgress(storage, NOW);
    startMission(mission.id);
    endBriefing();
  });

  afterEach(async () => {
    leavePlay();
    await flushProgress();
  });

  it('keeps the terminal closed while Otto commits the fix alone', () => {
    expect(hud.get().terminalOpen).toBe(false);
    pickCard('just-fix');
    untilKyle('dock');
    expect(stage()?.at).toBe('check');
    checkClaim('alone');
    expect(stage()).toMatchObject({ at: 'result', verdict: 'confirmed', passed: true });
    expect(current().stars).toEqual({ 'commit-fix': { plan: true, safety: true, check: true } });
    expect(hud.get().terminalOpen).toBe(false);
  });

  it('resumes at step 2 on the saved Vault, where a mislabelled commit stops at its gate', async () => {
    pickCard('just-fix');
    untilKyle('dock');
    checkClaim('alone');
    nextStep();
    await flushProgress();
    expect(progress.get().save?.missions[mission.id]?.resume?.workbench).not.toBeNull();

    leavePlay();
    await startProgress(storage, NOW);
    startMission(mission.id);
    expect(current().run.stepIndex).toBe(1);
    expect(holds({ kind: 'commitCount', equals: 2 })).toBe(true);

    pickCard('type-fix');
    untilKyle();
    const gate = stage();
    if (gate?.at !== 'gate') throw new Error('Otto should be waiting at a gate.');
    expect(gate.gate).toMatchObject({ line: 'git commit -m "fix: correct install typo"' });
    expect(gate.gate.harmful).toBe(true);
    expect(describeChanges(gate.gate.changes, (path) => path)).toEqual([
      'Seals 1 file into a new commit: "fix: correct install typo"',
    ]);

    // Denied, Otto retypes the message as docs: and the step passes.
    decide(false);
    untilKyle();
    checkClaim('alone');
    expect(stage()).toMatchObject({ at: 'result', verdict: 'confirmed', passed: true });
    expect(holds({ kind: 'headMessage', pattern: '^docs: ' })).toBe(true);
  });
});
