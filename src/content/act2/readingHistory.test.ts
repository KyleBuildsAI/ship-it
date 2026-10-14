import { describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { describeChanges } from '../../game/agent/effects';
import { dryRun, replay } from '../../game/agent/replay';
import { answerCheck, beginAgentStep, openFixRound } from '../../game/missions/agentRunner';
import { evaluate } from '../../game/missions/predicates';
import { MissionSchema, type MissionStep } from '../../game/missions/schema';
import { describeDirectedMission, describeJudgmentDrills } from '../act1/directed.test-helpers';
import {
  canonicalStart,
  playCard,
  queriesOf,
  trueChecks,
  type CardPlayed,
} from '../act1/play.test-helpers';
import { readingHistory } from './readingHistory';

/*
 * Mission 2.2, directed: every card played through agentRunner and replay.ts under both
 * gate policies, two fix rounds deep, with the shared harness Act 1 uses. The tables say
 * what each card does; the engine decides whether it does it.
 */

const mission = MissionSchema.parse(readingHistory);

function stepAt(index: number): MissionStep {
  const step = mission.steps[index];
  if (step === undefined) throw new Error(`Mission 2.2 has no step ${String(index + 1)}.`);
  return step;
}

describeDirectedMission(mission, {
  start: {
    'restore-tax': {
      'show-then-restore': { passed: true, check: 'fixed' },
      'blame-newest': { passed: false, check: 'still-bad' },
      rewind: {
        'allow-all': { passed: false, check: 'history-lost' },
        'deny-harmful': 'direct',
      },
    },
    'clear-dock': {
      'read-dock': { passed: true, check: 'empty-kept' },
      'wrong-diff': { passed: false, check: 'debug-staged' },
      discard: { 'allow-all': { passed: false, check: 'edit-gone' }, 'deny-harmful': 'direct' },
    },
    'commit-fix': {
      'stage-tax': { passed: true, check: 'tax-only' },
      'stage-all': { passed: false, check: 'none' },
      'commit-tax': { passed: true, check: 'tax-only' },
    },
    'commit-real-change': {
      'read-diff': { passed: true, check: 'feature' },
      'misread-diff': { passed: false, check: 'debug' },
      'stage-cart': { passed: false, check: 'nothing-new' },
    },
  },
  fixes: {
    'restore-tax': {
      'blame-newest > restore-before-tidy': { passed: true, check: 'fixed' },
      'blame-newest > show-then-restore': { passed: true, check: 'fixed' },
      // After the rewind, HEAD~2 is the first commit, which has no tax.ts, so git
      // restore removes it to match: the bad rate is gone, but so is the file.
      'rewind > restore-before-tidy': { passed: false, check: 'file-gone' },
    },
    'clear-dock': {
      'wrong-diff > unstage-checkout': { passed: true, check: 'empty-kept' },
      'wrong-diff > read-dock': { passed: true, check: 'empty-kept' },
      'discard > unstage-checkout': { passed: false, check: 'edit-gone' },
    },
    'commit-fix': {
      'stage-all > unstage-rest': { passed: true, check: 'tax-only' },
      // Everything is already on the dock, so committing "only tax.ts" seals all three.
      'stage-all > stage-tax': { passed: false, check: 'extra' },
      'stage-all > commit-tax': { passed: false, check: 'extra' },
    },
    'commit-real-change': {
      'misread-diff > undo-debug-commit': { passed: true, check: 'feature' },
      // The feature commit lands on top, but the debug print is still in the Vault.
      'misread-diff > read-diff': { passed: false, check: 'debug' },
      'stage-cart > read-diff': { passed: true, check: 'feature' },
    },
  },
  rewindOnly: ['restore-tax > rewind', 'clear-dock > discard'],
  gates: {
    // Restoring a file rewrites the Workbench, so it pauses; no guard breaks.
    'restore-tax > show-then-restore > git restore --source=HEAD~2 src/tax.ts': false,
    'restore-tax > blame-newest > show-then-restore > git restore --source=HEAD~2 src/tax.ts': false,
    'restore-tax > blame-newest > restore-before-tidy > git restore --source=HEAD~2 src/tax.ts': false,
    'restore-tax > rewind > git reset --hard HEAD~2': true,
    'restore-tax > blame-newest > rewind > git reset --hard HEAD~2': true,
    // After the rewind, HEAD~1 already holds 0.08, so blame-newest's restore changes
    // nothing and never pauses; restoring from HEAD~2 deletes tax.ts, which breaks a guard.
    'restore-tax > rewind > show-then-restore > git restore --source=HEAD~2 src/tax.ts': true,
    'restore-tax > rewind > restore-before-tidy > git restore --source=HEAD~2 src/tax.ts': true,
    'clear-dock > discard > git restore src/checkout.ts': true,
    'clear-dock > wrong-diff > discard > git restore src/checkout.ts': true,
    'commit-real-change > misread-diff > undo-debug-commit > git reset HEAD~1': false,
    // With no debug commit to take back, the same line would take the tax fix off main.
    'commit-real-change > stage-cart > undo-debug-commit > git reset HEAD~1': true,
  },
});

describeJudgmentDrills(mission, {
  'history-old-port': { key: ['before-change'], wrong: 'reset-hard' },
  'history-deleted-doc': { key: ['back'], wrong: 'error' },
  'history-staged-surprise': { key: ['deny'], wrong: 'allow' },
  'history-debug-print': { key: ['debug-rode'], wrong: 'only-cart' },
  'history-save-log': { key: ['first-commit'], wrong: 'right' },
  'history-staged-vs-unstaged': { key: ['allow'], wrong: 'deny' },
  'history-reset-to-read': { key: ['deny'], wrong: 'allow' },
});

/** A step's start card played from the reference path, as Kyle meets it. */
function playFromStart(index: number, planId: string): CardPlayed {
  const step = stepAt(index);
  const begun = { log: canonicalStart(mission, index), state: beginAgentStep(step) };
  return playCard(mission, step, begun, planId, 'allow-all');
}

describe('Reading History, directed', () => {
  it('names each slip for the miss the check catches', () => {
    const slipOf = (index: number, planId: string) =>
      stepAt(index).agent?.plans.find((plan) => plan.id === planId)?.slip;
    // stage-all claims a commit that never happened; misread-diff commits the wrong file.
    expect(slipOf(2, 'stage-all')).toBe('overclaim');
    expect(slipOf(3, 'misread-diff')).toBe('wrong-place');
  });

  it('keeps every drill id the typed mission had, so saved review items still play', () => {
    const ids = mission.drills.map((drill) => drill.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'history-old-port',
        'history-deleted-doc',
        'history-staged-surprise',
        'history-debug-print',
        'history-save-log',
        'history-staged-vs-unstaged',
      ]),
    );
  });

  it("names the harm of Otto's rewind in the Git World's words, Priya's edit included", () => {
    const guards = stepAt(0).agent?.guards ?? [];
    const start = canonicalStart(mission, 0);
    const dry = dryRun(
      start,
      { do: 'run', line: 'git reset --hard HEAD~2' },
      { guards },
      testDeps(),
    );
    expect(dry.harmful).toBe(true);
    expect([...dry.broken].sort()).toEqual([
      'Every commit stays',
      "Priya's debug edit survives",
      'Your cart.ts edit survives',
    ]);
    // Her edit lived only on the dock and in the file the rewind deletes, so the card says
    // it is thrown away instead of folding it into the count on the last line.
    expect(describeChanges(dry.changes, (path) => path).slice(0, 2)).toEqual([
      'Takes 2 commits off main, newest "feat: show order total at checkout"',
      'Throws away the staged edits to src/checkout.ts',
    ]);
  });

  it('after a rewind, says the strong restore deletes tax.ts, and predicts that', () => {
    const rewound = playFromStart(0, 'rewind');
    const step = stepAt(0);
    const fixRound = {
      log: rewound.log,
      state: openFixRound(answerCheck(rewound.state, step, 'history-lost', queriesOf(rewound.log))),
    };
    const played = playCard(mission, step, fixRound, 'show-then-restore', 'allow-all');
    expect(played.gates).toEqual([
      { line: 'git restore --source=HEAD~2 src/tax.ts', harmful: true },
    ]);
    expect(played.predicts).toEqual([
      { question: 'Before Otto runs it: what will tax.ts say?', trueOptions: ['gone'] },
    ]);
    expect(trueChecks(step, played.log)).toEqual(['file-gone']);
  });

  it('shows Otto misreading the log: his restore leaves the bad rate in place', () => {
    const played = playFromStart(0, 'blame-newest');
    // Restoring from HEAD~1 changes nothing, so it never even pauses.
    expect(played.gates).toEqual([]);
    const rate = { kind: 'workingFile', path: 'src/tax.ts', contains: 'TAX_RATE = 0.8;' } as const;
    expect(evaluate(rate, queriesOf(played.log))).toBe(true);
  });

  it('asks before the strong restore, and predicts the good rate', () => {
    const played = playFromStart(0, 'show-then-restore');
    expect(played.gates).toEqual([
      { line: 'git restore --source=HEAD~2 src/tax.ts', harmful: false },
    ]);
    expect(played.predicts).toEqual([
      { question: 'Before Otto runs it: what will tax.ts say?', trueOptions: ['good'] },
    ]);
  });

  it('commits the fix and the feature on the reference path, debug line left out', () => {
    const log = canonicalStart(mission, mission.steps.length);
    const repo = replay(log, testDeps()).shell.ws.repo;
    const head = repo?.headCommit();
    const parent = repo?.getCommit(head?.parents[0] ?? '');
    expect([head?.message, parent?.message]).toEqual([
      'feat: add free delivery threshold',
      'fix: restore 8% sales tax',
    ]);
    const kept = { kind: 'workingFile', path: 'src/checkout.ts', contains: 'DEBUG' } as const;
    expect(evaluate(kept, queriesOf(log))).toBe(true);
  });
});
