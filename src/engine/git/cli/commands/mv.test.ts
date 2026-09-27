import { describe, expect, it } from 'vitest';
import { repo } from '../../fixtures';
import { gitQueries } from '../../queries';
import { testDeps } from '../../testDeps';
import { git, gitText } from '../testRun';

const committed = () =>
  repo().commit('init', { 'app.ts': 'a', 'lib/util.ts': 'u', 'lib/io.ts': 'io' });

describe('git mv', () => {
  it('renames a file on disk and in the index, shown as a rename', () => {
    const ws = committed().build(testDeps());
    expect(gitText(ws, ['mv', 'app.ts', 'main.ts'])).toBe('');
    const q = gitQueries(ws);
    expect(q.workingFile('main.ts')).toBe('a');
    expect(q.workingFile('app.ts')).toBeNull();
    expect(q.status().staged).toEqual([{ kind: 'renamed', path: 'main.ts', from: 'app.ts' }]);
  });

  it('moves files into an existing folder', () => {
    const ws = committed().build(testDeps());
    ws.fs.makeDir('src');
    git(ws, ['mv', 'app.ts', 'lib/util.ts', 'src']);
    expect(gitQueries(ws).trackedPaths()).toEqual(['app.ts', 'lib/io.ts', 'lib/util.ts']);
    expect(ws.fs.allFiles()).toEqual(['lib/io.ts', 'src/app.ts', 'src/util.ts']);
  });

  it('renames a whole folder and removes the empty original', () => {
    const ws = committed().build(testDeps());
    git(ws, ['mv', 'lib', 'utils']);
    expect(ws.fs.allFiles()).toEqual(['app.ts', 'utils/io.ts', 'utils/util.ts']);
    expect(ws.fs.isDir('lib')).toBe(false);
  });

  it('works from a subfolder with relative paths', () => {
    const ws = committed().build(testDeps());
    git(ws, ['mv', 'util.ts', '../helpers.ts'], 'lib');
    expect(gitQueries(ws).workingFile('helpers.ts')).toBe('u');
  });

  it('refuses untracked, missing, and clashing sources', () => {
    const ws = committed().untracked('draft.ts').build(testDeps());
    expect(gitText(ws, ['mv', 'draft.ts', 'x.ts'])).toBe(
      'fatal: not under version control, source=draft.ts, destination=x.ts',
    );
    expect(gitText(ws, ['mv', 'ghost.ts', 'x.ts'])).toBe(
      'fatal: bad source, source=ghost.ts, destination=x.ts',
    );
    expect(gitText(ws, ['mv', 'app.ts', 'draft.ts'])).toBe(
      'fatal: destination exists, source=app.ts, destination=draft.ts',
    );
    expect(git(ws, ['mv', '-f', 'app.ts', 'draft.ts']).exitCode).toBe(0);
  });

  it('refuses folders with nothing tracked, or moving onto an existing folder name', () => {
    const ws = committed().untracked('scratch/a.ts').build(testDeps());
    expect(gitText(ws, ['mv', 'scratch', 'x'])).toBe(
      'fatal: source directory is empty, source=scratch, destination=x',
    );
    ws.fs.makeDir('dest/lib');
    expect(gitText(ws, ['mv', 'lib', 'dest'])).toBe(
      'fatal: destination exists, source=lib, destination=dest',
    );
  });

  it('checks its arguments', () => {
    const ws = committed().build(testDeps());
    expect(gitText(ws, ['mv', 'app.ts'])).toBe(
      'fatal: usage: git mv [<options>] <source>... <destination>',
    );
    expect(gitText(ws, ['mv', 'app.ts', 'lib/io.ts', 'nowhere'])).toBe(
      "fatal: destination 'nowhere' is not a directory",
    );
    expect(git(ws, ['mv', 'app.ts', '../out.ts']).exitCode).toBe(128);
    expect(git(ws, ['mv', '--frob', 'a', 'b']).exitCode).toBe(128);
  });
});
