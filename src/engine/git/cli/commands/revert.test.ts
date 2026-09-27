import { describe, expect, it } from 'vitest';
import { repo } from '../../fixtures';
import { gitQueries } from '../../queries';
import { testDeps } from '../../testDeps';
import { git, gitText } from '../testRun';

const history = () =>
  repo()
    .commit('feat: one', { 'a.ts': 'a1\n' })
    .commit('feat: add b', { 'b.ts': 'b\n' })
    .commit('fix: change a', { 'a.ts': 'a2\n' })
    .build(testDeps());

describe('git revert', () => {
  it('undoes the latest commit with a new commit', () => {
    const ws = history();
    const reverted = gitQueries(ws).headCommit()?.id ?? '';
    const text = gitText(ws, ['revert', 'HEAD']);
    const q = gitQueries(ws);
    expect(text).toMatch(
      /^\[main [0-9a-f]{7}\] Revert "fix: change a"\n 1 file changed, 1 insertion\(\+\), 1 deletion\(-\)$/,
    );
    expect(q.headCommit()?.message).toBe(
      `Revert "fix: change a"\n\nThis reverts commit ${reverted}.`,
    );
    expect(q.workingFile('a.ts')).toBe('a1\n');
    expect(q.log()).toHaveLength(4);
    expect(q.isClean()).toBe(true);
  });

  it('undoes an older commit whose files did not change since', () => {
    const ws = history();
    git(ws, ['revert', 'HEAD~1', '--no-edit']);
    expect(gitQueries(ws).workingFile('b.ts')).toBeNull();
    expect(gitQueries(ws).fileAt('HEAD', 'a.ts')).toBe('a2\n');
  });

  it('can revert the first commit, deleting what it added', () => {
    const ws = repo().commit('init', { 'a.ts': 'a' }).build(testDeps());
    git(ws, ['revert', 'HEAD']);
    expect(gitQueries(ws).trackedPaths()).toEqual([]);
  });

  it('stages the undo without committing with --no-commit', () => {
    const ws = history();
    expect(git(ws, ['revert', '-n', 'HEAD']).exitCode).toBe(0);
    expect(gitQueries(ws).stagedPaths()).toEqual(['a.ts']);
    expect(gitQueries(ws).log()).toHaveLength(3);
  });

  it('refuses to revert over uncommitted work', () => {
    const ws = history();
    ws.writeFile('a.ts', 'wip\n');
    const result = git(ws, ['revert', 'HEAD']);
    expect(result.exitCode).toBe(128);
    expect(gitText(ws, ['revert', 'HEAD'])).toContain(
      'your local changes would be overwritten by revert',
    );
    git(ws, ['restore', 'a.ts']);
    git(ws, ['rm', '--cached', '-q', 'b.ts']);
    expect(git(ws, ['revert', 'HEAD']).exitCode).toBe(128);
  });

  it('stops before a conflict when the file changed again later', () => {
    const ws = history();
    const result = git(ws, ['revert', 'HEAD~2']);
    expect(result.exitCode).toBe(1);
    expect(gitText(ws, ['revert', 'HEAD~2'])).toContain('a.ts changed again after that commit');
    expect(gitQueries(ws).log()).toHaveLength(3);
  });

  it('checks its arguments', () => {
    const ws = history();
    expect(gitText(ws, ['revert'])).toBe('fatal: empty commit set passed');
    expect(git(ws, ['revert', 'nope']).exitCode).toBe(128);
    expect(git(ws, ['revert', '--frob', 'HEAD']).exitCode).toBe(128);
  });
});
