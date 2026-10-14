import { describe, expect, it } from 'vitest';
import { folder, repo, windows, type FixtureBuilder } from '../fixtures';
import type { Workspace } from '../workspace';
import { git } from './cli/testRun';
import { diffGitSnapshots, snapshotGit, type GitChange } from './snapshot';
import { testDeps } from './testDeps';

/** The changes one git command makes to a sandbox built from `setup`. */
function changesOf(setup: FixtureBuilder, args: string[]): GitChange[] {
  const ws = setup.build(testDeps());
  return changesIn(ws, () => git(ws, args));
}

function changesIn(ws: Workspace, act: () => unknown, withFiles = true): GitChange[] {
  const before = snapshotGit(ws, withFiles);
  act();
  return diffGitSnapshots(before, snapshotGit(ws, withFiles));
}

const twoCommits = repo()
  .commit('first', { 'app.ts': 'v1\n' })
  .commit('add login', { 'login.ts': 'login\n' });

describe('git changes, in Workbench, Loading Dock and Vault terms', () => {
  it('git init sets up the dock and the vault, and nothing else moves', () => {
    expect(changesOf(folder().write('app.ts', 'hi\n'), ['init'])).toEqual([
      { kind: 'repoCreated' },
    ]);
  });

  it('git add loads crates onto the dock, and a new version loads again', () => {
    const edited = repo().commit('first', { 'app.ts': 'v1\n' }).write('app.ts', 'v2\n');
    expect(changesOf(edited.write('new.ts', 'n\n'), ['add', '.'])).toEqual([
      { kind: 'dock', path: 'app.ts', how: 'loaded' },
      { kind: 'dock', path: 'new.ts', how: 'loaded' },
    ]);
    const restaged = edited.stage('app.ts').write('app.ts', 'v3\n');
    expect(changesOf(restaged, ['add', 'app.ts'])).toEqual([
      { kind: 'dock', path: 'app.ts', how: 'loaded' },
    ]);
    // Adding what the dock already holds changes nothing.
    expect(changesOf(edited.stage('app.ts'), ['add', 'app.ts'])).toEqual([]);
  });

  it('git commit seals the dock into a new commit, and the crates go with it', () => {
    const staged = repo()
      .commit('first', { 'app.ts': 'v1\n', 'old.ts': 'o\n' })
      .write('app.ts', 'v2\n')
      .delete('old.ts')
      .stage('app.ts', 'old.ts');
    const [sealed, ...rest] = changesOf(staged, ['commit', '-m', 'tidy up']);
    expect(sealed).toMatchObject({ kind: 'sealed', message: 'tidy up', files: 2, branch: 'main' });
    expect(rest).toEqual([]);
  });

  it('the first commit counts every file it holds', () => {
    const [sealed] = changesOf(folder().init().write('a.ts', 'a\n').stage('a.ts'), [
      'commit',
      '-m',
      'start',
    ]);
    expect(sealed).toMatchObject({ kind: 'sealed', files: 1 });
  });

  it('git restore --staged takes a crate off the dock, and the edit stays', () => {
    const staged = repo().commit('first', { 'app.ts': 'v1\n' }).write('app.ts', 'v2\n');
    expect(changesOf(staged.stage('app.ts'), ['restore', '--staged', 'app.ts'])).toEqual([
      { kind: 'dock', path: 'app.ts', how: 'unloaded' },
    ]);
  });

  it('git restore throws away unstaged edits, but not ones the dock still holds', () => {
    const edited = repo().commit('first', { 'app.ts': 'v1\n' }).write('app.ts', 'v2\n');
    expect(changesOf(edited, ['restore', 'app.ts'])).toEqual([
      { kind: 'workbench', path: 'app.ts', how: 'changed', unsaved: true },
    ]);
    const stagedThenEdited = edited.stage('app.ts').write('app.ts', 'v3\n');
    expect(changesOf(stagedThenEdited.write('app.ts', 'v2\n'), ['restore', 'app.ts'])).toEqual([]);
  });

  it('a staged edit wiped from the dock and the Workbench at once is discarded', () => {
    const staged = repo().commit('first', { 'app.ts': 'v1\n' }).write('app.ts', 'v2\n');
    const wipe = ['restore', '--source', 'HEAD', '--staged', '--worktree', 'app.ts'];
    // The dock's line says the staged edit is gone; the Workbench line doesn't say it twice.
    expect(changesOf(staged.stage('app.ts'), wipe)).toEqual([
      { kind: 'dock', path: 'app.ts', how: 'discarded' },
      { kind: 'workbench', path: 'app.ts', how: 'changed', unsaved: false },
    ]);
  });

  it('rewriting a committed file loses nothing, even to an older commit', () => {
    const edited = twoCommits.commit('edit', { 'app.ts': 'v2\n' });
    expect(changesOf(edited, ['restore', '--source', 'HEAD~2', 'app.ts'])).toEqual([
      { kind: 'workbench', path: 'app.ts', how: 'changed', unsaved: false },
    ]);
  });

  it('git rm deletes the file from the Workbench and stages its removal', () => {
    expect(changesOf(twoCommits, ['rm', 'login.ts'])).toEqual([
      { kind: 'dock', path: 'login.ts', how: 'removed' },
      { kind: 'workbench', path: 'login.ts', how: 'deleted', unsaved: false },
    ]);
  });

  it('git rm --cached stages the removal and leaves the Workbench alone', () => {
    // Not 'loaded': the next commit drops login.ts, it doesn't carry it.
    expect(changesOf(twoCommits, ['rm', '--cached', 'login.ts'])).toEqual([
      { kind: 'dock', path: 'login.ts', how: 'removed' },
    ]);
  });

  it('git add of a deleted file stages its removal too', () => {
    expect(changesOf(twoCommits.delete('login.ts'), ['add', 'login.ts'])).toEqual([
      { kind: 'dock', path: 'login.ts', how: 'removed' },
    ]);
  });

  it('git reset --hard drops commits and throws away unsaved work', () => {
    const changes = changesOf(twoCommits.write('app.ts', 'mine\n'), ['reset', '--hard', 'HEAD~1']);
    expect(changes).toEqual([
      {
        kind: 'dropped',
        branch: 'main',
        commits: [{ id: expect.any(String) as string, message: 'add login' }],
      },
      { kind: 'workbench', path: 'app.ts', how: 'changed', unsaved: true },
      { kind: 'workbench', path: 'login.ts', how: 'deleted', unsaved: false },
    ]);
  });

  it('git reset --hard discards a staged edit that nothing else holds', () => {
    // 'two' lived only on the dock and the Workbench; reset --hard empties both.
    const staged = repo().commit('init', { 'a.ts': 'one' }).write('a.ts', 'two').stage('a.ts');
    expect(changesOf(staged, ['reset', '--hard'])).toEqual([
      { kind: 'dock', path: 'a.ts', how: 'discarded' },
      { kind: 'workbench', path: 'a.ts', how: 'changed', unsaved: false },
    ]);
  });

  it('a staged version a commit still holds is only unloaded', () => {
    // The first commit still holds 'v1', the version on the dock, so git can hand it back.
    const back = repo()
      .commit('first', { 'app.ts': 'v1\n' })
      .commit('second', { 'app.ts': 'v2\n' })
      .write('app.ts', 'v1\n')
      .stage('app.ts');
    expect(changesOf(back, ['reset', '--hard'])).toEqual([
      { kind: 'dock', path: 'app.ts', how: 'unloaded' },
      { kind: 'workbench', path: 'app.ts', how: 'changed', unsaved: false },
    ]);
  });

  it('a new file taken off the dock is still on the Workbench, even with files left out', () => {
    const ws = twoCommits.write('b.ts', 'b\n').stage('b.ts').build(testDeps());
    expect(changesIn(ws, () => git(ws, ['restore', '--staged', 'b.ts']), false)).toEqual([
      { kind: 'dock', path: 'b.ts', how: 'unloaded' },
    ]);
  });

  it('taking a staged delete off the dock loses nothing', () => {
    const removed = twoCommits.delete('login.ts').stage('login.ts');
    expect(changesOf(removed, ['restore', '--staged', 'login.ts'])).toEqual([
      { kind: 'dock', path: 'login.ts', how: 'unloaded' },
    ]);
  });

  it('git reset --soft drops the commit and loads its files back onto the dock', () => {
    const changes = changesOf(twoCommits, ['reset', '--soft', 'HEAD~1']);
    expect(changes.map((change) => change.kind)).toEqual(['dropped', 'dock']);
    expect(changes[1]).toEqual({ kind: 'dock', path: 'login.ts', how: 'loaded' });
  });

  it('git revert seals a new commit and drops none', () => {
    const changes = changesOf(twoCommits, ['revert', 'HEAD', '--no-edit']);
    expect(changes.map((change) => change.kind)).toEqual(['sealed', 'workbench']);
    expect(changes[1]).toEqual({
      kind: 'workbench',
      path: 'login.ts',
      how: 'deleted',
      unsaved: false,
    });
  });

  it('read-only commands change nothing', () => {
    const ws = twoCommits.write('app.ts', 'mine\n').build(testDeps());
    for (const args of [['status'], ['log', '--oneline'], ['diff', '--staged'], ['diff']]) {
      expect(
        changesIn(ws, () => git(ws, args)),
        args.join(' '),
      ).toEqual([]);
    }
  });

  it('before git init, every file is unsaved work', () => {
    const ws = folder().write('app.ts', 'hi\n').build(testDeps());
    expect(
      changesIn(ws, () => {
        ws.writeFile('app.ts', 'bye\n');
      }),
    ).toEqual([{ kind: 'workbench', path: 'app.ts', how: 'changed', unsaved: true }]);
  });

  it('can leave the files out, for a laptop whose drive is compared elsewhere', () => {
    const ws = windows().session().init().build(testDeps());
    const before = snapshotGit(ws, false);
    expect(before.files.size).toBe(0);
    ws.writeFile('notes.md', 'x\n');
    expect(diffGitSnapshots(before, snapshotGit(ws, false))).toEqual([]);
  });
});
