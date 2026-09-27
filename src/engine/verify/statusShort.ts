import { normalizePaste } from './normalize';
import { splitRename, unquotePath } from './quoting';

/** The `## main...origin/main [ahead 2]` line that `git status -sb` prints first. */
export interface ShortBranch {
  /** The branch name, or `HEAD` when HEAD is detached. */
  readonly name: string;
  readonly detached: boolean;
  /** True on a branch with no commits yet, right after `git init`. */
  readonly noCommitsYet: boolean;
  /** The remote branch this one tracks, like `origin/main`. */
  readonly upstream?: string;
  /** Commits here that the upstream doesn't have yet (waiting to be pushed). */
  readonly ahead?: number;
  /** Commits on the upstream that aren't here yet (waiting to be pulled). */
  readonly behind?: number;
  /** True when the upstream branch was deleted on the remote, shown as `[gone]`. */
  readonly upstreamGone?: boolean;
}

/**
 * One file line. Each column holds one letter: ' ' unchanged, M modified, T type changed,
 * A added, D deleted, R renamed, C copied, U unmerged (a conflict), ? untracked, ! ignored.
 */
export interface ShortEntry {
  /** Column X: the file's state in the staging area, compared with the last commit. */
  readonly index: string;
  /** Column Y: the file's state in the working tree, compared with the staging area. */
  readonly worktree: string;
  readonly path: string;
  /** For a rename or copy, the name the file had before. */
  readonly originalPath?: string;
}

export interface ParsedStatusShort {
  readonly format: 'short';
  /** Null unless the output came from `-b` / `--branch` (as in `git status -sb`). */
  readonly branch: ShortBranch | null;
  readonly entries: readonly ShortEntry[];
  /** Lines that fit neither a branch header nor a file line. */
  readonly warnings: readonly string[];
}

const STATUS_CODES = ' MTADRCU?!';
const ENTRY = /^(.)(.) (.+)$/;
// "No commits yet on" is git 2.17+; older versions said "Initial commit on".
const BRANCH_HEADER =
  /^## (No commits yet on |Initial commit on )?(.+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/;
const DETACHED_NAME = 'HEAD (no branch)';
const TRACKING_COUNT = /^(ahead|behind) (\d+)$/;

interface Tracking {
  ahead?: number;
  behind?: number;
  upstreamGone?: boolean;
}

/** Reads the `[ahead 2, behind 1]` part of a branch header. Null if any part is unknown. */
function readTracking(text: string): Tracking | null {
  if (text === 'gone') return { upstreamGone: true };
  const tracking: Tracking = {};
  for (const part of text.split(', ')) {
    const match = TRACKING_COUNT.exec(part);
    if (!match) return null;
    tracking[match[1] === 'ahead' ? 'ahead' : 'behind'] = Number(match[2]);
  }
  return tracking;
}

/** Parses a `## ...` branch header line, or returns null if `line` isn't one. */
export function parseShortBranch(line: string): ShortBranch | null {
  const match = BRANCH_HEADER.exec(line);
  if (!match) return null;
  const [, unborn, name = '', upstream, tracking] = match;
  const counts = tracking === undefined ? {} : readTracking(tracking);
  if (counts === null) return null;
  const detached = name === DETACHED_NAME;
  return {
    name: detached ? 'HEAD' : name,
    detached,
    noCommitsYet: unborn !== undefined,
    // Spread so a missing upstream leaves the key out entirely, instead of `upstream: undefined`.
    ...(upstream === undefined ? {} : { upstream }),
    ...counts,
  };
}

function isValidPair(index: string, worktree: string): boolean {
  if (!STATUS_CODES.includes(index) || !STATUS_CODES.includes(worktree)) return false;
  // "??" and "!!" always come as a pair, and a file with no change on either side is never listed.
  if (index === '?' || worktree === '?' || index === '!' || worktree === '!') {
    return index === worktree;
  }
  return !(index === ' ' && worktree === ' ');
}

/** Parses one `XY path` line, or returns null if `line` isn't one. */
export function parseShortEntry(line: string): ShortEntry | null {
  const match = ENTRY.exec(line);
  if (!match) return null;
  const [, index = '', worktree = '', rest = ''] = match;
  if (!isValidPair(index, worktree)) return null;

  // Only renames and copies use the "old -> new" form. Any other path is one name, even
  // if it happens to contain an arrow.
  const renamed = 'RC'.includes(index) || 'RC'.includes(worktree);
  const pair = renamed ? splitRename(rest) : null;
  if (pair) return { index, worktree, path: pair.to, originalPath: pair.from };
  return { index, worktree, path: unquotePath(rest) };
}

/**
 * Parses the output of `git status --short`, `git status -sb`, or `git status --porcelain`
 * (with or without `-b`). Pasted terminal noise is removed first; see normalizePaste.
 */
export function parseStatusShort(text: string): ParsedStatusShort {
  const lines = normalizePaste(text).lines;
  // Git prints the branch header only once, as the very first line.
  const branch = lines[0] === undefined ? null : parseShortBranch(lines[0]);
  const entries: ShortEntry[] = [];
  const warnings: string[] = [];

  for (const line of branch === null ? lines : lines.slice(1)) {
    const entry = parseShortEntry(line);
    if (entry) entries.push(entry);
    else if (line.trim() !== '') warnings.push(line);
  }
  return { format: 'short', branch, entries, warnings };
}
