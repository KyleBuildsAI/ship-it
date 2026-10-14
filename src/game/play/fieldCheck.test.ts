import { describe, expect, it } from 'vitest';
import { cleanTheDirtyTree } from '../../content/act2/fieldMission';
import { verifyPaste, type Verification } from './fieldCheck';

function verification(overrides: Partial<Verification>): Verification {
  return {
    id: 'check',
    instruction: 'Run it and paste the output.',
    command: 'git status',
    parser: 'status-long',
    check: { kind: 'clean' },
    ...overrides,
  };
}

const CLEAN_LONG = [
  'PS C:\\repos\\sandcastles> git status',
  'On branch main',
  "Your branch is up to date with 'origin/main'.",
  '',
  'nothing to commit, working tree clean',
].join('\r\n');

const DIRTY_SHORT = [
  'PS C:\\repos\\sandcastles> git status --short',
  ' M src/app.ts',
  '?? dist/',
  '?? .env',
].join('\n');

const LOG = [
  'a1b2c3d (HEAD -> main) feat: add tide charts',
  'b2c3d4e fix: stop double deploys',
  'c3d4e5f docs: explain setup',
  'd4e5f60 wip',
].join('\n');

const MERGE_GRAPH = [
  'PS C:\\repos\\sandcastles> git log --oneline --graph -5',
  "*   4d7e1a0 (HEAD -> main, origin/main) Merge branch 'feat/tide-chart'",
  '|\\  ',
  '| * 9c2f6b1 feat: add tide charts',
  '|/  ',
  '* 1a2b3c4 chore: start',
].join('\r\n');

describe('verifyPaste: mergeCommit', () => {
  const check = verification({
    parser: 'log-oneline',
    command: 'git log --oneline --graph -5',
    check: { kind: 'mergeCommit' },
  });

  it('passes a merge of a typed branch whose commit is Conventional', () => {
    expect(verifyPaste(check, MERGE_GRAPH)).toEqual({
      passed: true,
      message: 'Main has a merge commit from feat/tide-chart.',
    });
  });

  it('explains a squash, a missing graph, and an untyped branch', () => {
    expect(verifyPaste(check, '* 4d7e1a0 feat: add tide charts (#3)').message).toContain(
      'Create a merge commit',
    );
    expect(verifyPaste(check, "4d7e1a0 Merge branch 'feat/tide-chart'").message).toContain(
      '--graph',
    );
    expect(verifyPaste(check, MERGE_GRAPH.replace('feat/tide-chart', 'tides')).message).toContain(
      'feat/readme-fix',
    );
    expect(verifyPaste(check, MERGE_GRAPH.replace('feat: add', 'added')).message).toContain(
      'Conventional',
    );
    const unnamed = MERGE_GRAPH.replace("Merge branch 'feat/tide-chart'", "Merge commit 'abc1234'");
    expect(verifyPaste(check, unnamed).message).toContain('name its branch');
    expect(verifyPaste(check, "*   4d7e1a0 Merge branch 'feat/x'").message).toContain('no commit');
    expect(verifyPaste(check, CLEAN_LONG).passed).toBe(false);
  });
});

describe('verifyPaste: clean on a branch, up to date', () => {
  const check = verification({ check: { kind: 'clean', branch: 'main', upToDate: true } });

  it('passes main when it is clean and matches its remote', () => {
    expect(verifyPaste(check, CLEAN_LONG)).toEqual({
      passed: true,
      message: 'Clean, and it matches GitHub.',
    });
  });

  it('fails another branch, unpushed work, or a paste without the branch', () => {
    const onBranch = CLEAN_LONG.replace('On branch main', 'On branch feat/x');
    expect(verifyPaste(check, onBranch).message).toBe("That's feat/x. Switch to main first.");
    const ahead = CLEAN_LONG.replace(
      "Your branch is up to date with 'origin/main'.",
      "Your branch is ahead of 'origin/main' by 2 commits.",
    );
    expect(verifyPaste(check, ahead).message).toContain('Not on GitHub yet');
    const noUpstream = CLEAN_LONG.replace("Your branch is up to date with 'origin/main'.", '');
    expect(verifyPaste(check, noUpstream).passed).toBe(false);
    const short = verification({
      parser: 'status-short',
      command: 'git status -sb',
      check: { kind: 'clean', branch: 'main', upToDate: true },
    });
    expect(verifyPaste(short, '## main...origin/main').passed).toBe(true);
    expect(verifyPaste(short, '## main...origin/main [ahead 1]').passed).toBe(false);
    expect(verifyPaste(short, 'git status -s').message).toContain('show the branch');
  });
});

describe('verifyPaste', () => {
  it('counts commits with the right plural', () => {
    const check = verification({
      parser: 'log-oneline',
      command: 'git log --oneline -1',
      check: { kind: 'minCommits', count: 2 },
    });
    expect(verifyPaste(check, 'a1b2c3d feat: one').message).toBe('Only 1 commit; this needs 2.');
    expect(verifyPaste(check, LOG).message).toBe('4 commits. Nice.');
  });

  it('passes a clean status and explains a dirty one', () => {
    expect(verifyPaste(verification({}), CLEAN_LONG)).toMatchObject({ passed: true });
    const dirty = verifyPaste(
      verification({ parser: 'status-short', command: 'git status --short' }),
      DIRTY_SHORT,
    );
    expect(dirty.passed).toBe(false);
    expect(dirty.message).toContain('Not clean');
  });

  it('asks for the right command when the paste is something else', () => {
    expect(verifyPaste(verification({}), LOG).message).toContain('git status');
    expect(verifyPaste(verification({}), '').message).toContain('Paste the output');
  });

  it('measures Conventional Commits in the newest commits', () => {
    const check = verification({
      parser: 'log-oneline',
      command: 'git log --oneline -10',
      check: { kind: 'conventionalRatio', min: 0.75, last: 10 },
    });
    expect(verifyPaste(check, LOG)).toMatchObject({ passed: true });
    const strict = { ...check, check: { kind: 'conventionalRatio', min: 0.9, last: 10 } } as const;
    expect(verifyPaste(strict, LOG).message).toContain('75%');
    expect(verifyPaste(check, CLEAN_LONG).passed).toBe(false);
  });

  it('counts commits', () => {
    const check = verification({
      parser: 'log-oneline',
      command: 'git log --oneline',
      check: { kind: 'minCommits', count: 5 },
    });
    expect(verifyPaste(check, LOG).message).toContain('Only 4');
  });

  it('finds tracked secrets in a git ls-files paste', () => {
    const check = verification({
      parser: 'ls-files',
      command: 'git ls-files',
      check: { kind: 'noTrackedSecrets' },
    });
    expect(verifyPaste(check, 'src/app.ts\n.env.example\n').passed).toBe(true);
    const leaked = verifyPaste(check, 'src/app.ts\n.env\n');
    expect(leaked.passed).toBe(false);
    expect(leaked.message).toContain('.env');
  });

  it('checks that build output and secrets are ignored', () => {
    const check = verification({
      parser: 'status-short',
      command: 'git status --short',
      check: { kind: 'ignores', patterns: ['.env', 'dist/'] },
    });
    const result = verifyPaste(check, DIRTY_SHORT);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('dist/');
    expect(result.message).toContain('.env');
    expect(verifyPaste(check, ' M src/app.ts\n').passed).toBe(true);
    // With --ignored, git lists ignored files behind !!, which is a pass.
    expect(verifyPaste(check, '!! .env\n!! dist/\n').passed).toBe(true);
    expect(verifyPaste(check, '').message).toContain('Copy the line');
  });

  it("fails the Act 2 Field Mission's ignore check while .env is still visible", () => {
    const check = cleanTheDirtyTree?.verifications.find(
      (entry) => entry.id === 'build-output-ignored',
    );
    if (check === undefined) throw new Error('the Act 2 Field Mission checks ignored files');
    const visible = verifyPaste(check, '?? .env\n!! dist/\n!! node_modules/\n');
    expect(visible.passed).toBe(false);
    expect(visible.message).toContain('.env');
    const ignored = verifyPaste(check, '!! .env\n!! dist/\n!! node_modules/\n');
    expect(ignored).toEqual({ passed: true, message: 'Git ignores .env, dist/, node_modules/.' });
  });
});
