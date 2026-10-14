import {
  buildOutputToIgnore,
  conventionalRatio,
  detectPasteKind,
  isCleanStatus,
  isGreenRun,
  parseLogOneline,
  parsePathList,
  parseRunList,
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
} as const;

function fail(message: string): FieldVerdict {
  return { passed: false, message };
}

/** True when `path` is one of `patterns`, or sits inside one that names a folder (`dist/`). */
function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) =>
    pattern.endsWith('/') ? path.startsWith(pattern) : path === pattern,
  );
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
    if (secrets.length > 0) {
      return fail(
        `Still tracked: ${secrets.join(', ')}. Untrack with git rm --cached, then commit.`,
      );
    }
    if (check.kind === 'tracksPath') {
      // Any other file on the list, even an older workflow, doesn't prove the new one exists.
      return paths.some((path) => matchesAny(path, check.patterns))
        ? { passed: true, message: `Git tracks ${check.patterns.join(' or ')}.` }
        : fail(
            `${check.patterns.join(' or ')} isn't on that list yet. Commit it, then run ${verification.command} again.`,
          );
    }
    return { passed: true, message: 'No secret files are tracked.' };
  }

  if (verification.parser === 'gh-run-list') {
    const [newest] = parseRunList(text);
    if (newest === undefined) {
      return fail(
        `No run in that paste. Push the workflow first, then run ${verification.command}.`,
      );
    }
    if (isGreenRun(newest)) return { passed: true, message: 'Green on GitHub. The gate is live.' };
    return newest.status === 'completed'
      ? fail(
          `The newest run didn't go green (${newest.conclusion || 'no result'}). Open it in the Actions tab, copy the first error, and brief your agent to fix the cause.`,
        )
      : fail('That run is still going. Give it a minute, then run the command again.');
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
    if (check.kind === 'conventionalRatio') {
      const recent = commits.slice(0, check.last);
      const ratio = conventionalRatio(recent, check.types);
      const percent = Math.round(ratio * 100);
      if (check.types !== undefined) {
        // A typed check is about one kind of change, so it speaks of that type, not a share.
        const wanted = check.types.map((type) => `${type}:`).join(' or ');
        return ratio >= check.min
          ? { passed: true, message: `Pushed, with a ${wanted} message.` }
          : fail(
              `That commit doesn't start with ${wanted}. Make sure your change is the newest one on GitHub's main.`,
            );
      }
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
