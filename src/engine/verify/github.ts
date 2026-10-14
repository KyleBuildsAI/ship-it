import { isConventionalSubject } from './checks';

/*
 * The opt-in GitHub check for a Field Mission (DESIGN.md section 8): judging what GitHub's
 * API says about a merged pull request. This file only reads data that was already
 * fetched; the game does the fetching, so the rules here stay pure and tested.
 */

/** A repository on GitHub, as its owner and name: `kyle/sandcastles`. */
export interface RepoSlug {
  readonly owner: string;
  readonly repo: string;
}

/** The fields of GitHub's pull request JSON this check reads. */
export interface PullRequestSummary {
  readonly number: number;
  readonly title: string;
  readonly body: string | null;
  readonly mergedAt: string | null;
  readonly mergeCommitSha: string | null;
}

export interface PullRequestFacts {
  readonly pull: PullRequestSummary;
  /** The state of the issue the PR closes, or null when it links none. */
  readonly issueState: 'open' | 'closed' | null;
  /** The commit main points at on GitHub right now. */
  readonly mainSha: string;
}

// GitHub's own limits: owners are letters, digits and single hyphens; repo names also
// allow dots and underscores.
const OWNER = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})';
const REPO = '[A-Za-z0-9._-]{1,100}';
const SLUG_FORMS = [
  new RegExp(`^(${OWNER})/(${REPO})$`),
  new RegExp(`^https?://(?:www\\.)?github\\.com/(${OWNER})/(${REPO}?)(?:\\.git)?/?(?:[?#].*)?$`),
  new RegExp(`^git@github\\.com:(${OWNER})/(${REPO}?)(?:\\.git)?$`),
];

/**
 * Reads a repository from what Kyle types or pastes: `owner/repo`, its github.com link,
 * or the address `git remote -v` prints. Anything else is null, so nothing unexpected
 * ever becomes part of a request URL.
 */
export function parseRepoSlug(text: string): RepoSlug | null {
  const trimmed = text.trim();
  for (const form of SLUG_FORMS) {
    const match = form.exec(trimmed);
    if (match === null) continue;
    const [, owner = '', rawRepo = ''] = match;
    const repo = rawRepo.replace(/\.git$/, '');
    // "." and ".." are path segments, never repository names.
    if (repo === '' || repo === '.' || repo === '..') return null;
    return { owner, repo };
  }
  return null;
}

/** The pull request merged most recently, or null when none in the list was merged. */
export function latestMergedPull(pulls: readonly PullRequestSummary[]): PullRequestSummary | null {
  let latest: PullRequestSummary | null = null;
  let latestAt = '';
  for (const pull of pulls) {
    // GitHub's timestamps are ISO 8601 in UTC, so comparing them as text orders them.
    if (pull.mergedAt === null || pull.mergedAt <= latestAt) continue;
    latest = pull;
    latestAt = pull.mergedAt;
  }
  return latest;
}

// The keywords GitHub reads in a PR description to close an issue when the PR merges.
const CLOSING_KEYWORD = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):? #(\d+)\b/i;

/** The issue number a PR description closes with "Closes #12" and friends, or null. */
export function linkedIssueNumber(body: string | null): number | null {
  const match = CLOSING_KEYWORD.exec(body ?? '');
  return match?.[1] === undefined ? null : Number(match[1]);
}

/** A line reduced to its words: "## What changed" and "**What changed:**" both read "what changed". */
function headingText(line: string): string {
  return line
    .replace(/^[\s#>*_-]+/, '')
    .replace(/[\s*_:]+$/, '')
    .toLowerCase();
}

/** The sections, like "Why", that no line of the description starts as a heading for. */
export function missingSections(body: string | null, sections: readonly string[]): string[] {
  const headings = new Set((body ?? '').split(/\r?\n/).map(headingText));
  return sections.filter((section) => !headings.has(section.toLowerCase()));
}

/**
 * Everything wrong with the merged PR, in plain words. Empty means it did what the
 * Field Mission asked: a Conventional title, the description's sections, a linked
 * issue that closed, and main on GitHub pointing at the PR's merge.
 */
export function pullRequestProblems(
  facts: PullRequestFacts,
  sections: readonly string[],
): string[] {
  const { pull, issueState, mainSha } = facts;
  const problems: string[] = [];
  const name = `PR #${String(pull.number)}`;
  if (!isConventionalSubject(pull.title)) {
    problems.push(`${name}’s title isn’t a Conventional Commit, like “fix: round tide heights”.`);
  }
  const missing = missingSections(pull.body, sections);
  if (missing.length > 0) {
    problems.push(`${name}’s description has no ${missing.join(', ')} section.`);
  }
  if (issueState === null) {
    problems.push(`${name}’s description doesn’t close an issue with “Closes #N”.`);
  } else if (issueState === 'open') {
    problems.push(`The issue ${name} links is still open.`);
  }
  if (pull.mergeCommitSha !== mainSha) {
    problems.push(`main on GitHub has moved past ${name}, or it merged into another branch.`);
  }
  return problems;
}
