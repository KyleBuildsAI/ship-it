import { describe, expect, it } from 'vitest';
import { repo } from '../fixtures';
import { testDeps } from '../testDeps';
import { decorations, fullHeader, gitDate, onelineHeader, subjectOf } from './logFormat';

const twoCommits = () =>
  repo()
    .commit('feat: one', { 'a.ts': '1' })
    .commit('feat: two\n\nBody line.', { 'a.ts': '2' })
    .build(testDeps())
    .requireRepo();

describe('gitDate', () => {
  it('formats a timestamp like git, in UTC', () => {
    expect(gitDate(Date.UTC(2026, 8, 26, 7, 5, 9))).toBe('Sat Sep 26 07:05:09 2026 +0000');
    expect(gitDate(Date.UTC(2027, 0, 1, 23, 59, 0))).toBe('Fri Jan 1 23:59:00 2027 +0000');
  });
});

describe('decorations', () => {
  it('labels the commit HEAD and its branch point to', () => {
    const repository = twoCommits();
    expect(decorations(repository, repository.resolve('HEAD'))).toEqual(['HEAD -> main']);
    expect(decorations(repository, repository.resolve('HEAD~1'))).toEqual([]);
  });

  it('labels a detached HEAD and a branch HEAD is not on', () => {
    const repository = twoCommits();
    const tip = repository.resolve('HEAD');
    repository.detachHead(repository.resolve('HEAD~1'), 'checkout: moving from main to HEAD~1');
    expect(decorations(repository, repository.resolve('HEAD'))).toEqual(['HEAD']);
    expect(decorations(repository, tip)).toEqual(['main']);
  });
});

describe('commit headers', () => {
  it('prints the subject line only in the one-line form', () => {
    const repository = twoCommits();
    const head = repository.headCommit();
    if (!head) throw new Error('expected a commit');
    expect(subjectOf(head)).toBe('feat: two');
    expect(onelineHeader(repository, head)).toEqual({
      text: `${head.id.slice(0, 7)} (HEAD -> main) feat: two`,
      tone: 'commit',
    });
  });

  it('prints the full header with an indented message and blank lines kept blank', () => {
    const repository = twoCommits();
    const head = repository.headCommit();
    if (!head) throw new Error('expected a commit');
    expect(fullHeader(repository, head).map((line) => line.text)).toEqual([
      `commit ${head.id} (HEAD -> main)`,
      'Author: Kyle <kyle@quillwork.ai>',
      `Date:   ${gitDate(head.timestamp)}`,
      '',
      '    feat: two',
      '',
      '    Body line.',
    ]);
    const first = repository.getCommit(repository.resolve('HEAD~1'));
    if (!first) throw new Error('expected a commit');
    expect(onelineHeader(repository, first).text).toBe(`${first.id.slice(0, 7)} feat: one`);
    expect(fullHeader(repository, first)[0]?.text).toBe(`commit ${first.id}`);
  });
});
