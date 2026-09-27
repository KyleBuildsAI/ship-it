import { describe, expect, it } from 'vitest';
import { repo } from '../../fixtures';
import { gitQueries } from '../../queries';
import { testDeps } from '../../testDeps';
import { git, gitText } from '../testRun';

describe('git reflog', () => {
  it('lists every HEAD move, newest first, with decorations', () => {
    const ws = repo()
      .commit('one', { 'a.ts': '1' })
      .commit('two', { 'a.ts': '2' })
      .build(testDeps());
    git(ws, ['reset', '--hard', 'HEAD~1']);
    const [one, two] = gitQueries(ws)
      .reflog()
      .slice(1)
      .map((entry) => entry.to.slice(0, 7));
    expect(gitText(ws, ['reflog'])).toBe(
      [
        `${two ?? ''} (HEAD -> main) HEAD@{0}: reset: moving to HEAD~1`,
        `${one ?? ''} HEAD@{1}: commit: two`,
        `${two ?? ''} (HEAD -> main) HEAD@{2}: commit (initial): one`,
      ].join('\n'),
    );
    expect(gitText(ws, ['reflog', 'show', 'HEAD', '-n', '1']).split('\n')).toHaveLength(1);
  });

  it('explains an empty reflog and unsupported refs', () => {
    expect(gitText(repo().build(testDeps()), ['reflog'])).toBe(
      "fatal: your current branch 'main' does not have any commits yet",
    );
    const ws = repo().commit('one', { 'a.ts': '1' }).build(testDeps());
    expect(gitText(ws, ['reflog', 'show', 'main'])).toBe(
      'fatal: the sandbox keeps a reflog for HEAD only',
    );
    expect(git(ws, ['reflog', '--frob']).exitCode).toBe(128);
  });
});
