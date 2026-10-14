import { describe, expect, it } from 'vitest';
import { folder, repo, windows } from './fixtures';
import { runGit } from './git/cli/runGit';
import { testDeps } from './git/testDeps';
import { loadWorkbench, saveWorkbench } from './workbench';
import type { Workspace } from './workspace';

function git(ws: Workspace, ...argv: string[]): string {
  const result = runGit(ws, { cwd: '', displayRoot: 'C:/project' }, argv);
  return result.lines.map((entry) => entry.text).join('\n');
}

/** Through JSON and back, as the save stores it. */
function roundTrip(ws: Workspace): Workspace {
  const data: unknown = JSON.parse(JSON.stringify(saveWorkbench(ws)));
  return loadWorkbench(data as ReturnType<typeof saveWorkbench>, testDeps());
}

describe('a saved Workbench', () => {
  it('comes back with the same files, staging area, history and reflog', () => {
    const ws = repo()
      .commit('feat: first', { 'app.ts': 'one\n' })
      .modify('app.ts', 'two\n')
      .untracked('notes/todo.txt', 'later\n')
      .build(testDeps());
    git(ws, 'add', 'app.ts');
    git(ws, 'commit', '-m', 'feat: second');
    git(ws, 'reset', '--soft', 'HEAD~1');
    ws.fs.makeDir('empty');

    const back = roundTrip(ws);
    expect(back.fs.allFiles()).toEqual(ws.fs.allFiles());
    expect(back.fs.readFile('notes/todo.txt')).toBe('later\n');
    expect(back.fs.isDir('empty')).toBe(true);
    expect(git(back, 'status')).toBe(git(ws, 'status'));
    expect(git(back, 'log', '--oneline')).toBe(git(ws, 'log', '--oneline'));
    expect(git(back, 'reflog')).toBe(git(ws, 'reflog'));
    expect(back.repo?.headCommitId()).toBe(ws.repo?.headCommitId());
  });

  it('keeps work staged but not yet committed', () => {
    const ws = repo().commit('feat: a', { 'a.ts': 'a\n' }).build(testDeps());
    ws.writeFile('b.ts', 'b\n');
    git(ws, 'add', 'b.ts');
    const back = roundTrip(ws);
    expect(back.repo?.indexEntries().has('b.ts')).toBe(true);
    // A commit after resuming works on the restored history.
    git(back, 'commit', '-m', 'feat: b');
    expect(git(back, 'log', '--oneline').split('\n')).toHaveLength(2);
  });

  it('stays a plain folder when git init never ran', () => {
    const back = roundTrip(folder().write('README.md', '# hi\n').build(testDeps()));
    expect(back.repo).toBeNull();
    expect(back.fs.readFile('README.md')).toBe('# hi\n');
  });

  it('refuses a laptop, which comes back by replaying its log instead', () => {
    const laptop = windows().build(testDeps());
    expect(() => saveWorkbench(laptop)).toThrow('laptop');
  });
});
