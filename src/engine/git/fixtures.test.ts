import { describe, expect, it } from 'vitest';
import { buildWorkspace, DEFAULT_EDIT, defaultDeps, folder, repo } from './fixtures';
import { gitQueries } from './queries';
import { testDeps } from './testDeps';

describe('fixture builder', () => {
  it('builds the DESIGN.md example: a commit, an edit, and an untracked secret', () => {
    const ws = repo()
      .commit('init', { 'app.ts': 'export {};\n', 'README.md': '# App\n' })
      .modify('app.ts')
      .untracked('.env', 'API_KEY=placeholder')
      .build(testDeps());
    const q = gitQueries(ws);

    expect(q.log().map((commit) => commit.message)).toEqual(['init']);
    expect(q.modifiedPaths()).toEqual(['app.ts']);
    expect(q.untrackedPaths()).toEqual(['.env']);
    expect(q.workingFile('app.ts')).toBe(`export {};\n${DEFAULT_EDIT}`);
  });

  it('can replace content, delete, and stage specific paths', () => {
    const ws = repo()
      .commit('init', { 'a.ts': 'a', 'b.ts': 'b' })
      .modify('a.ts', 'A')
      .delete('b.ts')
      .stage('a.ts', 'b.ts')
      .write('c.ts', 'c')
      .build(testDeps());
    const q = gitQueries(ws);
    expect(q.stagedPaths()).toEqual(['a.ts', 'b.ts']);
    expect(q.status().staged.map((change) => change.kind)).toEqual(['modified', 'deleted']);
    expect(q.untrackedPaths()).toEqual(['c.ts']);
  });

  it('appends to a file that does not exist yet as a new file', () => {
    const ws = folder().modify('notes.md').build(testDeps());
    expect(ws.fs.readFile('notes.md')).toBe(DEFAULT_EDIT);
  });

  it('builds a plain folder without a repository', () => {
    const ws = folder().write('index.html', '<h1>hi</h1>').build(testDeps());
    expect(ws.repo).toBeNull();
    expect(gitQueries(ws).isRepo()).toBe(false);
  });

  it('never mutates a shared base builder', () => {
    const base = repo().commit('init', { 'a.ts': 'a' });
    const withEdit = base.modify('a.ts', 'changed');
    expect(base.toSpec()).toHaveLength(4);
    expect(withEdit.toSpec()).toHaveLength(5);
  });

  it('replays a stored spec into an identical workspace', () => {
    const spec = repo().commit('init', { 'a.ts': 'a' }).commit('second', { 'b.ts': 'b' }).toSpec();
    const first = buildWorkspace(spec, testDeps());
    const second = buildWorkspace(spec, testDeps());
    expect(first.repo?.headCommitId()).toBe(second.repo?.headCommitId());
    expect(gitQueries(first).log()).toHaveLength(2);
  });

  it('uses the real clock and SHA-1 by default', () => {
    const deps = defaultDeps();
    expect(deps.hash('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(Math.abs(deps.clock() - Date.now())).toBeLessThan(1000);
    expect(repo().commit('init', { 'a.ts': 'a' }).build().repo?.headCommit()?.message).toBe('init');
  });
});
