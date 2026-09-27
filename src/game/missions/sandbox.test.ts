import { describe, expect, it } from 'vitest';
import { folder, repo } from '../../engine/git/fixtures';
import { gitQueries } from '../../engine/git/queries';
import { testDeps } from '../../engine/git/testDeps';
import { NotARepositoryError, Workspace } from '../../engine/workspace';
import { applySteps, createSandbox } from './sandbox';

/** Everything grading can see, so two sandboxes can be compared as a whole. */
function snapshot(ws: Workspace) {
  const q = gitQueries(ws);
  return {
    files: ws.fs.allFiles().map((path) => [path, q.workingFile(path)]),
    status: q.status(),
    history: q.log().map((commit) => commit.id),
    reflog: q.reflog(),
  };
}

// Uses every kind of fixture step, including staging a deleted file and appending to a
// file that doesn't exist yet.
const everyStep = repo()
  .commit('chore: init', { 'app.ts': 'v1\n', 'old.ts': 'old\n' })
  .modify('app.ts')
  .modify('notes.md')
  .write('.env', 'TOKEN=dev-only\n')
  .delete('old.ts')
  .stage('app.ts', 'old.ts')
  .commit('refactor: tidy')
  .toSpec();

describe('createSandbox', () => {
  it('replays a mission setup into a fresh workspace', () => {
    const q = gitQueries(createSandbox(everyStep, testDeps()));
    expect(q.log().map((commit) => commit.message)).toEqual(['refactor: tidy', 'chore: init']);
    expect(q.untrackedPaths()).toEqual(['.env', 'notes.md']);
  });

  it('uses the real clock and hash when no test dependencies are given', () => {
    const ws = createSandbox(repo().commit('init', { 'a.ts': 'a' }).toSpec());
    expect(gitQueries(ws).headCommit()?.author.name).toBe('Kyle');
  });
});

describe('applySteps', () => {
  it('builds exactly what buildWorkspace builds', () => {
    const replayed = new Workspace(testDeps());
    applySteps(replayed, everyStep);
    expect(snapshot(replayed)).toEqual(snapshot(createSandbox(everyStep, testDeps())));
  });

  it('adds to a sandbox the player is already working in', () => {
    const ws = createSandbox(repo().commit('init', { 'app.ts': 'a\n' }).toSpec(), testDeps());
    ws.writeFile('app.ts', 'player edit\n');
    applySteps(ws, folder().write('NOTES.md', 'from Marco\n').modify('app.ts').toSpec());
    const q = gitQueries(ws);
    expect(q.workingFile('app.ts')).toBe('player edit\n// work in progress\n');
    expect(q.untrackedPaths()).toEqual(['NOTES.md']);
  });

  it('refuses to stage in a folder that has no repository', () => {
    const ws = createSandbox(folder().write('a.ts', 'a').toSpec(), testDeps());
    expect(() => {
      applySteps(ws, [{ op: 'stage', paths: ['a.ts'] }]);
    }).toThrow(NotARepositoryError);
  });
});
