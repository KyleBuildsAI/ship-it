import type { ParsedStatusLong } from './statusLong';
import type { ParsedStatusShort, ShortEntry } from './statusShort';

/** Either status format. Checks read both, so Kyle can paste whichever he ran. */
export type ParsedStatus = ParsedStatusLong | ParsedStatusShort;

/**
 * Where a check reads file paths from: a parsed status, or a plain list of paths (for
 * example from `git ls-files`, which lists every tracked file, changed or not).
 */
export type PathSource = ParsedStatus | readonly string[];

// ---- Commit messages -------------------------------------------------------------------

// type, an optional (scope), an optional "!" marking a breaking change, then ": " and a
// description that starts right away. Types are lowercase, as the convention writes them.
const CONVENTIONAL_SUBJECT =
  /^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([^()\s][^()]*\))?!?: \S/;

// Subjects git or GitHub write on their own: merges, and `git revert`'s default message.
const GENERATED_SUBJECT =
  /^(?:Merge (?:branch|branches|remote-tracking branch|tag|commit|pull request) |Revert ")/;

/** True for a Conventional Commit subject like `feat(parser): read quoted paths`. */
export function isConventionalSubject(subject: string): boolean {
  return CONVENTIONAL_SUBJECT.test(subject);
}

/** True for a subject git wrote itself, like `Merge branch 'feature'`. */
export function isGeneratedSubject(subject: string): boolean {
  return GENERATED_SUBJECT.test(subject);
}

/**
 * The share of commits, from 0 to 1, whose subject follows Conventional Commits.
 * Subjects git generated don't count either way, since nobody typed them. With no
 * commits left to judge, the answer is 0: no evidence earns no credit.
 */
export function conventionalRatio(commits: readonly { readonly subject: string }[]): number {
  const written = commits.filter((commit) => !isGeneratedSubject(commit.subject));
  if (written.length === 0) return 0;
  const conventional = written.filter((commit) => isConventionalSubject(commit.subject));
  return conventional.length / written.length;
}

// ---- Working tree ----------------------------------------------------------------------

/**
 * True when there is nothing to commit. Ignored files (`!!`, shown only with --ignored)
 * don't count: being left out is exactly what they are for. A short status with no lines
 * at all also counts as clean, because that is what a clean `git status -s` prints, so
 * check detectPasteKind first to be sure the paste really was a status.
 */
export function isCleanStatus(status: ParsedStatus): boolean {
  if (status.format === 'long') return status.clean;
  return status.warnings.length === 0 && status.entries.every((entry) => entry.index === '!');
}

/** A conflict in short format: a U in either column, or AA / DD (both added or deleted). */
function isConflict({ index, worktree }: ShortEntry): boolean {
  return index === 'U' || worktree === 'U' || (index === worktree && 'AD'.includes(index));
}

/**
 * True when the file will still be tracked after the next commit. A staged deletion is
 * the exception: `git rm --cached .env` shows as one, and it is the fix, not the problem.
 */
function staysTracked(entry: ShortEntry): boolean {
  if (entry.index === '?' || entry.index === '!') return false;
  return entry.index !== 'D' || isConflict(entry);
}

/** Paths git will still track after the next commit. */
function trackedPaths(source: PathSource): string[] {
  if (!('format' in source)) return [...source];
  if (source.format === 'short') {
    return source.entries.filter(staysTracked).map((entry) => entry.path);
  }
  return [
    ...source.staged.filter((change) => change.kind !== 'deleted'),
    ...source.unstaged,
    ...source.unmerged,
  ].map((entry) => entry.path);
}

/** Paths git shows in status, which means no .gitignore rule hides them. */
function visiblePaths(source: PathSource): string[] {
  if (!('format' in source)) return [...source];
  if (source.format === 'short') {
    return source.entries
      .filter((entry) => entry.index === '?' || staysTracked(entry))
      .map((entry) => entry.path);
  }
  return [...trackedPaths(source), ...source.untracked];
}

// ---- Secrets ---------------------------------------------------------------------------

// File names that usually hold passwords, keys, or tokens. Compared in lowercase, since
// Windows treats README.md and readme.md as the same file.
const SECRET_NAMES = new Set([
  '.env',
  '.netrc',
  '.pgpass',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  'credentials.json',
  'secrets.json',
  'secrets.yml',
  'secrets.yaml',
]);

// Private keys and certificate stores.
const SECRET_EXTENSIONS = ['.pem', '.key', '.p12', '.pfx', '.jks', '.keystore'];

// .env templates list variable names with no values, so they are meant to be committed.
const ENV_TEMPLATES = new Set(['.env.example', '.env.sample', '.env.template']);

/** True for a path whose file name usually holds secrets, like `.env` or `id_rsa`. */
export function isSecretPath(path: string): boolean {
  const name = (path.split('/').pop() ?? '').toLowerCase();
  // .env.local, .env.production, and friends hold real values too.
  if (name.startsWith('.env.')) return !ENV_TEMPLATES.has(name);
  return SECRET_NAMES.has(name) || SECRET_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/**
 * Secret files that git tracks, or will after the next commit. A status only lists
 * files that changed, so an untouched tracked `.env` won't show there. Pass the lines
 * of `git ls-files` to check every tracked file.
 */
export function trackedSecretPaths(source: PathSource): string[] {
  return [...new Set(trackedPaths(source).filter(isSecretPath))];
}

// ---- Build output ----------------------------------------------------------------------

// Folders that tools regenerate on every build or install. They belong in .gitignore.
const BUILD_OUTPUT_FOLDERS = ['dist', 'build', 'node_modules', 'coverage'];

/**
 * The .gitignore lines to add, like `dist/`, for build output that git can still see.
 * Anything git lists in status isn't ignored yet, whether tracked or untracked.
 */
export function buildOutputToIgnore(source: PathSource): string[] {
  const seen = new Set<string>();
  for (const path of visiblePaths(source)) {
    // Every part but the last is a folder. Git shows a whole untracked folder as "dist/",
    // whose last part is empty, so "dist" still counts.
    for (const folder of path.toLowerCase().split('/').slice(0, -1)) seen.add(folder);
  }
  return BUILD_OUTPUT_FOLDERS.filter((folder) => seen.has(folder)).map((folder) => `${folder}/`);
}
