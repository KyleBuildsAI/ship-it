import { describe, expect, it } from 'vitest';
import { gitQueries } from '../../engine/git/queries';
import { testDeps } from '../../engine/git/testDeps';
import { describeChanges } from '../../game/agent/effects';
import { dryRun, replay, type SandboxLog } from '../../game/agent/replay';
import {
  answerCheck,
  beginAgentStep,
  openFixRound,
  stepPasses,
  type AgentStepState,
} from '../../game/missions/agentRunner';
import { MissionSchema, type Mission, type MissionStep } from '../../game/missions/schema';
import { validateAct } from '../../game/missions/validateAct';
import { describeDirectedMission, describeJudgmentDrills } from '../act1/directed.test-helpers';
import {
  beginStep,
  canonicalStart,
  playCard,
  queriesOf,
  trueChecks,
} from '../act1/play.test-helpers';
import { act2, act2Missions } from '../index';
import { undoEverything } from './undoEverything';

/*
 * Mission 2.5, directed: every card played through agentRunner and replay.ts, the way the
 * game plays it. The tables below are what each card is meant to do. The engine decides
 * every answer: gates by dry runs against the step's guards, checks and drills by git
 * predicates. So reset --hard is harmful where it drops shared commits or work with no
 * other copy, and safe in the fire drill, where the reflog still holds both commits.
 */

const mission: Mission = MissionSchema.parse(undoEverything);

function stepById(id: string): MissionStep {
  const found = mission.steps.find((step) => step.id === id);
  if (found === undefined) throw new Error(`Mission 2.5 has no step "${id}".`);
  return found;
}

describeDirectedMission(mission, {
  start: {
    'discard-edit': {
      'restore-style': { passed: true, check: 'clean' },
      'undo-all': {
        'allow-all': { passed: false, check: 'notes-gone' },
        'deny-harmful': 'direct',
      },
      'unstage-style': { passed: false, check: 'experiment' },
    },
    'unstage-notes': {
      'restore-staged': { passed: true, check: 'loose' },
      'commit-it': { passed: false, check: 'committed' },
      'restore-notes': { passed: false, check: 'on-dock' },
    },
    'redo-wip': {
      'soft-reset': { passed: true, check: 'redone' },
      'hard-reset': { 'allow-all': { passed: false, check: 'lost' }, 'deny-harmful': 'direct' },
      'new-commit': { passed: false, check: 'wip' },
    },
    'revert-confetti': {
      revert: { passed: true, check: 'reverted' },
      'reset-back': {
        'allow-all': { passed: false, check: 'erased' },
        'deny-harmful': 'direct',
      },
      'delete-file': { passed: false, check: 'half' },
    },
    'reflog-recover': {
      'drill-rescue': { passed: true, check: 'back' },
      'drill-only': { passed: false, check: 'gone' },
      'soft-drill': { passed: false, check: 'dock' },
    },
  },
  fixes: {
    'discard-edit': {
      'unstage-style > fix-restore': { passed: true, check: 'clean' },
      'unstage-style > restore-style': { passed: true, check: 'clean' },
    },
    'unstage-notes': {
      'commit-it > uncommit-notes': { passed: true, check: 'loose' },
      'commit-it > restore-staged': { passed: false, check: 'committed' },
      'restore-notes > restore-staged': { passed: true, check: 'loose' },
    },
    'redo-wip': {
      'new-commit > fix-soft': { passed: true, check: 'redone' },
      'new-commit > soft-reset': { passed: true, check: 'redone' },
    },
    'revert-confetti': {
      'delete-file > fix-app': { passed: true, check: 'reverted' },
      // HEAD~2 now names the readme commit: reverting by position after a new commit misses.
      'delete-file > revert': { passed: false, check: 'half' },
    },
    'reflog-recover': {
      'drill-only > reflog-back': { passed: true, check: 'back' },
      'soft-drill > reflog-back': { passed: true, check: 'back' },
    },
  },
  rewindOnly: ['discard-edit > undo-all', 'redo-wip > hard-reset', 'revert-confetti > reset-back'],
  // Every git line that pauses in destructive mode, and whether a dry run finds it harmful.
  gates: {
    'discard-edit > restore-style > git restore style.css': false,
    'discard-edit > undo-all > git reset --hard': true,
    // Denied, nothing was lost, so restoring style.css is as safe as from the start.
    'discard-edit > undo-all (denied) > fix-restore > git restore style.css': false,
    'discard-edit > undo-all (denied) > restore-style > git restore style.css': false,
    'discard-edit > unstage-style > fix-restore > git restore style.css': false,
    'discard-edit > unstage-style > restore-style > git restore style.css': false,
    'discard-edit > unstage-style > undo-all > git reset --hard': true,
    // Undoing Otto's own new commit is safe. After restore-notes it would drop "wip", so
    // uncommit-notes isn't offered there (its `when` needs a commit holding notes.txt).
    'unstage-notes > commit-it > uncommit-notes > git reset HEAD~1': false,
    'redo-wip > soft-reset > git reset --soft HEAD~1': false,
    'redo-wip > hard-reset > git reset --hard HEAD~1': true,
    // After the hard reset, one more step back reaches a pushed commit. fix-soft isn't
    // offered there (wip is gone), but the start card still is, and pauses as harmful.
    'redo-wip > hard-reset > soft-reset > git reset --soft HEAD~1': true,
    // Denied, wip is still the newest commit, so unsealing it is safe.
    'redo-wip > hard-reset (denied) > fix-soft > git reset --soft HEAD~1': false,
    'redo-wip > hard-reset (denied) > soft-reset > git reset --soft HEAD~1': false,
    'redo-wip > new-commit > fix-soft > git reset --soft HEAD~1': false,
    'redo-wip > new-commit > hard-reset > git reset --hard HEAD~1': true,
    'redo-wip > new-commit > soft-reset > git reset --soft HEAD~1': false,
    'revert-confetti > revert > git revert HEAD~2': false,
    'revert-confetti > reset-back > git reset --hard HEAD~3': true,
    'revert-confetti > delete-file > git rm src/confetti.js': false,
    // fix-app's restore of src/app.js rewrites a version a commit still holds: no pause.
    // Denied, the shared commits stay, so each card runs as from the start.
    'revert-confetti > reset-back (denied) > delete-file > git rm src/confetti.js': false,
    'revert-confetti > reset-back (denied) > revert > git revert HEAD~2': false,
    'revert-confetti > delete-file > reset-back > git reset --hard HEAD~3': true,
    'revert-confetti > delete-file > revert > git revert HEAD~2': false,
    // The fire drill: no guard protects two unpushed commits the reflog still knows.
    'reflog-recover > drill-rescue > git reset --hard HEAD~2': false,
    "reflog-recover > drill-rescue > git reset --hard 'HEAD@{1}'": false,
    'reflog-recover > drill-only > git reset --hard HEAD~2': false,
    'reflog-recover > drill-only > drill-rescue > git reset --hard HEAD~2': false,
    "reflog-recover > drill-only > reflog-back > git reset --hard 'HEAD@{1}'": false,
    'reflog-recover > drill-only > soft-drill > git reset --soft HEAD~2': false,
    'reflog-recover > soft-drill > git reset --soft HEAD~2': false,
    'reflog-recover > soft-drill > drill-only > git reset --hard HEAD~2': false,
    'reflog-recover > soft-drill > drill-rescue > git reset --hard HEAD~2': false,
  },
});

describeJudgmentDrills(mission, {
  'undo-discard-edit': { key: ['allow'], wrong: 'deny' },
  'undo-restore-deleted': { key: ['restore'], wrong: 'restore-staged' },
  'undo-unstage': { key: ['off-dock'], wrong: 'edit-gone' },
  'undo-revert-shared': { key: ['revert'], wrong: 'reset-hard' },
  'undo-soft-reset': { key: ['dock'], wrong: 'workbench' },
  'undo-mixed-reset': { key: ['on-workbench'], wrong: 'gone' },
  'undo-hard-reset': { key: ['deny'], wrong: 'allow' },
  'undo-reflog-rescue': { key: ['reflog'], wrong: 'recommit' },
});

describe('Mission 2.5 directed', () => {
  it('is a directed mission in Act 2 that fits the word budgets', () => {
    expect(mission.approvals).toBe('destructive');
    expect(mission.steps.every((step) => step.agent !== undefined)).toBe(true);
    expect(validateAct(act2, act2Missions)).toEqual([]);
  });

  it('keeps the drills the placement test borrows', () => {
    const ids = mission.drills.map((drill) => drill.id);
    const borrowed = act2.placementTest.drillIds.filter((id) => id.startsWith('undo-'));
    expect(borrowed.length).toBeGreaterThan(0);
    for (const id of borrowed) expect(ids).toContain(id);
  });
});

describe("Mission 2.5's gates say, in plain words, what each undo costs", () => {
  /** The approval card's lines for `line`, run where step `index` begins on the reference path. */
  function gateFor(index: number, line: string) {
    const step = mission.steps[index];
    if (step === undefined) throw new Error(`No step ${String(index)}`);
    const start = canonicalStart(mission, index);
    const dry = dryRun(
      start,
      { do: 'run', line },
      { guards: step.agent?.guards ?? [] },
      testDeps(),
    );
    return {
      harmful: dry.harmful,
      broken: dry.broken,
      effects: describeChanges(dry.changes, (path) => path),
    };
  }

  it('reset --hard on Friday throws away the experiment and deletes notes.txt', () => {
    expect(gateFor(0, 'git reset --hard')).toEqual({
      harmful: true,
      broken: ['Your notes.txt survives'],
      // notes.txt was only on the dock and the Workbench, so its staged version is lost.
      effects: [
        'Throws away the staged edits to notes.txt',
        'Throws away the unstaged edits to style.css',
        'Deletes notes.txt from the Workbench',
      ],
    });
  });

  it('git restore style.css pauses, and is safe: it names one file', () => {
    expect(gateFor(0, 'git restore style.css')).toEqual({
      harmful: false,
      broken: [],
      effects: ['Throws away the unstaged edits to style.css'],
    });
  });

  it('resetting past the confetti commit drops three, two of them shared: harmful', () => {
    const gate = gateFor(3, 'git reset --hard HEAD~3');
    expect(gate.harmful).toBe(true);
    expect(gate.broken).toEqual(['Shared commits stay in history']);
    expect(gate.effects[0]).toBe('Takes 3 commits off main, newest "feat: add pricing calculator"');
  });

  it('dropping only the unpushed pricing commit breaks no shared history', () => {
    const gate = gateFor(3, 'git reset --soft HEAD~1');
    expect(gate.harmful).toBe(false);
    expect(gate.effects[0]).toBe('Takes the commit "feat: add pricing calculator" off main');
  });

  it('git revert keeps every commit: it pauses for the file it deletes, and is safe', () => {
    const gate = gateFor(3, 'git revert HEAD~2');
    expect(gate.harmful).toBe(false);
    // Its rewrite of src/app.js loses nothing (a commit holds the old version), so the
    // delete and the new commit are the lines that fit on the card.
    expect(gate.effects[0]).toBe('Deletes src/confetti.js from the Workbench');
    expect(gate.effects[1]).toMatch(/^Seals 2 files into a new commit: "Revert /);
  });

  it('the fire drill is the same reset --hard, and safe: nothing it drops is shared', () => {
    const gate = gateFor(4, 'git reset --hard HEAD~2');
    expect(gate.harmful).toBe(false);
    expect(gate.effects[0]).toMatch(/^Takes 2 commits off main, newest "Revert /);
  });
});

describe('Mission 2.5 on the reference path', () => {
  it('ends with the revert on top, pricing kept, and the drill in the reflog', () => {
    const log = canonicalStart(mission, mission.steps.length);
    const { shell } = replay(log, testDeps());
    const git = gitQueries(shell.ws);
    expect(git.headCommit()?.message).toMatch(/^Revert "feat: add confetti on signup"/);
    expect(git.log()).toHaveLength(6);
    expect(git.trackedPaths()).toContain('src/pricing.js');
    expect(git.reflog().some((entry) => entry.message === 'reset: moving to HEAD~2')).toBe(true);
  });

  it('asks Kyle nothing on the strong Friday card but the prediction, and one safe gate', () => {
    const step = stepById('discard-edit');
    const begun = { log: canonicalStart(mission, 0), state: beginAgentStep(step) };
    const played = playCard(mission, step, begun, 'restore-style', 'deny-harmful');
    expect(played.gates).toEqual([{ line: 'git restore style.css', harmful: false }]);
    expect(played.predicts).toEqual([
      { question: 'Before Otto runs it: what is in style.css after?', trueOptions: ['committed'] },
    ]);
  });
});

describe('Mission 2.5 after step 4 is passed with the fix card instead of the revert', () => {
  /*
   * delete-file, then fix-app, passes step 4 with two fix commits on top and no revert.
   * Step 5 must still be winnable from there, and its check must still tell the truth.
   */
  interface Played {
    readonly log: SandboxLog;
    readonly state: AgentStepState;
  }
  const revertStep = stepById('revert-confetti');
  const drillStep = stepById('reflog-recover');

  /** Answers the check with what is true, then opens the fix round, as Kyle would. */
  function fixRound(step: MissionStep, played: Played): Played {
    const [truth = ''] = trueChecks(step, played.log);
    const checked = answerCheck(played.state, step, truth, queriesOf(played.log));
    return { log: played.log, state: openFixRound(checked) };
  }

  function stepFiveStart(): Played {
    const start = beginStep(canonicalStart(mission, 3), revertStep);
    const begun = { log: start, state: beginAgentStep(revertStep) };
    const deleted = playCard(mission, revertStep, begun, 'delete-file', 'allow-all');
    const fixed = playCard(
      mission,
      revertStep,
      fixRound(revertStep, deleted),
      'fix-app',
      'allow-all',
    );
    expect(stepPasses(revertStep, queriesOf(fixed.log))).toBe(true);
    const log = beginStep(fixed.log, drillStep);
    return { log, state: beginAgentStep(drillStep) };
  }

  function endOf(played: Played) {
    return {
      passed: stepPasses(drillStep, queriesOf(played.log)),
      checks: trueChecks(drillStep, played.log),
    };
  }

  it('starts step 5 with two fix commits on top, not a revert', () => {
    const { shell } = replay(stepFiveStart().log, testDeps());
    const messages = gitQueries(shell.ws)
      .log()
      .map((commit) => commit.message.trim());
    expect(messages.slice(0, 3)).toEqual([
      'fix: stop launching confetti',
      'fix: remove confetti',
      'feat: add pricing calculator',
    ]);
  });

  it('passes with the drill and the reflog rescue, and the prediction has one answer', () => {
    const played = playCard(mission, drillStep, stepFiveStart(), 'drill-rescue', 'allow-all');
    expect(endOf(played)).toEqual({ passed: true, checks: ['back'] });
    expect(played.predicts.map((predicted) => predicted.trueOptions)).toEqual([['back']]);
  });

  it('grades the weak and okay cards by where the work is', () => {
    const start = stepFiveStart();
    const only = playCard(mission, drillStep, start, 'drill-only', 'allow-all');
    expect(endOf(only)).toEqual({ passed: false, checks: ['gone'] });
    const soft = playCard(mission, drillStep, start, 'soft-drill', 'allow-all');
    expect(endOf(soft)).toEqual({ passed: false, checks: ['dock'] });
  });

  it('mends the weak and okay cards with the reflog fix', () => {
    const start = stepFiveStart();
    for (const card of ['drill-only', 'soft-drill']) {
      const missed = playCard(mission, drillStep, start, card, 'allow-all');
      const fixed = playCard(
        mission,
        drillStep,
        fixRound(drillStep, missed),
        'reflog-back',
        'allow-all',
      );
      expect(endOf(fixed), card).toEqual({ passed: true, checks: ['back'] });
    }
  });
});
