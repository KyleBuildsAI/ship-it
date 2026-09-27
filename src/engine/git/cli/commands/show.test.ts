import { describe, expect, it } from 'vitest';
import { repo } from '../../fixtures';
import { testDeps } from '../../testDeps';
import { git, gitText } from '../testRun';

const history = () =>
  repo()
    .commit('feat: one', { 'app.ts': 'v1\n' })
    .commit('feat: two', { 'app.ts': 'v2\n', 'b.ts': 'b\n' })
    .build(testDeps());

describe('git show', () => {
  it('shows the latest commit with its diff', () => {
    const lines = gitText(history(), ['show']).split('\n');
    expect(lines[0]).toMatch(/^commit [0-9a-f]{40} \(HEAD -> main\)$/);
    expect(lines).toContain('    feat: two');
    expect(lines).toContain('-v1');
    expect(lines).toContain('+v2');
    expect(lines).toContain('+++ b/b.ts');
  });

  it('shows the root commit as all additions', () => {
    const text = gitText(history(), ['show', 'HEAD~1']);
    expect(text).toContain('--- /dev/null\n+++ b/app.ts');
    expect(text).not.toContain('(HEAD -> main)');
  });

  it('supports --oneline and --stat', () => {
    const text = gitText(history(), ['show', '--oneline', '--stat']);
    expect(text.split('\n')[0]).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) feat: two$/);
    expect(text).toContain(' 2 files changed, 2 insertions(+), 1 deletion(-)');
  });

  it('prints a file as it was at a commit with rev:path', () => {
    expect(gitText(history(), ['show', 'HEAD~1:app.ts'])).toBe('v1');
    expect(gitText(history(), ['show', ':app.ts'])).toBe('v2');
    expect(gitText(history(), ['show', 'HEAD:b.ts'])).toBe('b');
  });

  it('explains missing files, unknown revisions, and bad options', () => {
    expect(gitText(history(), ['show', 'HEAD~1:b.ts'])).toBe(
      "fatal: path 'b.ts' does not exist in 'HEAD~1'",
    );
    expect(git(history(), ['show', 'nope']).exitCode).toBe(128);
    expect(git(history(), ['show', 'nope:app.ts']).exitCode).toBe(128);
    expect(git(history(), ['show', '--frob']).exitCode).toBe(128);
    expect(gitText(repo().build(testDeps()), ['show'])).toContain('does not have any commits yet');
  });
});
