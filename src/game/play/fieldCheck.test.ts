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

describe('verifyPaste', () => {
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

describe('a clean check that also asks for the branch and upstream', () => {
  const inSync = verification({ check: { kind: 'clean', branch: 'main', upstream: 'up-to-date' } });

  function status(...lines: string[]): string {
    return [...lines, '', 'nothing to commit, working tree clean'].join('\n');
  }

  it('passes main in step with origin/main, from either format', () => {
    expect(verifyPaste(inSync, CLEAN_LONG)).toEqual({
      passed: true,
      message: 'Clean, and in step with GitHub.',
    });
    const short = verification({
      parser: 'status-short',
      command: 'git status -sb',
      check: { kind: 'clean', branch: 'main', upstream: 'up-to-date' },
    });
    expect(verifyPaste(short, '## main...origin/main\n').passed).toBe(true);
  });

  it('says what to do about each way main can be out of step', () => {
    const ahead = status('On branch main', "Your branch is ahead of 'origin/main' by 1 commit.");
    expect(verifyPaste(inSync, ahead).message).toContain('move them onto a branch');
    const diverged = status(
      'On branch main',
      "Your branch and 'origin/main' have diverged,",
      'and have 1 and 1 different commits each, respectively.',
    );
    expect(verifyPaste(inSync, diverged).message).toContain('without force');
    const gone = status(
      'On branch main',
      "Your branch is based on 'origin/main', but the upstream is gone.",
    );
    expect(verifyPaste(inSync, gone).message).toContain('git fetch');
  });

  it('fails a detached HEAD, naming where to go', () => {
    const detached = 'HEAD detached at 340bbf0\nnothing to commit, working tree clean\n';
    expect(verifyPaste(inSync, detached).message).toContain('not on a branch');
  });
});

describe('the squash-merge and history checks', () => {
  const squash = verification({
    command: 'git log --oneline -1',
    parser: 'log-oneline',
    check: { kind: 'squashMergedPr' },
  });
  const history = verification({
    command: 'git log --all --oneline -- .env',
    parser: 'log-oneline',
    check: { kind: 'noCommits', path: '.env' },
  });

  it('names a plain merge commit as the reason a squash check failed', () => {
    const merged = verifyPaste(squash, 'b2c3d4e Merge pull request #12 from kyle/fix');
    expect(merged.message).toContain('Squash and merge');
    expect(verifyPaste(squash, 'a1b2c3d fix: round tides (#12)').message).toBe(
      'Squash-merged: “fix: round tides (#12)”.',
    );
  });

  it('reads a history search, whatever it prints', () => {
    expect(
      verifyPaste(history, 'PS> git log --all --oneline -- .env\nfatal: oops').message,
    ).toContain('doesn’t look like git log');
    expect(verifyPaste(history, 'a1b2c3d chore: add .env').message).toMatch(/^A commit touched/);
    expect(verifyPaste(history, 'git status').message).toContain('copy the line');
  });
});
