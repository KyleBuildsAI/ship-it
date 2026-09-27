import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '../../../workspace';
import { repo } from '../../fixtures';
import { gitQueries } from '../../queries';
import { testDeps } from '../../testDeps';
import { git, gitText } from '../testRun';

const edited = () =>
  repo()
    .commit('one', { 'app.ts': 'v1', 'lib.ts': 'lib1' })
    .commit('two', { 'app.ts': 'v2' })
    .modify('app.ts', 'v3')
    .stage('app.ts')
    .modify('app.ts', 'v4')
    .modify('lib.ts', 'lib-edit');

describe('git restore', () => {
  it('discards working-directory edits back to the staged version', () => {
    const ws = edited().build(testDeps());
    git(ws, ['restore', 'app.ts', 'lib.ts']);
    const q = gitQueries(ws);
    expect(q.workingFile('app.ts')).toBe('v3');
    expect(q.workingFile('lib.ts')).toBe('lib1');
    expect(q.stagedPaths()).toEqual(['app.ts']);
  });

  it('unstages with --staged and keeps the edit on disk', () => {
    const ws = edited().build(testDeps());
    const events: EngineEvent[] = [];
    ws.events.on((event) => events.push(event));
    git(ws, ['restore', '--staged', 'app.ts']);
    const q = gitQueries(ws);
    expect(q.stagedPaths()).toEqual([]);
    expect(q.workingFile('app.ts')).toBe('v4');
    expect(events).toEqual([{ type: 'unstaged', paths: ['app.ts'] }]);
  });

  it('resets both areas to HEAD with --staged --worktree', () => {
    const ws = edited().build(testDeps());
    git(ws, ['restore', '-SW', 'app.ts']);
    expect(gitQueries(ws).workingFile('app.ts')).toBe('v2');
    expect(gitQueries(ws).isClean()).toBe(false);
  });

  it('restores an older version from any commit with --source', () => {
    const ws = edited().build(testDeps());
    git(ws, ['restore', '--source=HEAD~1', 'app.ts']);
    expect(gitQueries(ws).workingFile('app.ts')).toBe('v1');
    git(ws, ['restore', '-s', 'HEAD', 'app.ts']);
    expect(gitQueries(ws).workingFile('app.ts')).toBe('v2');
  });

  it('takes a newly added file off the dock with --staged, leaving it untracked', () => {
    const ws = repo()
      .commit('init', { 'a.ts': 'a' })
      .untracked('new.ts', 'n')
      .stage('new.ts')
      .build(testDeps());
    git(ws, ['restore', '--staged', 'new.ts']);
    expect(gitQueries(ws).untrackedPaths()).toEqual(['new.ts']);
  });

  it('brings back a deleted file', () => {
    const ws = repo().commit('init', { 'a.ts': 'a' }).delete('a.ts').build(testDeps());
    git(ws, ['restore', '.']);
    expect(gitQueries(ws).isClean()).toBe(true);
  });

  it('deletes a file that the chosen source does not have', () => {
    const ws = repo()
      .commit('one', { 'a.ts': 'a' })
      .commit('two', { 'b.ts': 'b' })
      .build(testDeps());
    git(ws, ['restore', '--source=HEAD~1', 'b.ts']);
    expect(gitQueries(ws).workingFile('b.ts')).toBeNull();
  });

  it('refuses untracked files and paths git has never seen', () => {
    const ws = repo().commit('init', { 'a.ts': 'a' }).untracked('new.ts').build(testDeps());
    const result = git(ws, ['restore', 'new.ts']);
    expect(result.exitCode).toBe(1);
    expect(gitText(ws, ['restore', 'ghost.ts'])).toBe(
      "error: pathspec 'ghost.ts' did not match any file(s) known to git",
    );
  });

  it('requires a path, a known revision, and a commit for --staged', () => {
    const ws = repo().commit('init', { 'a.ts': 'a' }).build(testDeps());
    expect(gitText(ws, ['restore'])).toBe('fatal: you must specify path(s) to restore');
    expect(gitText(ws, ['restore', '--source=nope', 'a.ts'])).toBe('fatal: could not resolve nope');
    const unborn = repo().untracked('a.ts').stage('a.ts').build(testDeps());
    expect(gitText(unborn, ['restore', '--staged', 'a.ts'])).toBe('fatal: could not resolve HEAD');
    expect(git(ws, ['restore', '--frob', 'a.ts']).exitCode).toBe(128);
  });
});
