import {
  buildOutputToIgnore,
  commitTypeOf,
  conventionalRatio,
  detectPasteKind,
  documentedRequest,
  isCleanStatus,
  isFromFile,
  isPushedStatus,
  parseLogOneline,
  parsePathList,
  parseSelectString,
  parseStatusLong,
  parseStatusShort,
  trackedSecretPaths,
  type ParsedStatus,
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
  'select-string': 'Select-String',
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

/** A Select-String paste: which lines of the file name a request and a status code. */
function verifySelectString(verification: Verification, text: string): FieldVerdict {
  const { check } = verification;
  if (check.kind !== 'documentsRequest') return fail(`Run ${verification.command} and paste that.`);
  const matches = parseSelectString(text).filter((match) => isFromFile(match, check.file));
  if (matches.length === 0) {
    return fail(
      `No lines from ${check.file} in that paste. Run ${verification.command}, or ask your agent to run it and show you the exact output.`,
    );
  }
  const { request, statusCode } = documentedRequest(matches.map((match) => match.text));
  if (request === null) return fail(`${check.file} doesn't name a request like GET /health yet.`);
  if (statusCode === null) return fail(`${check.file} names ${request}, but not its status code.`);
  return { passed: true, message: `${check.file} documents ${request} and its ${statusCode}.` };
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

  if (verification.parser === 'select-string') return verifySelectString(verification, text);

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
    if (check.kind === 'newestCommitType') {
      const [newest] = commits;
      if (newest === undefined) {
        return fail(`That paste lists no commits. Run ${verification.command}.`);
      }
      const type = commitTypeOf(newest.subject);
      return type === check.type
        ? { passed: true, message: `The newest one is a ${check.type}: commit.` }
        : fail(
            `The newest commit there is "${newest.subject}". It should start with ${check.type}:, so check it was merged and pulled.`,
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
      return isCleanStatus(status)
        ? { passed: true, message: 'Clean: nothing left to commit.' }
        : fail('Not clean yet. Commit what belongs in the repo and ignore what doesn’t.');
    case 'pushed':
      if (!isCleanStatus(status)) {
        return fail('Not clean yet. Commit what belongs in the repo and ignore what doesn’t.');
      }
      return isPushedStatus(status)
        ? { passed: true, message: 'Clean, and the same as the copy on GitHub.' }
        : fail(
            'Clean, but not the same as GitHub: git status should say it is up to date with origin. Push, or pull, then paste again.',
          );
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
