import {
  buildOutputToIgnore,
  conventionalRatio,
  detectPasteKind,
  isCleanStatus,
  isSquashMergedSubject,
  normalizePaste,
  parseLogOneline,
  parsePathList,
  parseStatusLong,
  parseStatusShort,
  searchesAllHistoryFor,
  statusPosition,
  trackedSecretPaths,
  type ParsedStatus,
  type UpstreamState,
} from '../../engine/verify';
import type { FieldMission } from '../missions/schema';

/** One paste check from a Field Mission (DESIGN.md section 8). */
export type Verification = FieldMission['verifications'][number];

export interface FieldVerdict {
  readonly passed: boolean;
  /** What the game tells the player, pass or fail, in plain words. */
  readonly message: string;
}

const PARSER_NAMES = {
  'status-short': 'git status --short',
  'status-long': 'git status',
  'log-oneline': 'git log --oneline',
  'ls-files': 'git ls-files',
} as const;

function fail(message: string): FieldVerdict {
  return { passed: false, message };
}

function parseStatus(text: string): ParsedStatus | null {
  const kind = detectPasteKind(text);
  if (kind === 'status-short') return parseStatusShort(text);
  if (kind === 'status-long') return parseStatusLong(text);
  return null;
}

type CleanCheck = Extract<Verification['check'], { kind: 'clean' }>;

// What to do about each way a branch can be out of step with GitHub, in plain words.
const UPSTREAM_ADVICE: Record<UpstreamState, string> = {
  'up-to-date': '',
  behind: 'GitHub has commits you don’t have yet. Run git pull, then git status again.',
  ahead:
    'Your copy has commits GitHub doesn’t. Main should only change through merged PRs, so ask your agent to move them onto a branch.',
  diverged:
    'Your copy and GitHub’s have both moved. Ask your agent to bring them together without force, then check again.',
  gone: 'The branch this tracks is gone from GitHub. Run git fetch, then git status again.',
};

/** Clean, and, when the check asks, on the right branch and in step with GitHub. */
function verifyClean(check: CleanCheck, status: ParsedStatus): FieldVerdict {
  if (!isCleanStatus(status)) {
    return fail('Not clean yet. Commit what belongs in the repo and ignore what doesn’t.');
  }
  const position = statusPosition(status);
  if (check.branch !== undefined && position.branch !== check.branch) {
    const where = position.branch === null ? 'not on a branch' : `on ${position.branch}`;
    return fail(
      `Clean, but you’re ${where}. Run git switch ${check.branch}, then git pull, and check again.`,
    );
  }
  if (check.upstream === 'up-to-date' && position.upstream !== 'up-to-date') {
    return fail(
      position.upstream === null
        ? 'This paste doesn’t say whether you match GitHub. Run git fetch, then git status (not -s), and paste all of it.'
        : UPSTREAM_ADVICE[position.upstream],
    );
  }
  if (check.upstream === 'up-to-date') {
    return { passed: true, message: 'Clean, and in step with GitHub.' };
  }
  return { passed: true, message: 'Clean: nothing left to commit.' };
}

/**
 * A history search prints nothing when it finds nothing, so an empty paste passes only
 * when the copied command line shows the right search ran.
 */
function verifyNoCommits(verification: Verification, path: string, text: string): FieldVerdict {
  const commits = parseLogOneline(text);
  if (commits.length > 0) {
    const count = commits.length === 1 ? 'A commit' : `${String(commits.length)} commits`;
    return fail(
      `${count} touched ${path}, so it is still in the history and a push would publish it. Don’t push. Change every key that file held, then ask for help removing it from history.`,
    );
  }
  const { lines, command } = normalizePaste(text);
  if (lines.some((line) => line.trim() !== '')) {
    return fail(`That doesn’t look like git log output. Run ${verification.command}.`);
  }
  if (command === null || !searchesAllHistoryFor(command, path)) {
    return fail(
      `It prints nothing when ${path} was never committed, so copy the line where you typed ${verification.command} along with it.`,
    );
  }
  return { passed: true, message: `No commit on any branch ever held ${path}. Safe to push.` };
}

/** Visible paths in a status paste that match one of the ignore patterns, like `dist/`. */
function unignored(status: ParsedStatus, patterns: readonly string[]): string[] {
  const paths =
    status.format === 'short'
      ? // `!!` marks a file git ignores, which is exactly what this check wants to see.
        status.entries.filter((entry) => entry.index !== '!').map((entry) => entry.path)
      : [...status.untracked, ...status.staged.map((change) => change.path)];
  return paths.filter((path) =>
    patterns.some((pattern) =>
      pattern.endsWith('/')
        ? path === pattern || path.startsWith(pattern) || `${path}/` === pattern
        : path === pattern || path.endsWith(`/${pattern}`),
    ),
  );
}

/**
 * Checks one pasted output against a Field Mission verification. Never throws: a paste
 * that isn't what was asked for gets a message saying which command to run instead.
 */
export function verifyPaste(verification: Verification, text: string): FieldVerdict {
  const { check } = verification;
  if (check.kind === 'noCommits') return verifyNoCommits(verification, check.path, text);
  if (text.trim() === '' && verification.parser !== 'status-short') {
    return fail(`Paste the output of ${verification.command} first.`);
  }

  if (verification.parser === 'ls-files') {
    const paths = parsePathList(text);
    if (paths.length === 0) return fail(`That paste lists no files. Run ${verification.command}.`);
    const secrets = trackedSecretPaths(paths);
    return secrets.length === 0
      ? { passed: true, message: 'No secret files are tracked.' }
      : fail(`Still tracked: ${secrets.join(', ')}. Untrack with git rm --cached, then commit.`);
  }

  if (verification.parser === 'log-oneline') {
    const kind = detectPasteKind(text);
    if (kind !== 'log-oneline') {
      return fail(`That doesn't look like ${PARSER_NAMES['log-oneline']} output.`);
    }
    const commits = parseLogOneline(text);
    if (check.kind === 'minCommits') {
      return commits.length >= check.count
        ? { passed: true, message: `${String(commits.length)} commits. Nice.` }
        : fail(`Only ${String(commits.length)} commits; this needs ${String(check.count)}.`);
    }
    if (check.kind === 'squashMergedPr') {
      const subject = commits[0]?.subject ?? '';
      if (isSquashMergedSubject(subject)) {
        return { passed: true, message: `Squash-merged: “${subject}”.` };
      }
      return fail(
        subject.startsWith('Merge pull request')
          ? 'That PR was merged with a merge commit. Next time pick “Squash and merge”.'
          : 'The newest commit should be your squash-merged PR: a Conventional title ending in its number, like “fix: round tide heights (#12)”. Pull main first if you haven’t.',
      );
    }
    if (check.kind === 'conventionalRatio') {
      const ratio = conventionalRatio(commits.slice(0, check.last));
      const percent = Math.round(ratio * 100);
      return ratio >= check.min
        ? { passed: true, message: `${String(percent)}% of recent commits are Conventional.` }
        : fail(
            `${String(percent)}% are Conventional Commits; aim for ${String(Math.round(check.min * 100))}%. New commits count, so keep going.`,
          );
    }
    return fail(`Run ${verification.command} and paste that.`);
  }

  const status = parseStatus(text);
  if (status === null) {
    // A clean short status prints nothing, so only the copied command line shows what ran.
    return text.trim() === ''
      ? fail(`Copy the line where you typed ${verification.command} along with its output.`)
      : fail(`That doesn't look like git status output. Run ${verification.command}.`);
  }
  switch (check.kind) {
    case 'clean':
      return verifyClean(check, status);
    case 'noTrackedSecrets': {
      const secrets = trackedSecretPaths(status);
      return secrets.length === 0
        ? { passed: true, message: 'No secret files show up as tracked.' }
        : fail(`Tracked secrets: ${secrets.join(', ')}. Untrack them with git rm --cached.`);
    }
    case 'ignores': {
      const visible = [...unignored(status, check.patterns), ...buildOutputToIgnore(status)];
      const unique = [...new Set(visible)];
      // A pass names only what was checked, so a check without .env can't claim secrets are safe.
      return unique.length === 0
        ? { passed: true, message: `Git ignores ${check.patterns.join(', ')}.` }
        : fail(`Git still sees ${unique.join(', ')}. Add them to .gitignore.`);
    }
    default:
      return fail(`Run ${verification.command} and paste that.`);
  }
}
