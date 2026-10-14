import type { ParsedStatusLong, UpstreamState } from './statusLong';
import type { ParsedStatusShort, ShortBranch, ShortEntry } from './statusShort';

/** Either status format. Checks read both, so Kyle can paste whichever he ran. */
export type ParsedStatus = ParsedStatusLong | ParsedStatusShort;

/**
 * Where a check reads file paths from: a parsed status, or a plain list of paths (for
 * example a `git ls-files` paste read by parsePathList, which lists every tracked file,
 * changed or not).
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

// GitHub ends the commit a squash merge makes with the PR's number, like " (#12)". A
// commit made straight on main never gets one, so the number is the evidence a PR merged.
const PULL_REQUEST_SUFFIX = / \(#[1-9]\d*\)$/;

/**
 * True for the commit GitHub's "Squash and merge" writes from a pull request with a
 * Conventional title, like `fix: round tide heights (#12)`. A plain merge
 * ("Merge pull request #12 from ...") and a direct commit to main both fail.
 */
export function isSquashMergedSubject(subject: string): boolean {
  return isConventionalSubject(subject) && PULL_REQUEST_SUFFIX.test(subject);
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

/**
 * True when a typed command searches every branch's history for one path, like
 * `git log --all --oneline -- .env`. When the path was never committed it prints nothing,
 * so the copied command line is the only proof the right search ran. Without `--all` it
 * would miss a commit that sits only on another branch, which a push can still publish.
 */
export function searchesAllHistoryFor(command: string, path: string): boolean {
  const [program, subcommand, ...rest] = command.trim().split(/\s+/);
  // PowerShell users often quote paths, as in -- '.env'.
  const args = rest.map((arg) => arg.replace(/^['"]|['"]$/g, ''));
  return program === 'git' && subcommand === 'log' && args.includes('--all') && args.includes(path);
}

// ---- Working tree ----------------------------------------------------------------------

/**
 * True when there is nothing to commit, whichever status format Kyle pasted. Each parser
 * works this out as it reads, and never calls a paste it couldn't fully read clean.
 */
export function isCleanStatus(status: ParsedStatus): boolean {
  return status.clean;
}

/** Where a status says HEAD is, and how it stands against the branch it tracks. */
export interface StatusPosition {
  /** The checked-out branch, or null when HEAD is detached or the paste never said. */
  readonly branch: string | null;
  /** Null when the paste shows no upstream: none is set, or `-s` ran without `-b`. */
  readonly upstream: UpstreamState | null;
}

function shortUpstream(branch: ShortBranch): UpstreamState | null {
  if (branch.upstreamGone === true) return 'gone';
  if (branch.upstream === undefined) return null;
  const ahead = branch.ahead ?? 0;
  const behind = branch.behind ?? 0;
  if (ahead > 0 && behind > 0) return 'diverged';
  if (ahead > 0) return 'ahead';
  return behind > 0 ? 'behind' : 'up-to-date';
}

/**
 * The branch and upstream state from either status format. A clean tree alone can't say a
 * PR landed: a feature branch is clean too, and so is a main nobody pulled. This can.
 */
export function statusPosition(status: ParsedStatus): StatusPosition {
  if (status.format === 'long') {
    return { branch: status.branch, upstream: status.upstream?.state ?? null };
  }
  const { branch } = status;
  if (branch === null) return { branch: null, upstream: null };
  return {
    branch: branch.detached ? null : branch.name,
    upstream: shortUpstream(branch),
  };
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
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  // .env.local, .env.production, and friends hold real values too.
  if (name.startsWith('.env.')) return !ENV_TEMPLATES.has(name);
  return SECRET_NAMES.has(name) || SECRET_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/**
 * Secret files that git tracks, or will after the next commit. A status only lists
 * files that changed, so an untouched tracked `.env` won't show there. Pass a
 * `git ls-files` paste through parsePathList to check every tracked file.
 */
export function trackedSecretPaths(source: PathSource): string[] {
  return [...new Set(trackedPaths(source).filter(isSecretPath))];
}

// ---- Build output ----------------------------------------------------------------------

// Folders that tools regenerate on every build or install. They belong in .gitignore.
/** Folders that hold generated files: rebuilt from source, so never committed. */
export const BUILD_OUTPUT_FOLDERS: readonly string[] = [
  'dist',
  'build',
  'node_modules',
  'coverage',
];

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
