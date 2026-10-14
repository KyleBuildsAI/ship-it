import { z } from 'zod';
import {
  latestMergedPull,
  linkedIssueNumber,
  pullRequestProblems,
  type PullRequestSummary,
  type RepoSlug,
} from '../../engine/verify';
import type { FieldVerdict } from './fieldCheck';

/*
 * The opt-in GitHub check (DESIGN.md section 8). It asks GitHub's public API about a
 * public repo without signing in, so no token exists to leak, and GitHub allows about 60
 * of these requests an hour per network. Requests only ever go to api.github.com, and the
 * only thing in them is the owner and repo name Kyle typed, already checked by
 * parseRepoSlug. The paste checks stay the way to finish the mission.
 */

export const GITHUB_API = 'https://api.github.com';

/** What a GET returned: its status, and the parsed JSON body when there was one. */
export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

/** Fetches a GitHub API path. Tests pass their own, so nothing touches the network. */
export type GitHubGet = (path: string) => Promise<ApiResponse>;

const PullSchema = z.object({
  number: z.int(),
  title: z.string(),
  body: z.string().nullable(),
  merged_at: z.string().nullable(),
  merge_commit_sha: z.string().nullable(),
});

const IssueSchema = z.object({ state: z.enum(['open', 'closed']) });
const CommitSchema = z.object({ sha: z.string() });

/** The one way this module reaches the network: a GET to api.github.com, nowhere else. */
export const browserGet: GitHubGet = async (path) => {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  // A 404 or 403 still has a JSON body with GitHub's own message, and no body is fine too.
  const body: unknown = await response.json().catch(() => null);
  return { status: response.status, body };
};

/** A failed request, explained in words a vibe coder can act on. */
class GitHubProblem extends Error {}

function explainStatus(status: number, slug: RepoSlug): string {
  const name = `${slug.owner}/${slug.repo}`;
  if (status === 404) {
    return `GitHub shows no public repo at ${name}. This check reads public repos only; for a private one, the paste checks are all you need.`;
  }
  if (status === 403 || status === 429) {
    return 'GitHub allows about 60 checks an hour without signing in, and that ran out. Try again later.';
  }
  return `GitHub answered ${String(status)}. Try again in a minute.`;
}

async function getJson<T>(
  get: GitHubGet,
  path: string,
  schema: z.ZodType<T>,
  slug: RepoSlug,
): Promise<T> {
  const { status, body } = await get(path);
  if (status !== 200) throw new GitHubProblem(explainStatus(status, slug));
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new GitHubProblem('GitHub sent something this check can’t read.');
  return parsed.data;
}

function toSummary(pull: z.infer<typeof PullSchema>): PullRequestSummary {
  return {
    number: pull.number,
    title: pull.title,
    body: pull.body,
    mergedAt: pull.merged_at,
    mergeCommitSha: pull.merge_commit_sha,
  };
}

/**
 * Checks the PR most recently merged into main: a Conventional title, the description's
 * sections, a "Closes #N" issue that closed, and main on GitHub pointing at the merge.
 * Never throws: a network or API problem comes back as a failed verdict saying why.
 */
export async function checkMergedPullRequest(
  slug: RepoSlug,
  sections: readonly string[],
  get: GitHubGet = browserGet,
): Promise<FieldVerdict> {
  // Names are encoded even though parseRepoSlug already allows only safe characters.
  const repoPath = `/repos/${encodeURIComponent(slug.owner)}/${encodeURIComponent(slug.repo)}`;
  try {
    const pulls = await getJson(
      get,
      `${repoPath}/pulls?state=closed&base=main&sort=updated&direction=desc&per_page=20`,
      z.array(PullSchema),
      slug,
    );
    const pull = latestMergedPull(pulls.map(toSummary));
    if (pull === null) {
      return { passed: false, message: 'GitHub shows no merged pull request into main yet.' };
    }
    const issue = linkedIssueNumber(pull.body);
    const issueState =
      issue === null
        ? null
        : (await getJson(get, `${repoPath}/issues/${String(issue)}`, IssueSchema, slug)).state;
    const main = await getJson(get, `${repoPath}/commits/main`, CommitSchema, slug);
    const problems = pullRequestProblems({ pull, issueState, mainSha: main.sha }, sections);
    return problems.length === 0
      ? {
          passed: true,
          message: `GitHub confirms PR #${String(pull.number)}: “${pull.title}”, described, linked and merged.`,
        }
      : { passed: false, message: problems.join(' ') };
  } catch (error) {
    if (error instanceof GitHubProblem) return { passed: false, message: error.message };
    // fetch rejects only when the request never got an answer: offline, or blocked.
    return { passed: false, message: 'Couldn’t reach GitHub. Check your connection.' };
  }
}
