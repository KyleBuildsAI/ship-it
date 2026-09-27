import { describe, expect, it } from 'vitest';
import { Workspace } from '../workspace';
import { isCleanStatus } from './status';
import { testDeps } from './testDeps';

/** A workspace with one commit containing README.md and app.ts. */
function committedWorkspace(): Workspace {
  const ws = new Workspace(testDeps());
  ws.initRepo();
  const repo = ws.requireRepo();
  ws.writeFile('README.md', '# App\n');
  ws.writeFile('app.ts', 'v1');
  repo.stage('README.md', '# App\n');
  repo.stage('app.ts', 'v1');
  repo.commitIndex('init');
  return ws;
}

describe('computeStatus', () => {
  it('reports a clean tree right after a commit', () => {
    const status = committedWorkspace().status();
    expect(status).toEqual({ staged: [], unstaged: [], untracked: [], ignored: [] });
    expect(isCleanStatus(status)).toBe(true);
  });

  it('sees edits and deletions in the working directory as unstaged', () => {
    const ws = committedWorkspace();
    ws.writeFile('app.ts', 'v2');
    ws.deleteFile('README.md');
    expect(ws.status().unstaged).toEqual([
      { kind: 'deleted', path: 'README.md' },
      { kind: 'modified', path: 'app.ts' },
    ]);
  });

  it('sees staged additions, edits, and deletions', () => {
    const ws = committedWorkspace();
    const repo = ws.requireRepo();
    ws.writeFile('new.ts', 'n');
    repo.stage('new.ts', 'n');
    repo.stage('app.ts', 'v2');
    ws.writeFile('app.ts', 'v2');
    repo.removeFromIndex('README.md');
    expect(ws.status().staged).toEqual([
      { kind: 'deleted', path: 'README.md' },
      { kind: 'modified', path: 'app.ts' },
      { kind: 'added', path: 'new.ts' },
    ]);
  });

  it('reports a file edited again after staging in both sections', () => {
    const ws = committedWorkspace();
    ws.requireRepo().stage('app.ts', 'v2');
    ws.writeFile('app.ts', 'v3');
    const status = ws.status();
    expect(status.staged).toEqual([{ kind: 'modified', path: 'app.ts' }]);
    expect(status.unstaged).toEqual([{ kind: 'modified', path: 'app.ts' }]);
  });

  it('detects a staged rename when the content is unchanged', () => {
    const ws = committedWorkspace();
    const repo = ws.requireRepo();
    repo.removeFromIndex('app.ts');
    repo.stage('main.ts', 'v1');
    ws.deleteFile('app.ts');
    ws.writeFile('main.ts', 'v1');
    expect(ws.status().staged).toEqual([{ kind: 'renamed', path: 'main.ts', from: 'app.ts' }]);
  });

  it('splits unknown files into untracked and ignored', () => {
    const ws = committedWorkspace();
    ws.writeFile('.gitignore', '.env\ndist/\n');
    ws.writeFile('.env', 'SECRET=1');
    ws.writeFile('dist/main.js', 'x');
    ws.writeFile('notes.md', 'todo');
    const status = ws.status();
    expect(status.untracked).toEqual(['.gitignore', 'notes.md']);
    expect(status.ignored).toEqual(['.env', 'dist/main.js']);
    expect(isCleanStatus(status)).toBe(false);
  });

  it('treats ignored files alone as clean', () => {
    const ws = committedWorkspace();
    const repo = ws.requireRepo();
    ws.writeFile('.gitignore', '*.log\n');
    repo.stage('.gitignore', '*.log\n');
    repo.commitIndex('chore: ignore logs');
    ws.writeFile('debug.log', 'noise');
    expect(isCleanStatus(ws.status())).toBe(true);
  });

  it('keeps showing a tracked file even when a rule would ignore it', () => {
    const ws = committedWorkspace();
    ws.writeFile('.gitignore', 'app.ts\n');
    ws.writeFile('app.ts', 'v2');
    expect(ws.status().unstaged).toEqual([{ kind: 'modified', path: 'app.ts' }]);
  });
});
