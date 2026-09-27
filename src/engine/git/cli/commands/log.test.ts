import { describe, expect, it } from 'vitest';
import { repo } from '../../fixtures';
import { gitQueries } from '../../queries';
import { testDeps } from '../../testDeps';
import { gitDate } from '../logFormat';
import { git, gitText } from '../testRun';

const threeCommits = () =>
  repo()
    .commit('feat: one', { 'a.ts': '1\n' })
    .commit('feat: two\n\nWhy it matters.', { 'b.ts': '2\n' })
    .commit('fix: three', { 'a.ts': '3\n' })
    .build(testDeps());

const shortIds = (ws: ReturnType<typeof threeCommits>) =>
  gitQueries(ws)
    .log()
    .map((commit) => commit.id.slice(0, 7));

describe('git log', () => {
  it('prints full entries, newest first, with decorations and indented messages', () => {
    const ws = threeCommits();
    const [latest] = gitQueries(ws).log();
    const lines = gitText(ws, ['log', '-n', '2']).split('\n');
    expect(lines.slice(0, 6)).toEqual([
      `commit ${latest?.id ?? ''} (HEAD -> main)`,
      'Author: Kyle <kyle@quillwork.ai>',
      `Date:   ${gitDate(latest?.timestamp ?? 0)}`,
      '',
      '    fix: three',
      '',
    ]);
    expect(lines.slice(-3)).toEqual(['    feat: two', '', '    Why it matters.']);
  });

  it('prints one line per commit with --oneline and limits with -N', () => {
    const ws = threeCommits();
    const [three, two, one] = shortIds(ws);
    expect(gitText(ws, ['log', '--oneline'])).toBe(
      [
        `${three ?? ''} (HEAD -> main) fix: three`,
        `${two ?? ''} feat: two`,
        `${one ?? ''} feat: one`,
      ].join('\n'),
    );
    expect(gitText(ws, ['log', '--oneline', '-1'])).toBe(
      `${three ?? ''} (HEAD -> main) fix: three`,
    );
    expect(gitText(ws, ['log', '--oneline', '--max-count=2']).split('\n')).toHaveLength(2);
  });

  it('draws the history line with --graph', () => {
    const ws = threeCommits();
    const [three, two, one] = shortIds(ws);
    expect(gitText(ws, ['log', '--oneline', '--graph'])).toBe(
      [
        `* ${three ?? ''} (HEAD -> main) fix: three`,
        `* ${two ?? ''} feat: two`,
        `* ${one ?? ''} feat: one`,
      ].join('\n'),
    );
    const full = gitText(ws, ['log', '--graph', '-2']).split('\n');
    expect(full[0]?.startsWith('* commit ')).toBe(true);
    expect(full[1]).toBe('| Author: Kyle <kyle@quillwork.ai>');
    expect(full[3]).toBe('|');
    expect(full.at(-1)).toBe('      Why it matters.');
  });

  it('starts from any revision and filters by path', () => {
    const ws = threeCommits();
    expect(gitText(ws, ['log', '--oneline', 'HEAD~1']).split('\n')).toHaveLength(2);
    expect(gitText(ws, ['log', '--oneline', '--', 'a.ts'])).not.toContain('feat: two');
    expect(gitText(ws, ['log', '--oneline', 'HEAD', 'b.ts'])).toContain('feat: two');
  });

  it('marks a detached HEAD and other branches', () => {
    const ws = threeCommits();
    const repository = ws.requireRepo();
    repository.detachHead(repository.resolve('HEAD~1'), 'checkout: moving from main to HEAD~1');
    expect(gitText(ws, ['log', '--oneline', 'main'])).toContain('(HEAD) feat: two');
    expect(gitText(ws, ['log', '--oneline', 'main'])).toContain('(main) fix: three');
  });

  it('explains an empty repository and bad input', () => {
    const empty = repo().build(testDeps());
    expect(gitText(empty, ['log'])).toBe(
      "fatal: your current branch 'main' does not have any commits yet",
    );
    const ws = threeCommits();
    expect(git(ws, ['log', 'nope']).exitCode).toBe(128);
    expect(gitText(ws, ['log', '-n', 'x'])).toBe("fatal: 'x': not an integer");
    expect(git(ws, ['log', '--pretty']).exitCode).toBe(128);
  });
});

describe('gitDate', () => {
  it('formats like git, in UTC', () => {
    expect(gitDate(Date.UTC(2026, 8, 26, 7, 5, 9))).toBe('Sat Sep 26 07:05:09 2026 +0000');
  });
});
