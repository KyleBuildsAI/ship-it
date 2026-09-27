import { describe, expect, it } from 'vitest';
import { folder, repo } from '../fixtures';
import { testDeps } from '../testDeps';
import { fatal, failure, line, ok, toText } from './output';
import { GIT_VERSION } from './runGit';
import { DISPLAY_ROOT, git, gitText } from './testRun';

describe('runGit', () => {
  it('prints help for bare git and git help', () => {
    const ws = folder().build(testDeps());
    expect(gitText(ws, [])).toContain('usage: git <command>');
    expect(gitText(ws, ['help'])).toContain(
      'Commands in this sandbox: add, commit, diff, init, mv, restore, rm, status',
    );
    expect(git(ws, ['--help']).exitCode).toBe(0);
  });

  it('prints the sandbox git version', () => {
    expect(gitText(folder().build(testDeps()), ['--version'])).toBe(GIT_VERSION);
  });

  it('refuses repository commands before git init', () => {
    const result = git(folder().build(testDeps()), ['status']);
    expect(result.exitCode).toBe(128);
    expect(toText(result)).toBe(
      'fatal: not a git repository (or any of the parent directories): .git',
    );
  });

  it('suggests the closest command for a typo', () => {
    const result = git(repo().build(testDeps()), ['stauts']);
    expect(result.exitCode).toBe(1);
    expect(toText(result)).toBe(
      "git: 'stauts' is not a git command. See 'git --help'.\n\nThe most similar command is\n\tstatus",
    );
  });

  it('suggests init for int and stays quiet when nothing is close', () => {
    expect(gitText(repo().build(testDeps()), ['int'])).toContain('\tinit');
    expect(gitText(repo().build(testDeps()), ['frobnicate'])).toBe(
      "git: 'frobnicate' is not a git command. See 'git --help'.",
    );
  });

  it('explains that later-Act commands are real but locked', () => {
    const result = git(repo().build(testDeps()), ['push']);
    expect(result.exitCode).toBe(1);
    expect(toText(result)).toContain('unlock it in a later Act');
  });
});

describe('git init', () => {
  it('creates a repository and then reports reinitialization', () => {
    const ws = folder().build(testDeps());
    expect(gitText(ws, ['init'])).toBe(`Initialized empty Git repository in ${DISPLAY_ROOT}/.git/`);
    expect(ws.repo).not.toBeNull();
    expect(gitText(ws, ['init'])).toBe(
      `Reinitialized existing Git repository in ${DISPLAY_ROOT}/.git/`,
    );
  });

  it('stays silent with -q', () => {
    expect(gitText(folder().build(testDeps()), ['init', '-q'])).toBe('');
  });

  it('refuses a nested repository in a subfolder or a named folder', () => {
    const ws = folder().write('src/app.ts', '').build(testDeps());
    const nested = git(ws, ['init'], 'src');
    expect(nested.exitCode).toBe(128);
    expect(toText(nested)).toContain("hint: run 'cd /' to go to the project root");
    expect(git(ws, ['init', 'other']).exitCode).toBe(128);
    expect(ws.repo).toBeNull();
  });

  it('rejects unknown options', () => {
    expect(gitText(folder().build(testDeps()), ['init', '--bare'])).toBe(
      "fatal: unknown option '--bare'",
    );
  });
});

describe('output helpers', () => {
  it('builds results with git exit codes', () => {
    expect(ok().exitCode).toBe(0);
    expect(failure([line('error: no', 'error')]).exitCode).toBe(1);
    expect(fatal('bad', 'try again')).toEqual({
      lines: [
        { text: 'fatal: bad', tone: 'error' },
        { text: 'hint: try again', tone: 'hint' },
      ],
      exitCode: 128,
    });
  });
});
