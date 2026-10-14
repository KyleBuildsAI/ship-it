import { describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { describeChanges } from '../../game/agent/effects';
import { dryRun } from '../../game/agent/replay';
import { beginAgentStep } from '../../game/missions/agentRunner';
import { validateAct } from '../../game/missions/validateAct';
import { describeDirectedMission, describeJudgmentDrills } from '../act1/directed.test-helpers';
import { canonicalStart, playCard, queriesOf } from '../act1/play.test-helpers';
import { act2, act2Missions } from './index';

/*
 * Mission 2.4, The Ignore List, played card by card and drill by drill
 * (src/content/act1/directed.test-helpers.ts), on a git project. The tables are what each
 * card and drill is meant to do; the engine works out the real answers, so a drift fails
 * here instead of grading Kyle wrong.
 *
 * The mission pauses only where something is lost (`destructive`). Its gates: plain
 * `git rm .env` deletes the file and is harmful, `git rm --cached .env` asks on purpose
 * and is safe, and rewriting a committed .gitignore or .env.example pauses but harms
 * nothing. 'direct' means Otto stopped for new directions.
 */

const found = act2Missions.find((candidate) => candidate.id === 'ignore-list');
if (found === undefined) throw new Error('Act 2 has no mission "ignore-list".');
const mission = found;
const [ignoreNoise, untrackEnv, commitCleanup] = mission.steps;
if (ignoreNoise === undefined || untrackEnv === undefined || commitCleanup === undefined) {
  throw new Error('The Ignore List has 3 steps.');
}

describeDirectedMission(mission, {
  start: {
    'ignore-noise': {
      'quiet-status': { passed: false, check: 'committed' },
      'ignore-rules': { passed: true, check: 'hidden' },
      'ignore-debug': { passed: false, check: 'some-show' },
    },
    'untrack-env': {
      'git-rm': { 'allow-all': { passed: false, check: 'deleted' }, 'deny-harmful': 'direct' },
      'rm-cached': { passed: true, check: 'safe' },
      'rule-only': { passed: false, check: 'exposed' },
    },
    'commit-cleanup': {
      'copy-env': { passed: false, check: 'values' },
      'names-only': { passed: true, check: 'names' },
      'add-all': { passed: false, check: 'none' },
    },
  },
  fixes: {
    'ignore-noise': {
      'quiet-status > reload-dock': { passed: true, check: 'hidden' },
      'quiet-status > ignore-rules': { passed: false, check: 'committed' },
      'ignore-debug > reload-dock': { passed: true, check: 'hidden' },
      'ignore-debug > ignore-rules': { passed: true, check: 'hidden' },
    },
    'untrack-env': {
      'rule-only > untrack-now': { passed: true, check: 'safe' },
      'rule-only > rm-cached': { passed: true, check: 'safe' },
      // .env is gone from disk and the dock, so --cached has nothing to untrack.
      'git-rm > untrack-now': 'direct',
    },
    'commit-cleanup': {
      'copy-env > blank-example': { passed: true, check: 'names' },
      'add-all > blank-example': { passed: true, check: 'names' },
      'add-all > names-only': { passed: true, check: 'names' },
    },
  },
  // Plain git rm deleted .env, and it was never anywhere git could bring it back from
  // except the old commit: only Rewind restores Kyle's own settings file.
  rewindOnly: ['untrack-env > git-rm'],
  gates: {
    // Rewriting a committed .gitignore loses nothing a guard protects.
    'ignore-noise > ignore-debug > ignore-rules > write .gitignore': false,
    'ignore-noise > ignore-debug > reload-dock > write .gitignore': false,
    // Plain git rm deletes .env from disk: the one harmful line.
    'untrack-env > git-rm > git rm .env': true,
    'untrack-env > rule-only > git-rm > git rm .env': true,
    // --cached only moves the dock, but it asks, so Kyle approves the untrack knowingly.
    'untrack-env > rm-cached > git rm --cached .env': false,
    'untrack-env > rule-only > rm-cached > git rm --cached .env': false,
    'untrack-env > rule-only > untrack-now > git rm --cached .env': false,
    'untrack-env > git-rm > rm-cached > git rm --cached .env': false,
    'untrack-env > git-rm > untrack-now > git rm --cached .env': false,
    'untrack-env > rm-cached > write .gitignore': false,
    'untrack-env > rule-only > write .gitignore': false,
    'untrack-env > git-rm > rule-only > write .gitignore': false,
    // Blanking the leaked example rewrites a committed file: safe, since .env stays.
    'commit-cleanup > copy-env > blank-example > write .env.example': false,
    'commit-cleanup > copy-env > names-only > write .env.example': false,
  },
});

describeJudgmentDrills(mission, {
  'ignore-approve-git-rm': { key: ['deny'], wrong: 'allow' },
  'ignore-approve-rm-cached': { key: ['allow'], wrong: 'deny' },
  'ignore-negate': { key: ['example-only'], wrong: 'all-three' },
  'ignore-diagnose-rule': { key: ['still-tracked'], wrong: 'ignored' },
  'ignore-diagnose-leak': { key: ['leaked'], wrong: 'names' },
  'ignore-tracked-dist': { key: ['rm-cached'], wrong: 'git-rm' },
});

describe('The Ignore List, directed', () => {
  it('fits the word budgets Act 2 checks', () => {
    expect(validateAct(act2, act2Missions)).toEqual([]);
    expect(mission.approvals).toBe('destructive');
  });

  it('puts a harmful gate on plain git rm, worded as the file it deletes', () => {
    const start = canonicalStart(mission, 1);
    const dry = dryRun(
      start,
      { do: 'run', line: 'git rm .env' },
      { guards: untrackEnv.agent?.guards ?? [] },
      testDeps(),
    );
    expect(dry.harmful).toBe(true);
    expect(dry.broken).toEqual(['.env stays on your disk']);
    expect(describeChanges(dry.changes, (path) => path)).toEqual([
      'Deletes .env from the Workbench',
      'Moves .env onto the Loading Dock',
    ]);
  });

  it('asks before git rm --cached, which only takes .env off the dock, and Kyle allows it', () => {
    const begun = { log: canonicalStart(mission, 1), state: beginAgentStep(untrackEnv) };
    const played = playCard(mission, untrackEnv, begun, 'rm-cached', 'deny-harmful');
    expect(played.gates).toEqual([
      { line: 'git rm --cached .env', harmful: false },
      { line: 'write .gitignore', harmful: false },
    ]);
    expect(played.predicts).toEqual([
      { question: 'Before Otto runs it: where does .env end up?', trueOptions: ['on-disk'] },
    ]);
  });

  it("commits the build output when Otto only makes git status quiet, and Kyle's check catches it", () => {
    const begun = { log: canonicalStart(mission, 0), state: beginAgentStep(ignoreNoise) };
    const played = playCard(mission, ignoreNoise, begun, 'quiet-status', 'deny-harmful');
    // Nothing pauses: committing loses nothing, so only the check can catch it.
    expect(played.gates).toEqual([]);
    const head = queriesOf(played.log).fileAt('HEAD', 'dist/app.js');
    expect(head).not.toBeNull();
  });

  it('ends the reference path with .env on disk, out of the Vault, and the names shared', () => {
    const q = queriesOf(canonicalStart(mission, 3));
    expect(q.workingFile('.env')).toContain('dev-only');
    expect(q.fileAt('HEAD', '.env')).toBeNull();
    expect(q.fileAt('HEAD', '.env.example')).toBe('API_KEY=\nDATABASE_URL=\n');
    expect(q.headCommit()?.message).toBe('chore: keep secrets out of git');
    expect(commitCleanup.agent?.hintPlan).toBe('names-only');
  });
});
