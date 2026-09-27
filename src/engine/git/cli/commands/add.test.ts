import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '../../../workspace';
import { repo } from '../../fixtures';
import { gitQueries } from '../../queries';
import { testDeps } from '../../testDeps';
import { git, gitText } from '../testRun';

const base = () =>
  repo()
    .commit('init', { 'README.md': '# App\n', 'src/app.ts': 'v1', '.gitignore': '.env\ndist/\n' })
    .modify('src/app.ts', 'v2')
    .untracked('src/new.ts', 'n')
    .untracked('notes.md', 'todo')
    .untracked('.env', 'SECRET=1')
    .untracked('dist/main.js', 'built')
    .delete('README.md');

describe('git add', () => {
  it('stages one file and leaves the rest alone', () => {
    const ws = base().build(testDeps());
    expect(git(ws, ['add', 'src/app.ts']).exitCode).toBe(0);
    const q = gitQueries(ws);
    expect(q.stagedPaths()).toEqual(['src/app.ts']);
    expect(q.untrackedPaths()).toEqual(['notes.md', 'src/new.ts']);
  });

  it('stages a whole folder, or the current folder with .', () => {
    const ws = base().build(testDeps());
    git(ws, ['add', '.'], 'src');
    expect(gitQueries(ws).stagedPaths()).toEqual(['src/app.ts', 'src/new.ts']);
  });

  it('stages deletions and skips ignored files with add .', () => {
    const ws = base().build(testDeps());
    expect(git(ws, ['add', '.']).exitCode).toBe(0);
    const q = gitQueries(ws);
    expect(q.stagedPaths()).toEqual(['README.md', 'notes.md', 'src/app.ts', 'src/new.ts']);
    expect(q.ignoredPaths()).toEqual(['.env', 'dist/main.js']);
  });

  it('stages everything from any folder with -A', () => {
    const ws = base().build(testDeps());
    git(ws, ['add', '-A'], 'src');
    expect(gitQueries(ws).stagedPaths()).toHaveLength(4);
  });

  it('stages only tracked files with -u', () => {
    const ws = base().build(testDeps());
    git(ws, ['add', '-u']);
    expect(gitQueries(ws).stagedPaths()).toEqual(['README.md', 'src/app.ts']);
  });

  it('matches globs across folders', () => {
    const ws = base().build(testDeps());
    git(ws, ['add', '*.ts']);
    expect(gitQueries(ws).stagedPaths()).toEqual(['src/app.ts', 'src/new.ts']);
  });

  it('refuses a named ignored file, still stages the others, and exits 1', () => {
    const ws = base().build(testDeps());
    const result = git(ws, ['add', '.env', 'notes.md']);
    expect(result.exitCode).toBe(1);
    expect(gitText(ws, ['add', '.env'])).toBe(
      [
        'The following paths are ignored by one of your .gitignore files:',
        '.env',
        'hint: Use -f if you really want to add them.',
        'hint: Disable this message with "git config set advice.addIgnoredFile false"',
      ].join('\n'),
    );
    expect(gitQueries(ws).stagedPaths()).toEqual(['notes.md']);
  });

  it('refuses an ignored folder by name', () => {
    const ws = base().build(testDeps());
    expect(gitText(ws, ['add', 'dist'])).toContain('\ndist\n');
  });

  it('adds an ignored file anyway with -f', () => {
    const ws = base().build(testDeps());
    expect(git(ws, ['add', '-f', '.env']).exitCode).toBe(0);
    expect(gitQueries(ws).stagedPaths()).toEqual(['.env']);
  });

  it('explains an empty git add', () => {
    const ws = base().build(testDeps());
    expect(gitText(ws, ['add'])).toContain("hint: Maybe you wanted to say 'git add .'?");
    expect(gitQueries(ws).stagedPaths()).toEqual([]);
  });

  it('fails the whole command for a path that matches nothing', () => {
    const ws = base().build(testDeps());
    const result = git(ws, ['add', 'notes.md', 'nope.ts']);
    expect(result.exitCode).toBe(128);
    expect(gitText(ws, ['add', 'nope.ts'])).toBe(
      "fatal: pathspec 'nope.ts' did not match any files",
    );
    expect(gitQueries(ws).stagedPaths()).toEqual([]);
  });

  it('rejects paths outside the project and unknown options', () => {
    const ws = base().build(testDeps());
    expect(git(ws, ['add', '../x']).exitCode).toBe(128);
    expect(git(ws, ['add', '--frob']).exitCode).toBe(128);
  });

  it('announces what was staged, and nothing when nothing changed', () => {
    const ws = base().build(testDeps());
    const events: EngineEvent[] = [];
    ws.events.on((event) => events.push(event));
    git(ws, ['add', 'src/app.ts']);
    git(ws, ['add', 'src/app.ts']);
    expect(events).toEqual([{ type: 'staged', paths: ['src/app.ts'] }]);
  });
});
