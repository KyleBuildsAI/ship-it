import {
  buildOutputToIgnore,
  commitType,
  conventionalRatio,
  detectPasteKind,
  findSecretLike,
  firstTracked,
  isCleanStatus,
  newestWrittenCommit,
  parseLogOneline,
  parsePathList,
  parseStatusLong,
  parseStatusShort,
  trackedSecretPaths,
  unpushedCommits,
  type ParsedStatus,
} from '../../engine/verify';
import type { FieldMission } from '../missions/schema';

/** One paste check from a Field Mission (DESIGN.md section 8). */
export type Verification = FieldMission['verifications'][number];

export interface FieldVerdict {
  readonly passed: boolean;
  /** What the game tells the player, pass or fail, in plain words. */
  readonly message: string;
  /** True when the paste held something secret-like, so the view must clear it. */
  readonly clearPaste?: boolean;
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

/** Whether a status paste passes a `clean` check, with its upstream when `pushed` asks. */
function checkClean(status: ParsedStatus, pushed: boolean): FieldVerdict {
  if (!isCleanStatus(status)) {
    return fail('Not clean yet. Commit what belongs in the repo and ignore what doesn’t.');
  }
  if (!pushed) return { passed: true, message: 'Clean: nothing left to commit.' };
  const waiting = unpushedCommits(status);
  if (waiting === null) {
    return fail(
      'Committed, but this paste can’t show the push. Run the command exactly as shown, with -sb, on a branch that tracks GitHub.',
    );
  }
  return waiting === 0
    ? { passed: true, message: 'Committed and pushed: GitHub has it.' }
    : fail(
        `Committed, not pushed: ${String(waiting)} commit${waiting === 1 ? '' : 's'} still only on this computer. Ask your agent to push.`,
      );
}

/** Checks a `git ls-files` paste, which lists every tracked file. */
function checkTrackedFiles(verification: Verification, text: string): FieldVerdict {
  const paths = parsePathList(text);
  if (paths.length === 0) return fail(`That paste lists no files. Run ${verification.command}.`);
  const { check } = verification;
  if (check.kind === 'tracksAny') {
    const found = firstTracked(paths, check.paths);
    return found === null
      ? fail(`Git doesn’t track ${check.paths.join(' or ')} yet. Commit it first.`)
      : { passed: true, message: `Git tracks ${found}.` };
  }
  const secrets = trackedSecretPaths(paths);
  return secrets.length === 0
    ? { passed: true, message: 'No secret files are tracked.' }
    : fail(`Still tracked: ${secrets.join(', ')}. Untrack with git rm --cached, then commit.`);
}

/** Checks a `git log --oneline` paste. */
function checkLog(verification: Verification, text: string): FieldVerdict {
  if (detectPasteKind(text) !== 'log-oneline') {
    return fail(`That doesn't look like ${PARSER_NAMES['log-oneline']} output.`);
  }
  const commits = parseLogOneline(text);
  const { check } = verification;
  switch (check.kind) {
    case 'minCommits':
      return commits.length >= check.count
        ? { passed: true, message: `${String(commits.length)} commits. Nice.` }
        : fail(`Only ${String(commits.length)} commits; this needs ${String(check.count)}.`);
    case 'conventionalRatio': {
      const ratio = conventionalRatio(commits.slice(0, check.last));
      const percent = Math.round(ratio * 100);
      return ratio >= check.min
        ? { passed: true, message: `${String(percent)}% of recent commits are Conventional.` }
        : fail(
            `${String(percent)}% are Conventional Commits; aim for ${String(Math.round(check.min * 100))}%. New commits count, so keep going.`,
          );
    }
    case 'newestCommitType': {
      const newest = newestWrittenCommit(commits);
      const type = newest === null ? null : commitType(newest.subject);
      return type === check.type
        ? { passed: true, message: `Your newest commit is a ${check.type}: commit.` }
        : fail(
            `Your newest commit should start with ${check.type}:, like "${check.type}: add environment setup for agents".`,
          );
    }
    default:
      return fail(`Run ${verification.command} and paste that.`);
  }
}

/**
 * Checks one pasted output against a Field Mission verification. Never throws: a paste
 * that isn't what was asked for gets a message saying which command to run instead.
 * A paste that looks like it holds a secret is never parsed, only reported by kind.
 */
export function verifyPaste(verification: Verification, text: string): FieldVerdict {
  const secret = findSecretLike(text);
  if (secret !== null) {
    return {
      passed: false,
      clearPaste: true,
      message: `That paste looked like it held a ${secret}, so it was cleared and not checked. Treat it as leaked: rotate it (make a new one and delete the old), then paste only what the command prints.`,
    };
  }
  if (text.trim() === '' && verification.parser !== 'status-short') {
    return fail(`Paste the output of ${verification.command} first.`);
  }
  if (verification.parser === 'ls-files') return checkTrackedFiles(verification, text);
  if (verification.parser === 'log-oneline') return checkLog(verification, text);

  const { check } = verification;
  const status = parseStatus(text);
  if (status === null) {
    // A clean short status prints nothing, so only the copied command line shows what ran.
    return text.trim() === ''
      ? fail(`Copy the line where you typed ${verification.command} along with its output.`)
      : fail(`That doesn't look like git status output. Run ${verification.command}.`);
  }
  switch (check.kind) {
    case 'clean':
      return checkClean(status, check.pushed === true);
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
