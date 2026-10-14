import { describe, expect, it } from 'vitest';
import {
  latestMergedPull,
  linkedIssueNumber,
  missingSections,
  parseRepoSlug,
  pullRequestProblems,
  type PullRequestSummary,
} from './github';

const SECTIONS = ['What changed', 'Why', 'How to test'];

const GOOD_BODY = [
  '## What changed',
  'Tide heights round to one decimal.',
  '',
  '## Why',
  'The chart showed 1.2999999.',
  '',
  '## How to test',
  '1. npm test',
  '',
  'Closes #12',
].join('\r\n');

function pull(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    number: 13,
    title: 'fix: round tide heights',
    body: GOOD_BODY,
    mergedAt: '2026-10-12T09:00:00Z',
    mergeCommitSha: 'a1b2c3d4e5',
    ...overrides,
  };
}

describe('parseRepoSlug', () => {
  it.each([
    ['kyle-c/SandCastles', 'kyle-c', 'SandCastles'],
    ['  kyle-c/sand.castles  ', 'kyle-c', 'sand.castles'],
    ['https://github.com/kyle-c/SandCastles', 'kyle-c', 'SandCastles'],
    ['https://github.com/kyle-c/SandCastles.git', 'kyle-c', 'SandCastles'],
    ['https://github.com/kyle-c/SandCastles/', 'kyle-c', 'SandCastles'],
    ['git@github.com:kyle-c/SandCastles.git', 'kyle-c', 'SandCastles'],
  ])('reads %s', (text, owner, repo) => {
    expect(parseRepoSlug(text)).toEqual({ owner, repo });
  });

  it.each([
    '',
    'SandCastles',
    'https://gitlab.com/kyle-c/SandCastles',
    'https://github.com.evil.example/kyle-c/SandCastles',
    'kyle-c/SandCastles/issues',
    'kyle-c/..',
    '../../user',
  ])('refuses %s, so nothing odd reaches a request URL', (text) => {
    expect(parseRepoSlug(text)).toBeNull();
  });
});

describe('latestMergedPull', () => {
  it('picks the most recently merged PR and skips ones closed without merging', () => {
    const older = pull({ number: 4, mergedAt: '2026-10-01T09:00:00Z' });
    const closed = pull({ number: 9, mergedAt: null });
    const newest = pull({ number: 13 });
    expect(latestMergedPull([older, closed, newest])?.number).toBe(13);
    expect(latestMergedPull([closed])).toBeNull();
    expect(latestMergedPull([])).toBeNull();
  });
});

describe('linkedIssueNumber', () => {
  it('reads every keyword GitHub closes issues with', () => {
    expect(linkedIssueNumber('Closes #12')).toBe(12);
    expect(linkedIssueNumber('this fixes #7 at last')).toBe(7);
    expect(linkedIssueNumber('Resolved: #3')).toBe(3);
  });

  it('ignores a plain mention, and an empty body', () => {
    expect(linkedIssueNumber('See #12')).toBeNull();
    expect(linkedIssueNumber(null)).toBeNull();
  });
});

describe('missingSections', () => {
  it('finds headings however they are written', () => {
    expect(missingSections(GOOD_BODY, SECTIONS)).toEqual([]);
    expect(missingSections('**What changed:**\n# why\nHow to test\n', SECTIONS)).toEqual([]);
  });

  it('names the sections a description lacks', () => {
    expect(missingSections('## What changed\nstuff', SECTIONS)).toEqual(['Why', 'How to test']);
    expect(missingSections(null, ['Why'])).toEqual(['Why']);
  });
});

describe('pullRequestProblems', () => {
  const facts = { pull: pull(), issueState: 'closed' as const, mainSha: 'a1b2c3d4e5' };

  it('finds nothing wrong with a PR that did it all', () => {
    expect(pullRequestProblems(facts, SECTIONS)).toEqual([]);
  });

  it('names each thing a PR got wrong', () => {
    const sloppy = pull({ title: 'Update tides.ts', body: 'quick fix' });
    expect(
      pullRequestProblems({ pull: sloppy, issueState: null, mainSha: 'ffff' }, SECTIONS),
    ).toEqual([
      'PR #13’s title isn’t a Conventional Commit, like “fix: round tide heights”.',
      'PR #13’s description has no What changed, Why, How to test section.',
      'PR #13’s description doesn’t close an issue with “Closes #N”.',
      'main on GitHub has moved past PR #13, or it merged into another branch.',
    ]);
  });

  it('notices an issue that stayed open', () => {
    expect(pullRequestProblems({ ...facts, issueState: 'open' }, SECTIONS)).toEqual([
      'The issue PR #13 links is still open.',
    ]);
  });
});
