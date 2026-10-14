import {
  buildOutputToIgnore,
  conventionalRatio,
  detectPasteKind,
  headingProblems,
  isCleanStatus,
  normalizePaste,
  parseLogOneline,
  parseMarkdownHeadings,
  parsePathList,
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

/** Paths as git prints them, so `docs\story.md` and `docs/story.md` are the same file. */
function samePath(a: string, b: string): boolean {
  return a.replaceAll('\\', '/') === b.replaceAll('\\', '/');
}

/** Every file a status paste lists as changed, staged, untracked or conflicted. */
function changedPaths(status: ParsedStatus): string[] {
  if (status.format === 'short') {
    return status.entries
      .filter((entry) => entry.index !== '!')
      .flatMap((entry) => [entry.path, ...(entry.originalPath ? [entry.originalPath] : [])]);
  }
  const changes = [...status.staged, ...status.unstaged];
  return [
    ...changes.flatMap((change) => [change.path, ...(change.from ? [change.from] : [])]),
    ...status.untracked,
    ...status.unmerged.map((entry) => entry.path),
  ];
}

/** The files a `git log ... <path>` command names, for saying what an empty log means. */
function loggedPaths(command: string): string[] {
  const [program, subcommand, ...rest] = command.split(/\s+/);
  if (program !== 'git' || subcommand !== 'log') return [];
  return rest.filter((word) => word !== '' && !word.startsWith('-'));
}

/** What a paste with no output in it means for this check: sometimes a pass, usually a nudge. */
function verifyEmptyPaste(verification: Verification): FieldVerdict {
  const { check, command } = verification;
  // A status limited to some files prints nothing when those files have nothing left to
  // commit, so for a check scoped to paths, no output is the clean answer.
  if (check.kind === 'clean' && check.paths !== undefined) {
    return {
      passed: true,
      message: `Nothing printed: ${check.paths.join(' and ')} have nothing left to commit.`,
    };
  }
  const [file] = loggedPaths(command);
  if (verification.parser === 'log-oneline' && file !== undefined) {
    return fail(
      `No line means no commit has touched ${file} yet. Ask your agent to commit it, then run it again.`,
    );
  }
  // A clean short status prints nothing, so only the copied command line shows what ran.
  if (verification.parser === 'status-short') {
    return fail(`Copy the line where you typed ${command} along with its output.`);
  }
  return fail(`Paste the output of ${command} first.`);
}

/** The ls-files checks: every named file is tracked, and no secret file is. */
function verifyPathList(verification: Verification, text: string): FieldVerdict {
  const paths = parsePathList(text);
  if (paths.length === 0) return fail(`That paste lists no files. Run ${verification.command}.`);
  const { check } = verification;
  const untracked =
    check.kind === 'tracked'
      ? check.paths.filter((wanted) => !paths.some((path) => samePath(path, wanted)))
      : [];
  if (untracked.length > 0) {
    return fail(`Git doesn’t track ${untracked.join(', ')} yet. Ask your agent to commit it.`);
  }
  const secrets = trackedSecretPaths(paths);
  if (secrets.length > 0) {
    return fail(`Still tracked: ${secrets.join(', ')}. Untrack with git rm --cached, then commit.`);
  }
  return check.kind === 'tracked'
    ? { passed: true, message: `Git tracks ${check.paths.join(' and ')}, and no secret files.` }
    : { passed: true, message: 'No secret files are tracked.' };
}

/** The headings check: a Select-String paste shows the wanted `##` headings, in order. */
function verifyHeadings(verification: Verification, text: string): FieldVerdict {
  const { check } = verification;
  if (check.kind !== 'headings') return fail(`Run ${verification.command} and paste that.`);
  const found = parseMarkdownHeadings(text);
  if (found.length === 0) {
    return fail('No ## headings in that paste. Is the file committed, and did you copy it all?');
  }
  const { missing, outOfOrder } = headingProblems(found, check.headings);
  if (missing.length > 0) {
    return fail(`Missing: ${missing.join(', ')}. Ask your agent to add only that, and commit.`);
  }
  if (outOfOrder.length > 0) {
    return fail(
      `Out of order: ${outOfOrder.join(', ')}. The order is ${check.headings.join(', ')}.`,
    );
  }
  return { passed: true, message: `All ${String(check.headings.length)} headings, in order.` };
}

/**
 * Checks one pasted output against a Field Mission verification. Never throws: a paste
 * that isn't what was asked for gets a message saying which command to run instead.
 */
export function verifyPaste(verification: Verification, text: string): FieldVerdict {
  const output = normalizePaste(text);
  // A copied `git status --short` line with nothing under it is a clean tree, not nothing.
  const typedShortStatus = detectPasteKind(text) === 'status-short';
  if (output.lines.length === 0 && !typedShortStatus) return verifyEmptyPaste(verification);
  const { check } = verification;

  if (verification.parser === 'ls-files') return verifyPathList(verification, text);
  if (verification.parser === 'select-string') return verifyHeadings(verification, text);

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
    return fail(`That doesn't look like git status output. Run ${verification.command}.`);
  }
  switch (check.kind) {
    case 'clean': {
      const { paths } = check;
      if (paths !== undefined) {
        // Only the named files count, so unrelated work in progress never has to be
        // stashed, reverted or swept into a commit just to pass.
        const left = changedPaths(status).filter((path) =>
          paths.some((wanted) => samePath(path, wanted)),
        );
        return left.length === 0
          ? { passed: true, message: `${paths.join(' and ')} have nothing left to commit.` }
          : fail(`Not committed yet: ${left.join(', ')}. Ask your agent to commit only those.`);
      }
      return isCleanStatus(status)
        ? { passed: true, message: 'Clean: nothing left to commit.' }
        : fail('Not clean yet. Commit what belongs in the repo and ignore what doesn’t.');
    }
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
