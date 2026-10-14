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

  it('finds a tracked file by pattern in a git ls-files paste', () => {
    const check = verification({
      parser: 'ls-files',
      command: 'git ls-files',
      check: { kind: 'tracksPath', pattern: 'docs/specs/*.md' },
    });
    const found = verifyPaste(check, 'README.md\ndocs/specs/tide-alerts.md\n');
    expect(found).toEqual({ passed: true, message: 'Tracked: docs/specs/tide-alerts.md.' });
    const missing = verifyPaste(check, 'README.md\ndocs/notes.md\n');
    expect(missing.passed).toBe(false);
    expect(missing.message).toContain('docs/specs/*.md');
    expect(verifyPaste(check, '\n\n').message).toContain('Paste the output');
  });

  it('tells a PR merge from a commit pushed straight to main', () => {
    const check = verification({
      parser: 'log-oneline',
      command: 'git log --oneline --first-parent -1',
      check: { kind: 'viaPullRequest' },
    });
    expect(verifyPaste(check, 'a1b2c3d feat: add tide alerts (#14)').passed).toBe(true);
    expect(verifyPaste(check, 'a1b2c3d Merge pull request #14 from kyle/tide').passed).toBe(true);
    const direct = verifyPaste(check, 'a1b2c3d feat: add tide alerts');
    expect(direct.passed).toBe(false);
    expect(direct.message).toContain('PR');
  });

  it('uses a mission’s own words for an empty paste and for advice, when it has them', () => {
    const empty = verification({
      parser: 'log-oneline',
      command: 'git log --oneline -- docs/specs',
      check: { kind: 'minCommits', count: 1 },
      whenEmpty: 'It printed nothing: no spec is on main yet.',
    });
    expect(verifyPaste(empty, '  \n').message).toBe('It printed nothing: no spec is on main yet.');
    const secrets = verification({
      parser: 'ls-files',
      command: 'git ls-files',
      check: { kind: 'noTrackedSecrets' },
      advice: 'Roll that key first.',
    });
    expect(verifyPaste(secrets, '.env\n').message).toBe('Still tracked: .env. Roll that key first.');
    const status = { ...secrets, parser: 'status-short', command: 'git status --short' } as const;
    expect(verifyPaste(status, 'A  .env\n').message).toContain('Roll that key first.');
    const titles = verification({
      parser: 'log-oneline',
      command: 'git log --oneline -1',
      check: { kind: 'conventionalRatio', min: 1, last: 1 },
      advice: 'Fix it in your next PR title.',
    });
    expect(verifyPaste(titles, 'a1b2c3d Add tide alerts (#14)').message).toContain(
      'Fix it in your next PR title.',
    );
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
