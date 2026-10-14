import { describe, expect, it } from 'vitest';
import {
  describeDirectedMission,
  describeJudgmentDrills,
} from '../../content/act1/directed.test-helpers';
import { canonicalStart, playCard } from '../../content/act1/play.test-helpers';
import { testDeps } from '../../engine/git/testDeps';
import { Shell } from '../../engine/shell/shell';
import type { EngineEvent } from '../../engine/workspace';
import { describeChanges } from '../agent/effects';
import { dryRun, playAction, replay, startLog } from '../agent/replay';
import { beginAgentStep } from './agentRunner';
import {
  gitDirectedAct,
  gitDirectedMission,
  gitDirectedMissionInput,
} from './sample.test-gitDirected';
import { createSandbox, DISPLAY_ROOT } from './sandbox';
import { validateAct } from './validateAct';

/*
 * The groundwork for directing Act 2: a directed mission on a git project, played card by
 * card through agentRunner and replay.ts with the same harness Act 1 uses. It proves Otto
 * can run git through the driver, that git lines pause and are judged by dry runs (git
 * reset --hard harmful, git rm and rm safe), that checks and drills are graded by git
 * predicates, and that the Git World hears his lines as it hears typed ones.
 */

const mission = gitDirectedMission;
const [commitApp, dropLogin] = mission.steps;
if (commitApp === undefined || dropLogin === undefined) throw new Error('The sample has 2 steps.');

describeDirectedMission(mission, {
  start: {
    'commit-app': {
      'just-app': { passed: true, check: 'only-app' },
      'save-all': { passed: false, check: 'no-commit' },
      'start-clean': {
        'allow-all': { passed: false, check: 'no-commit' },
        'deny-harmful': 'direct',
      },
    },
    'drop-login': {
      'rm-commit': { passed: true, check: 'kept' },
      'go-back': { 'allow-all': { passed: false, check: 'lost' }, 'deny-harmful': 'direct' },
      'delete-file': { passed: false, check: 'still-there' },
    },
  },
  fixes: {
    'commit-app': {
      'save-all > unstage-notes': { passed: true, check: 'only-app' },
      'save-all > just-app': { passed: false, check: 'extra' },
    },
    'drop-login': {
      'go-back > fix-rm': 'direct',
      'delete-file > fix-rm': { passed: true, check: 'kept' },
    },
  },
  rewindOnly: ['commit-app > start-clean', 'drop-login > go-back'],
  // Every git line that pauses in destructive mode, and whether a dry run finds it harmful.
  gates: {
    'commit-app > start-clean > git reset --hard': true,
    'commit-app > save-all > start-clean > git reset --hard': true,
    'drop-login > rm-commit > git rm login.ts': false,
    'drop-login > delete-file > rm login.ts': false,
    'drop-login > go-back > git reset --hard HEAD~2': true,
    'drop-login > delete-file > go-back > git reset --hard HEAD~2': true,
    // Denied, the history is whole, so each way of removing login.ts is safe.
    'drop-login > go-back (denied) > delete-file > rm login.ts': false,
    'drop-login > go-back (denied) > fix-rm > git rm login.ts': false,
    'drop-login > go-back (denied) > rm-commit > git rm login.ts': false,
  },
});

describeJudgmentDrills(mission, {
  'git-approve-reset-hard': { key: ['deny'], wrong: 'allow' },
  'git-approve-add-app': { key: ['allow'], wrong: 'deny' },
  'git-predict-commit': { key: ['app-only'], wrong: 'both' },
  'git-diagnose-lost-edit': { key: ['lost'], wrong: 'on-dock' },
  'git-fix-unstage-notes': { key: ['restore-staged'], wrong: 'reset-hard' },
});

describe('a directed mission on a git project', () => {
  it('fits the word budgets an Act checks', () => {
    expect(validateAct(gitDirectedAct, [mission])).toEqual([]);
    expect(gitDirectedMissionInput.initialRepoState[0]?.op).toBe('init');
  });

  it('puts a gate on reset --hard that says, in plain words, it throws your edit away', () => {
    const start = startLog(mission.initialRepoState);
    const guards = commitApp.agent?.guards ?? [];
    const dry = dryRun(start, { do: 'run', line: 'git reset --hard' }, { guards }, testDeps());
    expect(dry.harmful).toBe(true);
    expect(dry.broken).toEqual(['Your app.ts edit survives']);
    expect(describeChanges(dry.changes, (path) => path)).toEqual([
      'Throws away the unsaved edits to app.ts',
    ]);
  });

  it('pauses the strong card nowhere in destructive mode, and predicts the dock', () => {
    const begun = { log: startLog(mission.initialRepoState), state: beginAgentStep(commitApp) };
    const played = playCard(mission, commitApp, begun, 'just-app', 'deny-harmful');
    expect(played.gates).toEqual([]);
    expect(played.predicts).toEqual([
      { question: 'Before Otto runs it: where does app.ts go?', trueOptions: ['dock'] },
    ]);
  });

  it('lets git add through, and asks before the safe git rm, which deletes a file', () => {
    const begun = { log: startLog(mission.initialRepoState), state: beginAgentStep(commitApp) };
    const weak = playCard(mission, commitApp, begun, 'save-all', 'allow-all');
    expect(weak.gates).toEqual([]);
    const step2 = { log: canonicalStart(mission, 1), state: beginAgentStep(dropLogin) };
    const removed = playCard(mission, dropLogin, step2, 'rm-commit', 'deny-harmful');
    expect(removed.gates).toEqual([{ line: 'git rm login.ts', harmful: false }]);
  });
});

describe("the Git World hears Otto's lines as it hears typed ones", () => {
  /** Every event a fresh sandbox announces while `act` runs. */
  function eventsOf(act: (shell: Shell) => void): EngineEvent[] {
    const shell = new Shell(createSandbox(mission.initialRepoState, testDeps()), DISPLAY_ROOT);
    const heard: EngineEvent[] = [];
    shell.ws.events.on((event) => heard.push(event));
    act(shell);
    return heard;
  }

  it('announces the same crate moves and commits for each line of the strong card', () => {
    const lines = ['git add app.ts', 'git commit -m "feat: greet the team"', 'git log --oneline'];
    const typed = eventsOf((shell) => {
      for (const line of lines) shell.run(line);
    });
    const directed = eventsOf((shell) => {
      for (const line of lines) playAction(shell, [], { do: 'run', line });
    });
    expect(directed).toEqual(typed);
    expect(typed.map((event) => event.type)).toEqual([
      'staged',
      'committed',
      'branchMoved',
      'headMoved',
    ]);
  });

  it('replays a git log into the same Vault, commit ids included', () => {
    const log = canonicalStart(mission, 2);
    const first = replay(log, testDeps()).shell.ws;
    const again = replay(log, testDeps()).shell.ws;
    expect(again.repo?.toData()).toEqual(first.repo?.toData());
    expect(first.repo?.headCommit()?.message).toBe('chore: drop login');
  });
});
