import { describe, expect, it } from 'vitest';
import { blobId, sha1, shortId } from '../../hash';
import { repo } from '../../fixtures';
import { testDeps } from '../../testDeps';
import { changeSummary } from '../diffFormat';
import { git, gitText } from '../testRun';

const id = (content: string) => shortId(blobId(content, sha1));

describe('git diff', () => {
  it('shows unstaged edits against the staged version', () => {
    const ws = repo()
      .commit('init', { 'app.ts': 'a\nb\nc\n' })
      .modify('app.ts', 'a\nB\nc\n')
      .build(testDeps());
    expect(gitText(ws, ['diff'])).toBe(
      [
        'diff --git a/app.ts b/app.ts',
        `index ${id('a\nb\nc\n')}..${id('a\nB\nc\n')} 100644`,
        '--- a/app.ts',
        '+++ b/app.ts',
        '@@ -1,3 +1,3 @@',
        ' a',
        '-b',
        '+B',
        ' c',
      ].join('\n'),
    );
  });

  it('shows nothing once the edit is staged, and shows it with --staged', () => {
    const ws = repo()
      .commit('init', { 'app.ts': 'a\n' })
      .modify('app.ts', 'b\n')
      .stage('app.ts')
      .build(testDeps());
    expect(gitText(ws, ['diff'])).toBe('');
    expect(gitText(ws, ['diff', '--staged'])).toContain('-a\n+b');
    expect(gitText(ws, ['diff', '--cached'])).toContain('-a\n+b');
  });

  it('prints new and deleted files with /dev/null sides', () => {
    const ws = repo()
      .commit('init', { 'old.ts': 'x\n' })
      .delete('old.ts')
      .untracked('new.ts', 'y')
      .stage('old.ts', 'new.ts')
      .build(testDeps());
    const text = gitText(ws, ['diff', '--staged']);
    expect(text).toContain(
      [
        'diff --git a/new.ts b/new.ts',
        'new file mode 100644',
        `index 0000000..${id('y')}`,
        '--- /dev/null',
        '+++ b/new.ts',
        '@@ -0,0 +1 @@',
        '+y',
        '\\ No newline at end of file',
      ].join('\n'),
    );
    expect(text).toContain(
      [
        'deleted file mode 100644',
        `index ${id('x\n')}..0000000`,
        '--- a/old.ts',
        '+++ /dev/null',
        '@@ -1 +0,0 @@',
        '-x',
      ].join('\n'),
    );
  });

  it('shows a staged rename as a rename', () => {
    const ws = repo()
      .commit('init', { 'old.ts': 'same\n' })
      .delete('old.ts')
      .write('new.ts', 'same\n')
      .stage('old.ts', 'new.ts')
      .build(testDeps());
    expect(gitText(ws, ['diff', '--staged'])).toBe(
      [
        'diff --git a/old.ts b/new.ts',
        'similarity index 100%',
        'rename from old.ts',
        'rename to new.ts',
      ].join('\n'),
    );
  });

  it('compares any two commits, with a b or a..b', () => {
    const ws = repo()
      .commit('one', { 'a.ts': '1\n' })
      .commit('two', { 'a.ts': '2\n' })
      .build(testDeps());
    const expected = gitText(ws, ['diff', 'HEAD~1', 'HEAD']);
    expect(expected).toContain('-1\n+2');
    expect(gitText(ws, ['diff', 'HEAD~1..HEAD'])).toBe(expected);
  });

  it('compares a commit with the working directory', () => {
    const ws = repo()
      .commit('one', { 'a.ts': '1\n' })
      .commit('two', { 'a.ts': '2\n' })
      .modify('a.ts', '3\n')
      .build(testDeps());
    expect(gitText(ws, ['diff', 'HEAD~1'])).toContain('-1\n+3');
  });

  it('limits output to paths, with or without --', () => {
    const ws = repo()
      .commit('init', { 'a.ts': 'a\n', 'b.ts': 'b\n' })
      .modify('a.ts', 'A\n')
      .modify('b.ts', 'B\n')
      .build(testDeps());
    expect(gitText(ws, ['diff', '--', 'b.ts'])).not.toContain('a.ts');
    expect(gitText(ws, ['diff', 'a.ts'])).not.toContain('b.ts');
  });

  it('summarizes with --stat and lists names with --name-only', () => {
    const ws = repo()
      .commit('init', { 'a.ts': 'a\nb\n', 'long-name.ts': 'x\n' })
      .modify('a.ts', 'a\nc\nd\n')
      .modify('long-name.ts', '')
      .build(testDeps());
    expect(gitText(ws, ['diff', '--stat'])).toBe(
      [
        ' a.ts         | 3 ++-',
        ' long-name.ts | 1 -',
        ' 2 files changed, 2 insertions(+), 2 deletions(-)',
      ].join('\n'),
    );
    expect(gitText(ws, ['diff', '--name-only'])).toBe('a.ts\nlong-name.ts');
    expect(gitText(ws, ['diff', '--stat', '--staged'])).toBe('');
  });

  it('works before the first commit', () => {
    const ws = repo().untracked('a.ts', 'a\n').stage('a.ts').build(testDeps());
    expect(gitText(ws, ['diff', '--staged'])).toContain('+a');
  });

  it('explains unknown revisions, ambiguous input, and bad options', () => {
    const ws = repo().commit('init', { 'a.ts': 'a\n' }).build(testDeps());
    expect(gitText(ws, ['diff', 'nope'])).toBe(
      [
        "fatal: ambiguous argument 'nope': unknown revision or path not in the working tree.",
        "Use '--' to separate paths from revisions, like this:",
        "'git <command> [<revision>...] -- [<file>...]'",
      ].join('\n'),
    );
    expect(gitText(ws, ['diff', 'HEAD~5', 'HEAD'])).toContain("ambiguous argument 'HEAD~5'");
    expect(gitText(ws, ['diff', 'HEAD', 'HEAD~5'])).toContain("ambiguous argument 'HEAD~5'");
    expect(git(ws, ['diff', '--frob']).exitCode).toBe(129);
  });
});

describe('changeSummary', () => {
  it('follows git rules for plurals and zeros', () => {
    expect(changeSummary(1, 1, 0)).toBe(' 1 file changed, 1 insertion(+)');
    expect(changeSummary(2, 0, 3)).toBe(' 2 files changed, 3 deletions(-)');
    expect(changeSummary(1, 0, 0)).toBe(' 1 file changed, 0 insertions(+), 0 deletions(-)');
  });
});
