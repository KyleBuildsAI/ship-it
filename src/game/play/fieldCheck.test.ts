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

  it('refuses a paste that looks like it holds a secret, before any parser reads it', () => {
    // Built from parts so no whole token-shaped string sits in the repo.
    const fakeToken = 'ghp_' + 'a'.repeat(36);
    const leaked = `${CLEAN_LONG}\nGITHUB_TOKEN=${fakeToken}`;
    const verdict = verifyPaste(verification({}), leaked);
    expect(verdict).toMatchObject({ passed: false, clearPaste: true });
    expect(verdict.message).toContain('rotate it');
    expect(verdict.message).not.toContain('aaaa');
    // An ordinary paste is never marked for clearing.
    expect(verifyPaste(verification({}), CLEAN_LONG).clearPaste).toBeUndefined();
  });

  it('checks a tracked file is on a git ls-files list', () => {
    const check = verification({
      parser: 'ls-files',
      command: 'git ls-files',
      check: { kind: 'tracksAny', paths: ['CLAUDE.md', 'AGENTS.md'] },
    });
    expect(verifyPaste(check, 'agents.md\nsrc/app.ts\n')).toEqual({
      passed: true,
      message: 'Git tracks AGENTS.md.',
    });
    expect(verifyPaste(check, 'src/app.ts\n').passed).toBe(false);
    expect(verifyPaste(check, 'warning: not a list\n').passed).toBe(false);
  });

  it('checks the newest written commit has the asked-for type, past a pulled merge', () => {
    const check = verification({
      parser: 'log-oneline',
      command: 'git log --oneline -3',
      check: { kind: 'newestCommitType', type: 'docs' },
    });
    const merged = [
      'f00ba12 (HEAD -> main, origin/main) Merge pull request #3 from kyle/brief',
      'a1b2c3d docs: add environment setup for agents',
    ].join('\n');
    expect(verifyPaste(check, merged).passed).toBe(true);
    const verdict = verifyPaste(check, LOG);
    expect(verdict.passed).toBe(false);
    expect(verdict.message).toContain('docs:');
  });

  it('with pushed, needs the branch level with its remote branch', () => {
    const check = verification({ check: { kind: 'clean', pushed: true } });
    expect(verifyPaste(check, CLEAN_LONG)).toEqual({
      passed: true,
      message: 'Committed and pushed: GitHub has it.',
    });
    const ahead = CLEAN_LONG.replace(
      "Your branch is up to date with 'origin/main'.",
      "Your branch is ahead of 'origin/main' by 2 commits.",
    );
    expect(verifyPaste(check, ahead).message).toContain('2 commits still only on this computer');
    const local = 'On branch main\nnothing to commit, working tree clean';
    expect(verifyPaste(check, local).message).toContain('can’t show the push');
    const dirty = verifyPaste(check, '## main...origin/main\n?? CLAUDE.md');
    expect(dirty.message).toContain('Not clean');
  });
});
