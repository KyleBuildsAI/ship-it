import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserGet, checkMergedPullRequest, GITHUB_API, type GitHubGet } from './githubCheck';

const SLUG = { owner: 'kyle-c', repo: 'SandCastles' };
const SECTIONS = ['What changed', 'Why', 'How to test'];
const BODY = '## What changed\nx\n## Why\ny\n## How to test\nz\n\nCloses #12';

function merged(overrides: Record<string, unknown> = {}) {
  return {
    number: 13,
    title: 'fix: round tide heights',
    body: BODY,
    merged_at: '2026-10-12T09:00:00Z',
    merge_commit_sha: 'abc123',
    ...overrides,
  };
}

/** A fake GitHub: each path prefix answers with a status and body. */
function fakeGitHub(answers: Record<string, { status: number; body: unknown }>): GitHubGet {
  return (path) => {
    const key = Object.keys(answers).find((prefix) => path.includes(prefix));
    const answer = key === undefined ? undefined : answers[key];
    return Promise.resolve(answer ?? { status: 500, body: null });
  };
}

describe('checkMergedPullRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes a PR that did everything the Field Mission asked', async () => {
    const get = fakeGitHub({
      '/pulls': { status: 200, body: [merged()] },
      '/issues/12': { status: 200, body: { state: 'closed' } },
      '/commits/main': { status: 200, body: { sha: 'abc123' } },
    });
    const verdict = await checkMergedPullRequest(SLUG, SECTIONS, get);
    expect(verdict.passed).toBe(true);
    expect(verdict.message).toContain('PR #13');
  });

  it('lists what a PR got wrong, and skips the issue lookup when none is linked', async () => {
    const asked: string[] = [];
    const answers = fakeGitHub({
      '/pulls': { status: 200, body: [merged({ body: 'did a thing' })] },
      '/commits/main': { status: 200, body: { sha: 'abc123' } },
    });
    const get: GitHubGet = (path) => {
      asked.push(path);
      return answers(path);
    };
    const verdict = await checkMergedPullRequest(SLUG, SECTIONS, get);
    expect(verdict.passed).toBe(false);
    expect(verdict.message).toContain('Closes #N');
    expect(asked.some((path) => path.includes('/issues/'))).toBe(false);
  });

  it('says when nothing has merged into main yet', async () => {
    const get = fakeGitHub({ '/pulls': { status: 200, body: [merged({ merged_at: null })] } });
    expect((await checkMergedPullRequest(SLUG, SECTIONS, get)).message).toContain(
      'no merged pull request',
    );
  });

  it('explains a private or missing repo, and the hourly limit, in plain words', async () => {
    const missing = fakeGitHub({ '/pulls': { status: 404, body: { message: 'Not Found' } } });
    expect((await checkMergedPullRequest(SLUG, SECTIONS, missing)).message).toContain(
      'no public repo at kyle-c/SandCastles',
    );
    const limited = fakeGitHub({ '/pulls': { status: 403, body: null } });
    expect((await checkMergedPullRequest(SLUG, SECTIONS, limited)).message).toContain(
      '60 checks an hour',
    );
    const broken = fakeGitHub({ '/pulls': { status: 502, body: null } });
    expect((await checkMergedPullRequest(SLUG, SECTIONS, broken)).message).toContain('502');
  });

  it('never throws, even offline or on a reply it can’t read', async () => {
    const odd = fakeGitHub({ '/pulls': { status: 200, body: { not: 'a list' } } });
    expect((await checkMergedPullRequest(SLUG, SECTIONS, odd)).message).toContain('can’t read');
    const offline: GitHubGet = () => Promise.reject(new TypeError('Failed to fetch'));
    expect((await checkMergedPullRequest(SLUG, SECTIONS, offline)).message).toContain(
      'Couldn’t reach GitHub',
    );
  });

  it('sends requests to api.github.com and nowhere else', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ sha: 'abc' }), { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(browserGet('/repos/kyle-c/SandCastles/commits/main')).resolves.toEqual({
      status: 200,
      body: { sha: 'abc' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${GITHUB_API}/repos/kyle-c/SandCastles/commits/main`,
      expect.objectContaining({ headers: { Accept: 'application/vnd.github+json' } }),
    );
    expect(GITHUB_API).toBe('https://api.github.com');
  });

  it('reads a reply with no JSON body as null', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 404 })));
    await expect(browserGet('/repos/a/b/pulls')).resolves.toEqual({ status: 404, body: null });
  });
});
