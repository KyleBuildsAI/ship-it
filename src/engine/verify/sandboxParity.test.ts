import { describe, expect, it } from 'vitest';
import { toText } from '../git/cli/output';
import { runGit } from '../git/cli/runGit';
import { repo, type FixtureBuilder } from '../git/fixtures';
import { testDeps } from '../git/testDeps';
import { Shell } from '../shell/shell';
import type { Workspace } from '../workspace';
import { conventionalRatio } from './checks';
import { detectPasteKind } from './detect';
import realLog from './fixtures/log-oneline.txt?raw';
import longClean from './fixtures/status-long-clean.txt?raw';
import longDeleted from './fixtures/status-long-deleted.txt?raw';
import longDetached from './fixtures/status-long-detached.txt?raw';
import longFresh from './fixtures/status-long-fresh.txt?raw';
import longMixed from './fixtures/status-long-mixed.txt?raw';
import longRenamed from './fixtures/status-long-renamed.txt?raw';
import longStagedUnborn from './fixtures/status-long-staged-unborn.txt?raw';
import longSubdir from './fixtures/status-long-subdir.txt?raw';
import longUntrackedUnborn from './fixtures/status-long-untracked-unborn.txt?raw';
import porcelainMixed from './fixtures/status-porcelain-mixed.txt?raw';
import sbClean from './fixtures/status-sb-clean.txt?raw';
import sbDetached from './fixtures/status-sb-detached.txt?raw';
import sbFresh from './fixtures/status-sb-fresh.txt?raw';
import sbMixed from './fixtures/status-sb-mixed.txt?raw';
import sbStagedUnborn from './fixtures/status-sb-staged-unborn.txt?raw';
import shortClean from './fixtures/status-short-clean.txt?raw';
import shortDeleted from './fixtures/status-short-deleted.txt?raw';
import shortMixed from './fixtures/status-short-mixed.txt?raw';
import shortRenamed from './fixtures/status-short-renamed.txt?raw';
import shortSubdir from './fixtures/status-short-subdir.txt?raw';
import shortUntrackedUnborn from './fixtures/status-short-untracked-unborn.txt?raw';
import { parseLogOneline } from './logOneline';
import { parseStatusLong } from './statusLong';
import { parseStatusShort } from './statusShort';

/**
 * The sandbox teaches with git's own output format, so a player who pastes the real thing
 * later should see it read the same way. Each test rebuilds a scenario from capture.ps1
 * in the sandbox and checks that both outputs parse to the same structure.
 */

const DISPLAY_ROOT = 'C:/Users/kyle/quillwork/app';

function sandboxGit(ws: Workspace, args: string[], cwd = ''): string {
  return toText(runGit(ws, { cwd, displayRoot: DISPLAY_ROOT }, args));
}

const build = (builder: FixtureBuilder) => builder.build(testDeps());

/** Asserts that the sandbox and real git printed the same status, as far as parsing can tell. */
function expectSameStatus(ws: Workspace, real: { long: string; short: string }, cwd = '') {
  const long = sandboxGit(ws, ['status'], cwd);
  const short = sandboxGit(ws, ['status', '--short'], cwd);
  expect(parseStatusLong(long)).toEqual(parseStatusLong(real.long));
  expect(parseStatusShort(short)).toEqual(parseStatusShort(real.short));
  expect(detectPasteKind(long)).toBe('status-long');
}

// The same files capture.ps1 creates for its "mixed" scenario.
const mixedScenario = () =>
  repo()
    .commit('chore: initial commit', {
      'README.md': '# Demo\n',
      'src/app.ts': 'export const app = 1;\n',
      'src/util.ts': 'export const util = 1;\n',
      'old.txt': 'remove me\n',
    })
    .write('src/app.ts', 'export const app = 2;\n')
    .stage('src/app.ts')
    .write('src/app.ts', 'export const app = 3;\n')
    .write('README.md', '# Demo\n\nMore docs.\n')
    .write('src/new.ts', 'export {};\n')
    .stage('src/new.ts')
    .delete('old.txt')
    .untracked('draft notes.md', 'ideas\n')
    .untracked('dist/bundle.js', 'console.log(1);\n')
    .untracked('café.txt', 'unicode name\n');

describe('sandbox output parses like real git output', () => {
  it('in a brand-new repository', () => {
    const ws = build(repo());
    expect(parseStatusLong(sandboxGit(ws, ['status']))).toEqual(parseStatusLong(longFresh));
    expect(parseStatusShort(sandboxGit(ws, ['status', '-sb']))).toEqual(parseStatusShort(sbFresh));
  });

  it('with untracked files before the first commit, then one staged', () => {
    const untracked = repo()
      .untracked('README.md', '# Demo\n')
      .untracked('src/app.ts', 'export {};\n')
      .untracked('notes draft.txt', 'todo\n')
      .untracked('.env', 'PORT=3000\n');
    expectSameStatus(build(untracked), { long: longUntrackedUnborn, short: shortUntrackedUnborn });

    const ws = build(untracked.stage('README.md'));
    expect(parseStatusLong(sandboxGit(ws, ['status']))).toEqual(parseStatusLong(longStagedUnborn));
    expect(parseStatusShort(sandboxGit(ws, ['status', '-sb']))).toEqual(
      parseStatusShort(sbStagedUnborn),
    );
  });

  it('with staged, unstaged, and untracked changes at once', () => {
    const ws = build(mixedScenario());
    expectSameStatus(ws, { long: longMixed, short: shortMixed });
    expect(parseStatusShort(sandboxGit(ws, ['status', '-sb']))).toEqual(parseStatusShort(sbMixed));
    expect(parseStatusShort(sandboxGit(ws, ['status', '--porcelain']))).toEqual(
      parseStatusShort(porcelainMixed),
    );
  });

  it('when copied from the sandbox terminal with its PowerShell prompt', () => {
    const shell = new Shell(build(mixedScenario()), 'C:\\Users\\kyle\\quillwork\\app');
    const transcript = (command: string) =>
      [
        `${shell.prompt()}${command}`,
        ...shell.run(command).lines.map((output) => output.text),
        shell.prompt(),
      ].join('\r\n');

    expect(parseStatusShort(transcript('git status -sb'))).toEqual(parseStatusShort(sbMixed));
    expect(parseStatusLong(transcript('git status'))).toEqual(parseStatusLong(longMixed));

    const clean = new Shell(build(repo().commit('init', { 'a.txt': 'a' })), 'C:\\repo');
    const cleanShort = `${clean.prompt()}git status -s\r\n${clean.prompt()}`;
    expect(clean.run('git status -s').lines).toEqual([]);
    expect(detectPasteKind(cleanShort)).toBe('status-short');
  });

  it('from inside a subfolder, with ../ paths', () => {
    expectSameStatus(build(mixedScenario()), { long: longSubdir, short: shortSubdir }, 'src');
  });

  it('after renames, including a name with spaces and a rename edited afterwards', () => {
    const ws = build(
      repo().commit('chore: initial commit', {
        'a.txt': 'alpha\n',
        'old name.txt': 'spaced\n',
        'keep.txt': 'keep\n',
      }),
    );
    sandboxGit(ws, ['mv', 'a.txt', 'b.txt']);
    sandboxGit(ws, ['mv', 'old name.txt', 'new name.txt']);
    sandboxGit(ws, ['mv', 'keep.txt', 'kept.txt']);
    ws.writeFile('kept.txt', 'keep\nchanged after the rename\n');
    expectSameStatus(ws, { long: longRenamed, short: shortRenamed });
  });

  it('after staged and unstaged deletions and rm --cached', () => {
    const ws = build(
      repo()
        .commit('chore: initial commit', {
          'gone-staged.txt': 'one\n',
          'gone-unstaged.txt': 'two\n',
          '.env': 'PORT=3000\n',
        })
        .delete('gone-unstaged.txt'),
    );
    sandboxGit(ws, ['rm', 'gone-staged.txt']);
    sandboxGit(ws, ['rm', '--cached', '.env']);
    expectSameStatus(ws, { long: longDeleted, short: shortDeleted });
  });

  it('in a clean repository', () => {
    const ws = build(repo().commit('chore: initial commit', { 'README.md': '# Demo\n' }));
    expectSameStatus(ws, { long: longClean, short: shortClean });
    expect(parseStatusShort(sandboxGit(ws, ['status', '-sb']))).toEqual(parseStatusShort(sbClean));
  });

  it('with a detached HEAD, where only the hash differs', () => {
    const ws = build(repo().commit('first', { 'a.txt': 'a' }));
    const repository = ws.requireRepo();
    const tip = repository.headCommitId();
    if (tip === null) throw new Error('the fixture should have a commit');
    // The sandbox can't `git switch --detach` until Act 3, so detach HEAD where it stands.
    // That leaves the files untouched, as a real detach to the same commit would.
    repository.detachHead(tip, 'checkout: moving to HEAD');

    const sandbox = parseStatusLong(sandboxGit(ws, ['status']));
    expect(sandbox.detachedAt).toMatch(/^[0-9a-f]{7}$/);
    expect({ ...sandbox, detachedAt: 'hash' }).toEqual({
      ...parseStatusLong(longDetached),
      detachedAt: 'hash',
    });
    expect(parseStatusShort(sandboxGit(ws, ['status', '-sb']))).toEqual(
      parseStatusShort(sbDetached),
    );
  });

  describe('for a oneline log, where only the hashes differ', () => {
    // The first four commits of capture.ps1's "history" repository.
    const history = () =>
      build(
        repo()
          .commit('Initial commit', { 'README.md': '# Demo\n' })
          .commit('feat: add status parser', { 'src/status.ts': 'export {};\n' })
          .commit('fix(parser): handle quoted paths', { 'src/status.ts': 'export const q = 1;\n' })
          .commit('update stuff', { 'notes.txt': 'stuff\n' }),
      );
    const realSubjects = parseLogOneline(realLog)
      .slice(-4)
      .map((commit) => commit.subject);

    it.each(['log --oneline', 'log --oneline --graph'])('git %s', (command) => {
      const sandboxLog = sandboxGit(history(), command.split(' '));
      const sandbox = parseLogOneline(sandboxLog);
      expect(detectPasteKind(sandboxLog)).toBe('log-oneline');
      expect(sandbox.map((commit) => commit.subject)).toEqual(realSubjects);
      expect(sandbox.every((commit) => /^[0-9a-f]{7}$/.test(commit.hash))).toBe(true);
      expect(sandbox.map((commit) => commit.refs)).toEqual([['HEAD -> main'], [], [], []]);
    });

    it('with -n, keeping only the newest commits', () => {
      const sandbox = parseLogOneline(sandboxGit(history(), ['log', '--oneline', '-2']));
      expect(sandbox.map((commit) => commit.subject)).toEqual(realSubjects.slice(0, 2));
    });

    it("leaving git revert's own subject out of the Conventional Commit score", () => {
      const ws = history();
      sandboxGit(ws, ['revert', 'HEAD~1']);
      const commits = parseLogOneline(sandboxGit(ws, ['log', '--oneline']));
      expect(commits[0]?.subject).toBe('Revert "fix(parser): handle quoted paths"');
      // "Initial commit" and "update stuff" are the two misses; the revert doesn't count.
      expect(conventionalRatio(commits)).toBe(2 / 4);
    });
  });
});
