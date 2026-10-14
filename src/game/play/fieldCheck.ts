import {
  buildOutputToIgnore,
  conventionalRatio,
  detectPasteKind,
  isCleanStatus,
  isConventionalSubject,
  isTypedBranchName,
  parseLogGraph,
  parseLogOneline,
  parsePathList,
  parseStatusLong,
  parseStatusShort,
  readTopMerge,
  trackedSecretPaths,
  type ParsedStatus,
} from '../../engine/verify';
import type { FieldCheck, FieldMission } from '../missions/schema';

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

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Judges a `git log --oneline --graph` paste for a landed branch. Each failure names the
 * likely cause in plain words, since the usual one is a merge that went the wrong way
 * (a squash, a rebase, or a commit straight on main), not a typo.
 */
function verifyMerge(command: string, text: string): FieldVerdict {
  const merge = readTopMerge(parseLogGraph(text));
  switch (merge.kind) {
    case 'empty':
      return fail(`That paste shows no commits. Run ${command}.`);
    case 'not-a-merge':
      return fail(
        'The newest commit on main isn’t a merge commit. A squashed or rebased pull request leaves none, so merge with "Create a merge commit". Not merged yet? Merge it on GitHub, then git pull.',
      );
    case 'no-graph':
      return fail(
        `That paste has no graph, so the branch's commits can't be told apart. Run ${command}, with --graph.`,
      );
    case 'no-branch-commit':
      return fail(
        'That merge brought in no commit the paste shows. Paste all five lines, and make sure the branch had its own commit.',
      );
    case 'merged':
      break;
  }
  const { branch, branchCommit } = merge;
  if (branch === null) {
    return fail('That merge commit doesn’t name its branch. Merge the pull request on GitHub.');
  }
  if (!isTypedBranchName(branch)) {
    return fail(`The merged branch is "${branch}". Name branches by type, like feat/readme-fix.`);
  }
  if (!isConventionalSubject(branchCommit.subject)) {
    return fail(
      `The branch's commit "${branchCommit.subject}" isn't a Conventional Commit. Start it with a type like feat: or docs:.`,
    );
  }
  return { passed: true, message: `Main has a merge commit from ${branch}.` };
}

/** True when the branch tracks a remote branch and neither is ahead of the other. */
function isUpToDate(status: ParsedStatus): boolean {
  if (status.format === 'long') return status.upstream?.state === 'up-to-date';
  const branch = status.branch;
  return (
    branch?.upstream !== undefined &&
    branch.upstreamGone !== true &&
    (branch.ahead ?? 0) === 0 &&
    (branch.behind ?? 0) === 0
  );
}

/**
 * Checks a status paste for the "clean" check. The branch and upToDate options also need
 * the branch line, which plain `git status` and `git status -sb` print but `-s` doesn't.
 */
function verifyClean(
  check: Extract<FieldCheck, { kind: 'clean' }>,
  status: ParsedStatus,
): FieldVerdict {
  const needsBranch = check.branch !== undefined || check.upToDate === true;
  const branch = status.format === 'long' ? status.branch : (status.branch?.name ?? null);
  if (needsBranch && branch === null) {
    return fail('That paste doesn’t show the branch. Paste everything plain git status prints.');
  }
  if (check.branch !== undefined && branch !== check.branch) {
    return fail(`That's ${branch ?? 'no branch'}. Switch to ${check.branch} first.`);
  }
  if (!isCleanStatus(status)) {
    return fail('Not clean yet. Commit what belongs in the repo and ignore what doesn’t.');
  }
  if (check.upToDate === true && !isUpToDate(status)) {
    // Ahead means merged here but never pushed; behind means GitHub has work not pulled.
    return fail(
      `Not on GitHub yet: ${branch ?? 'this branch'} doesn't match its remote. Pull, then push.`,
    );
  }
  return {
    passed: true,
    message:
      check.upToDate === true ? 'Clean, and it matches GitHub.' : 'Clean: nothing left to commit.',
  };
}

/**
 * Checks one pasted output against a Field Mission verification. Never throws: a paste
 * that isn't what was asked for gets a message saying which command to run instead.
 */
export function verifyPaste(verification: Verification, text: string): FieldVerdict {
  if (text.trim() === '' && verification.parser !== 'status-short') {
    return fail(`Paste the output of ${verification.command} first.`);
  }
  const { check } = verification;

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
    if (check.kind === 'mergeCommit') return verifyMerge(verification.command, text);
    const commits = parseLogOneline(text);
    if (check.kind === 'minCommits') {
      return commits.length >= check.count
        ? { passed: true, message: `${plural(commits.length, 'commit')}. Nice.` }
        : fail(`Only ${plural(commits.length, 'commit')}; this needs ${String(check.count)}.`);
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
