import { describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { drive } from '../../engine/shell/driver';
import { describeChanges } from '../../game/agent/effects';
import { dryRun, replay } from '../../game/agent/replay';
import { answerCheck, beginAgentStep, openFixRound } from '../../game/missions/agentRunner';
import { validateAct } from '../../game/missions/validateAct';
import { describeDirectedMission, describeJudgmentDrills } from '../act1/directed.test-helpers';
import { canonicalStart, playCard, queriesOf, trueChecks } from '../act1/play.test-helpers';
import { act2, act2Lessons, act2Missions } from './index';

/*
 * Mission 2.4, The Ignore List, played card by card and drill by drill
 * (src/content/act1/directed.test-helpers.ts), on a git project. The tables are what each
 * card and drill is meant to do; the engine works out the real answers, so a drift fails
 * here instead of grading Kyle wrong.
 *
 * The mission pauses only where something is lost (`destructive`). Its gates: plain
 * `git rm .env` deletes the file and is harmful, `git rm --cached .env` asks on purpose
 * and is safe. Rewriting a committed .gitignore or .env.example doesn't pause: the old
 * version is still in the Vault. 'direct' means Otto stopped for new directions.
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
    // Plain git rm deletes .env from disk: the one harmful line.
    'untrack-env > git-rm > git rm .env': true,
    'untrack-env > rule-only > git-rm > git rm .env': true,
    // --cached only moves the dock, but it asks, so Kyle approves the untrack knowingly.
    'untrack-env > rm-cached > git rm --cached .env': false,
    'untrack-env > rule-only > rm-cached > git rm --cached .env': false,
    'untrack-env > rule-only > untrack-now > git rm --cached .env': false,
    'untrack-env > git-rm > rm-cached > git rm --cached .env': false,
    'untrack-env > git-rm > untrack-now > git rm --cached .env': false,
    // Denied, .env is still tracked and on disk, so the untrack cards run as from the start.
    'untrack-env > git-rm (denied) > rm-cached > git rm --cached .env': false,
    'untrack-env > git-rm (denied) > untrack-now > git rm --cached .env': false,
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
    expect(validateAct(act2, act2Missions, act2Lessons)).toEqual([]);
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
      'Marks .env for removal: the next commit drops it',
    ]);
  });

  it('asks before git rm --cached, which only takes .env off the dock, and Kyle allows it', () => {
    const begun = { log: canonicalStart(mission, 1), state: beginAgentStep(untrackEnv) };
    const played = playCard(mission, untrackEnv, begun, 'rm-cached', 'deny-harmful');
    // One gate: the .gitignore rewrite after it loses nothing, so it doesn't pause.
    expect(played.gates).toEqual([{ line: 'git rm --cached .env', harmful: false }]);
    expect(played.predicts).toEqual([
      { question: 'Before Otto runs it: where does .env end up?', trueOptions: ['on-disk'] },
    ]);
  });

  it('words git rm --cached as a removal the next commit makes, never as loading the dock', () => {
    const dryLines = (upTo: number, line: string) =>
      describeChanges(
        dryRun(canonicalStart(mission, upTo), { do: 'run', line }, { guards: [] }, testDeps())
          .changes,
        (path) => path,
      );
    expect(dryLines(1, 'git rm --cached .env')).toEqual([
      'Marks .env for removal: the next commit drops it',
    ]);
    const quiet = playCard(
      mission,
      ignoreNoise,
      { log: canonicalStart(mission, 0), state: beginAgentStep(ignoreNoise) },
      'quiet-status',
      'deny-harmful',
    );
    const emptied = dryRun(
      quiet.log,
      { do: 'run', line: 'git rm -r --cached .' },
      { guards: [] },
      testDeps(),
    );
    expect(describeChanges(emptied.changes, (path) => path)).toEqual([
      'Marks 8 files for removal: the next commit drops them',
    ]);
  });

  it('tells the truth in the step 2 check: git status still lists .env, as a staged removal', () => {
    const q = queriesOf(canonicalStart(mission, 2));
    expect(q.status().staged).toEqual([{ kind: 'deleted', path: '.env' }]);
    const safe = untrackEnv.agent?.check.options.find((option) => option.id === 'safe');
    expect(safe?.feedback).toContain('only as a removal for the next commit');
  });

  it('grades the step 1 check by the last commit, since an older one may still hold the noise', () => {
    const quiet = playCard(
      mission,
      ignoreNoise,
      { log: canonicalStart(mission, 0), state: beginAgentStep(ignoreNoise) },
      'quiet-status',
      'deny-harmful',
    );
    // Kyle answers truthfully that it's sealed, which opens the fix round.
    const checked = answerCheck(quiet.state, ignoreNoise, 'committed', queriesOf(quiet.log));
    const round = { log: quiet.log, state: openFixRound(checked) };
    const fixed = playCard(mission, ignoreNoise, round, 'reload-dock', 'deny-harmful');
    expect(trueChecks(ignoreNoise, fixed.log)).toEqual(['hidden']);
    const q = queriesOf(fixed.log);
    expect(q.fileAt('HEAD', 'dist/app.js')).toBeNull();
    expect(q.fileAt('HEAD~1', 'dist/app.js')).not.toBeNull();
    const hidden = ignoreNoise.agent?.check.options.find((option) => option.id === 'hidden');
    expect(hidden?.text).toBe('Hidden from git, not in the last commit');
    expect(hidden?.text).not.toContain('never');
  });

  it("commits the build output when Otto only makes git status quiet, and Kyle's check catches it", () => {
    const begun = { log: canonicalStart(mission, 0), state: beginAgentStep(ignoreNoise) };
    const played = playCard(mission, ignoreNoise, begun, 'quiet-status', 'deny-harmful');
    // Nothing pauses: committing loses nothing, so only the check can catch it.
    expect(played.gates).toEqual([]);
    const head = queriesOf(played.log).fileAt('HEAD', 'dist/app.js');
    expect(head).not.toBeNull();
  });

  it("prints the committed .env.example at the last check, so each answer's proof is on screen", () => {
    const looked = (planId: string): string[] => {
      const begun = { log: canonicalStart(mission, 2), state: beginAgentStep(commitCleanup) };
      const played = playCard(mission, commitCleanup, begun, planId, 'allow-all');
      const { shell } = replay(played.log, testDeps());
      const look = commitCleanup.agent?.looks.find((candidate) => candidate.id === 'example');
      if (look === undefined) throw new Error('Step 3 has no look at the committed example.');
      return drive(shell, { do: 'run', line: look.line }).lines.map((line) => line.text);
    };
    // The names option's feedback quotes exactly this.
    expect(looked('names-only')).toEqual(['API_KEY=', 'DATABASE_URL=']);
    expect(looked('copy-env')).toContain('API_KEY=dev-only');
    expect(looked('add-all').join('\n')).toContain("does not exist in 'HEAD'");
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
