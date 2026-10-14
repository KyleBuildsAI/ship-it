import type { GraphCommit } from './logOneline';
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

/** The Conventional Commit types, as the convention writes them: lowercase. */
export const CONVENTIONAL_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
  'revert',
] as const;
export type ConventionalType = (typeof CONVENTIONAL_TYPES)[number];

// type, an optional (scope), an optional "!" marking a breaking change, then ": " and a
// description that starts right away. Types are lowercase, as the convention writes them.
const CONVENTIONAL_SUBJECT = new RegExp(
  `^(${CONVENTIONAL_TYPES.join('|')})(?:\\([^()\\s][^()]*\\))?!?: \\S`,
);

// Subjects git or GitHub write on their own: merges, and `git revert`'s default message.
const GENERATED_SUBJECT =
  /^(?:Merge (?:branch|branches|remote-tracking branch|tag|commit|pull request) |Revert ")/;

/** True for a Conventional Commit subject like `feat(parser): read quoted paths`. */
export function isConventionalSubject(subject: string): boolean {
  return CONVENTIONAL_SUBJECT.test(subject);
}

/** The type of a Conventional Commit subject, like `docs`, or null for any other subject. */
export function commitType(subject: string): ConventionalType | null {
  const type = CONVENTIONAL_SUBJECT.exec(subject)?.[1];
  return CONVENTIONAL_TYPES.find((known) => known === type) ?? null;
}

/**
 * The newest commit someone wrote, skipping merges and reverts git named itself, so
 * pulling a merged pull request doesn't hide the commit underneath it.
 */
export function newestWrittenCommit<T extends { readonly subject: string }>(
  commits: readonly T[],
): T | null {
  return commits.find((commit) => !isGeneratedSubject(commit.subject)) ?? null;
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
 *
 * With `types`, only those types count, so a check can insist on `ci:` for a change that
 * only touched CI, and an older `fix:` on the same files doesn't pass for it.
 */
export function conventionalRatio(
  commits: readonly { readonly subject: string }[],
  types?: readonly ConventionalType[],
): number {
  const written = commits.filter((commit) => !isGeneratedSubject(commit.subject));
  if (written.length === 0) return 0;
  const conventional = written.filter((commit) => {
    const type = commitType(commit.subject);
    return type !== null && (types === undefined || types.includes(type));
  });
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

/**
 * How many local commits haven't reached the remote branch yet, as of the last push or
 * fetch. Null when the paste can't say: no upstream is set, it was deleted, or a short
 * status was run without -b, which leaves the branch line out.
 */
export function unpushedCommits(status: ParsedStatus): number | null {
  if (status.format === 'short') {
    const { branch } = status;
    if (branch?.upstream === undefined || branch.upstreamGone === true) return null;
    return branch.ahead ?? 0;
  }
  if (status.upstream === null || status.upstream.state === 'gone') return null;
  return status.upstream.ahead;
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

/**
 * The first of `wanted` that a `git ls-files` list tracks, or null. Windows treats
 * CLAUDE.md and claude.md as one file, so case doesn't matter.
 */
export function firstTracked(paths: readonly string[], wanted: readonly string[]): string | null {
  const tracked = new Set(paths.map((path) => path.toLowerCase()));
  return wanted.find((path) => tracked.has(path.toLowerCase())) ?? null;
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

// ---- Merges ----------------------------------------------------------------------------

// The branch a merge subject names, in the forms git and GitHub write: `Merge pull request
// #3 from owner/feat/x`, `Merge branch 'feat/x'` (maybe `into main`), and `Merge
// remote-tracking branch 'origin/feat/x'`.
const PULL_REQUEST_MERGE = /^Merge pull request #\d+ from [^/\s]+\/(\S+)/;
const BRANCH_MERGE = /^Merge branch '([^']+)'/;
const REMOTE_BRANCH_MERGE = /^Merge remote-tracking branch '[^/']+\/([^']+)'/;

// A branch named for the kind of change it holds, the way Conventional Commits name types.
const TYPED_BRANCH =
  /^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/** The branch a merge commit's subject says it merged, or null if it names none. */
export function mergedBranchName(subject: string): string | null {
  for (const pattern of [PULL_REQUEST_MERGE, BRANCH_MERGE, REMOTE_BRANCH_MERGE]) {
    const name = pattern.exec(subject)?.[1];
    if (name !== undefined) return name;
  }
  return null;
}

/** True for a branch name like `feat/readme-fix`: a type, a slash, then a short name. */
export function isTypedBranchName(name: string): boolean {
  return TYPED_BRANCH.test(name);
}

/** What the newest commit in a `git log --oneline --graph` paste says about a merge. */
export type TopMerge =
  | { readonly kind: 'empty' }
  /** The newest commit isn't a merge: a direct commit, a squash, or a rebase. */
  | { readonly kind: 'not-a-merge'; readonly subject: string }
  /** A merge, but the paste has no graph, so its branch's commits can't be told apart. */
  | { readonly kind: 'no-graph'; readonly branch: string | null }
  /** A merge whose branch brought in no commit the paste shows. */
  | { readonly kind: 'no-branch-commit'; readonly branch: string | null }
  | {
      readonly kind: 'merged';
      /** The merged branch's name from the subject, or null when the subject names none. */
      readonly branch: string | null;
      /** The newest commit on the merged branch: the merge's second parent. */
      readonly branchCommit: GraphCommit;
    };

/**
 * Reads the newest commit of a graph paste as a merge. Only the newest counts, so an old
 * merge further down can't pass for new work. In git's drawing a merge's first parent stays
 * in the merge's own column and the branch it brought in gets a lane to the right, so the
 * first commit drawn right of column 0 is the branch's newest commit.
 */
export function readTopMerge(commits: readonly GraphCommit[]): TopMerge {
  const [top, ...rest] = commits;
  if (top === undefined) return { kind: 'empty' };
  if (!isGeneratedSubject(top.subject) || top.subject.startsWith('Revert "')) {
    return { kind: 'not-a-merge', subject: top.subject };
  }
  const branch = mergedBranchName(top.subject);
  const mainColumn = top.column;
  if (mainColumn === null) return { kind: 'no-graph', branch };
  const branchCommit = rest.find((commit) => commit.column !== null && commit.column > mainColumn);
  return branchCommit === undefined
    ? { kind: 'no-branch-commit', branch }
    : { kind: 'merged', branch, branchCommit };
}
