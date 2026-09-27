import { describe, expect, it } from 'vitest';
import { folder, repo } from './fixtures';
import { gitQueries } from './queries';
import { testDeps } from './testDeps';

describe('gitQueries before git init', () => {
  it('answers as an empty repository instead of throwing', () => {
    const q = gitQueries(folder().write('a.ts', 'a').build(testDeps()));
    expect(q.isRepo()).toBe(false);
    expect(q.isClean()).toBe(true);
    expect(q.stagedPaths()).toEqual([]);
    expect(q.trackedPaths()).toEqual([]);
    expect(q.currentBranch()).toBeNull();
    expect(q.headCommit()).toBeNull();
    expect(q.log()).toEqual([]);
    expect(q.fileAt('HEAD', 'a.ts')).toBeNull();
    expect(q.reflog()).toEqual([]);
    expect(q.workingFile('a.ts')).toBe('a');
  });
});

describe('gitQueries on a repository', () => {
  const build = () =>
    repo()
      .commit('feat: first', { 'app.ts': 'v1', '.gitignore': '*.log\n' })
      .commit('feat: second', { 'app.ts': 'v2' })
      .write('debug.log', 'noise')
      .build(testDeps());

  it('reports a clean tree when only ignored files are left over', () => {
    const q = gitQueries(build());
    expect(q.isClean()).toBe(true);
    expect(q.ignoredPaths()).toEqual(['debug.log']);
    expect(q.trackedPaths()).toEqual(['.gitignore', 'app.ts']);
    expect(q.currentBranch()).toBe('main');
    expect(q.headCommit()?.message).toBe('feat: second');
  });

  it('walks history newest first from any ref', () => {
    const q = gitQueries(build());
    expect(q.log().map((commit) => commit.message)).toEqual(['feat: second', 'feat: first']);
    expect(q.log('HEAD~1').map((commit) => commit.message)).toEqual(['feat: first']);
    expect(q.log('no-such-branch')).toEqual([]);
  });

  it('reads files as they were at any commit', () => {
    const q = gitQueries(build());
    expect(q.fileAt('HEAD', 'app.ts')).toBe('v2');
    expect(q.fileAt('HEAD~1', 'app.ts')).toBe('v1');
    expect(q.fileAt('HEAD', 'missing.ts')).toBeNull();
    expect(q.fileAt('HEAD~9', 'app.ts')).toBeNull();
    expect(q.workingFile('missing.ts')).toBeNull();
  });

  it('exposes the reflog, newest first', () => {
    const q = gitQueries(build());
    expect(q.reflog().map((entry) => entry.message)).toEqual([
      'commit: feat: second',
      'commit (initial): feat: first',
    ]);
  });
});
