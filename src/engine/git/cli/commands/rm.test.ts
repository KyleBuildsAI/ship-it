import { describe, expect, it } from 'vitest';
import { repo } from '../../fixtures';
import { gitQueries } from '../../queries';
import { testDeps } from '../../testDeps';
import { git, gitText } from '../testRun';

const committed = () =>
  repo().commit('init', { 'app.ts': 'a', '.env': 'SECRET=1', 'src/a.ts': 'a', 'src/b.ts': 'b' });

describe('git rm', () => {
  it('removes a file from disk and stages the deletion', () => {
    const ws = committed().build(testDeps());
    expect(gitText(ws, ['rm', 'app.ts'])).toBe("rm 'app.ts'");
    const q = gitQueries(ws);
    expect(q.workingFile('app.ts')).toBeNull();
    expect(q.status().staged).toEqual([{ kind: 'deleted', path: 'app.ts' }]);
  });

  it('untracks a committed secret but keeps it on disk with --cached', () => {
    const ws = committed().write('.gitignore', '.env\n').build(testDeps());
    git(ws, ['rm', '--cached', '.env']);
    const q = gitQueries(ws);
    expect(q.workingFile('.env')).toBe('SECRET=1');
    expect(q.status().staged).toEqual([{ kind: 'deleted', path: '.env' }]);
    expect(q.ignoredPaths()).toEqual(['.env']);
  });

  it('needs -r for a folder', () => {
    const ws = committed().build(testDeps());
    expect(gitText(ws, ['rm', 'src'])).toBe("fatal: not removing 'src' recursively without -r");
    expect(gitText(ws, ['rm', '-r', '-q', 'src'])).toBe('');
    expect(gitQueries(ws).trackedPaths()).toContain('src/a.ts');
    expect(gitQueries(ws).stagedPaths()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('accepts a glob without -r', () => {
    const ws = committed().build(testDeps());
    expect(gitText(ws, ['rm', '--cached', 'src/*.ts'])).toBe("rm 'src/a.ts'\nrm 'src/b.ts'");
  });

  it('protects unstaged edits unless forced or cached', () => {
    const ws = committed().modify('app.ts', 'edited').build(testDeps());
    const result = git(ws, ['rm', 'app.ts']);
    expect(result.exitCode).toBe(1);
    expect(gitText(ws, ['rm', 'app.ts'])).toBe(
      [
        'error: the following file has local modifications:',
        '    app.ts',
        '(use --cached to keep the file, or -f to force removal)',
      ].join('\n'),
    );
    expect(git(ws, ['rm', '--cached', 'app.ts']).exitCode).toBe(0);
    expect(gitQueries(ws).workingFile('app.ts')).toBe('edited');
  });

  it('protects staged changes, and changes that differ everywhere', () => {
    const ws = committed()
      .modify('app.ts', 'v2')
      .stage('app.ts')
      .modify('src/a.ts', 'v2')
      .stage('src/a.ts')
      .modify('src/a.ts', 'v3')
      .build(testDeps());
    expect(gitText(ws, ['rm', 'app.ts'])).toContain('has changes staged in the index');
    expect(gitText(ws, ['rm', '--cached', 'src/a.ts'])).toContain(
      'staged content different from both the\nfile and the HEAD:',
    );
    expect(gitText(ws, ['rm', '-f', 'app.ts'])).toBe("rm 'app.ts'");
  });

  it('uses the plural when several files are at risk', () => {
    const ws = committed().modify('src/a.ts', 'x').modify('src/b.ts', 'y').build(testDeps());
    expect(gitText(ws, ['rm', '-r', 'src'])).toContain(
      'the following files have local modifications:',
    );
  });

  it('refuses untracked paths, empty calls, outside paths, and unknown options', () => {
    const ws = committed().untracked('new.ts').build(testDeps());
    expect(gitText(ws, ['rm', 'new.ts'])).toBe("fatal: pathspec 'new.ts' did not match any files");
    expect(gitText(ws, ['rm'])).toBe('fatal: No pathspec was given. Which files should I remove?');
    expect(git(ws, ['rm', '../x']).exitCode).toBe(128);
    expect(git(ws, ['rm', '--frob', 'app.ts']).exitCode).toBe(128);
  });

  it('removes a tracked file already deleted from disk', () => {
    const ws = committed().delete('app.ts').build(testDeps());
    expect(gitText(ws, ['rm', 'app.ts'])).toBe("rm 'app.ts'");
  });
});
