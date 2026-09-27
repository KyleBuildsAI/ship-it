import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '../../../workspace';
import { repo } from '../../fixtures';
import { gitQueries } from '../../queries';
import { testDeps } from '../../testDeps';
import { git, gitText } from '../testRun';

describe('git commit', () => {
  it("records the first commit with git's summary", () => {
    const ws = repo()
      .untracked('app.ts', 'a\nb\n')
      .untracked('README.md', '# App\n')
      .stage('app.ts', 'README.md')
      .build(testDeps());
    const text = gitText(ws, ['commit', '-m', 'feat: first commit']);
    const id = gitQueries(ws).headCommit()?.id.slice(0, 7) ?? '';
    expect(text).toBe(
      [
        `[main (root-commit) ${id}] feat: first commit`,
        ' 2 files changed, 3 insertions(+)',
        ' create mode 100644 README.md',
        ' create mode 100644 app.ts',
      ].join('\n'),
    );
  });

  it('commits only what is staged', () => {
    const ws = repo()
      .commit('init', { 'a.ts': 'a\n', 'b.ts': 'b\n' })
      .modify('a.ts', 'A\n')
      .modify('b.ts', 'B\n')
      .stage('a.ts')
      .build(testDeps());
    expect(gitText(ws, ['commit', '-m', 'fix: a'])).toContain(
      ' 1 file changed, 1 insertion(+), 1 deletion(-)',
    );
    const q = gitQueries(ws);
    expect(q.fileAt('HEAD', 'b.ts')).toBe('b\n');
    expect(q.modifiedPaths()).toEqual(['b.ts']);
  });

  it('stages tracked edits and deletions first with -a, but never untracked files', () => {
    const ws = repo()
      .commit('init', { 'a.ts': 'a\n', 'gone.ts': 'g\n' })
      .modify('a.ts', 'A\n')
      .delete('gone.ts')
      .untracked('new.ts', 'n\n')
      .build(testDeps());
    const text = gitText(ws, ['commit', '-am', 'chore: tidy']);
    expect(text).toContain(' delete mode 100644 gone.ts');
    const q = gitQueries(ws);
    expect(q.trackedPaths()).toEqual(['a.ts']);
    expect(q.untrackedPaths()).toEqual(['new.ts']);
  });

  it('reports renames made with git mv', () => {
    const ws = repo().commit('init', { 'old.ts': 'x\n' }).build(testDeps());
    git(ws, ['mv', 'old.ts', 'new.ts']);
    expect(gitText(ws, ['commit', '-m', 'refactor: rename'])).toContain(
      ' 1 file changed, 0 insertions(+), 0 deletions(-)\n rename old.ts => new.ts (100%)',
    );
  });

  it('joins several -m values into paragraphs', () => {
    const ws = repo().untracked('a.ts').stage('a.ts').build(testDeps());
    git(ws, ['commit', '-m', 'feat: subject', '-m', 'Body text.']);
    expect(gitQueries(ws).headCommit()?.message).toBe('feat: subject\n\nBody text.');
  });

  it('refuses when nothing is staged, explaining with the status text', () => {
    const clean = repo().commit('init', { 'a.ts': 'a' }).build(testDeps());
    const result = git(clean, ['commit', '-m', 'nothing']);
    expect(result.exitCode).toBe(1);
    expect(gitText(clean, ['commit', '-m', 'nothing'])).toBe(
      'On branch main\nnothing to commit, working tree clean',
    );
    const dirty = repo().commit('init', { 'a.ts': 'a' }).modify('a.ts', 'b').build(testDeps());
    expect(gitText(dirty, ['commit', '-m', 'x'])).toContain('no changes added to commit');
    const empty = repo().build(testDeps());
    expect(gitText(empty, ['commit', '-m', 'x'])).toContain('Initial commit');
  });

  it('allows an empty commit only when asked', () => {
    const ws = repo().commit('init', { 'a.ts': 'a' }).build(testDeps());
    expect(git(ws, ['commit', '--allow-empty', '-m', 'chore: trigger deploy']).exitCode).toBe(0);
    expect(gitQueries(ws).log()).toHaveLength(2);
  });

  it('needs a non-empty message', () => {
    const ws = repo().untracked('a.ts').stage('a.ts').build(testDeps());
    expect(gitText(ws, ['commit'])).toContain('hint: write the message inline');
    expect(gitText(ws, ['commit', '-m', '   '])).toBe(
      'Aborting commit due to empty commit message.',
    );
    expect(gitQueries(ws).log()).toEqual([]);
    expect(git(ws, ['commit', '--amend']).exitCode).toBe(128);
  });

  it('is quiet with -q and says "detached HEAD" when detached', () => {
    const ws = repo()
      .commit('one', { 'a.ts': '1' })
      .commit('two', { 'a.ts': '2' })
      .build(testDeps());
    const repository = ws.requireRepo();
    repository.detachHead(repository.resolve('HEAD~1'), 'checkout: moving from main to HEAD~1');
    ws.writeFile('b.ts', 'b');
    git(ws, ['add', 'b.ts']);
    expect(gitText(ws, ['commit', '-m', 'experiment'])).toMatch(
      /^\[detached HEAD [0-9a-f]{7}\] experiment/,
    );
    git(ws, ['add', 'b.ts']);
    ws.writeFile('c.ts', 'c');
    git(ws, ['add', 'c.ts']);
    expect(gitText(ws, ['commit', '-q', '-m', 'quiet'])).toBe('');
  });

  it('announces the commit, the branch move, and the HEAD move', () => {
    const ws = repo()
      .commit('init', { 'a.ts': 'a' })
      .modify('a.ts', 'b')
      .stage('a.ts')
      .build(testDeps());
    const before = ws.requireRepo().headCommitId();
    const events: EngineEvent[] = [];
    ws.events.on((event) => events.push(event));
    git(ws, ['commit', '-m', 'fix: b']);
    const after = ws.requireRepo().headCommitId() ?? '';
    expect(events.map((event) => event.type)).toEqual(['committed', 'branchMoved', 'headMoved']);
    expect(events[1]).toEqual({ type: 'branchMoved', branch: 'main', from: before, to: after });
  });
});
