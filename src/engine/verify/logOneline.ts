import { normalizePaste } from './normalize';

/** One commit from `git log --oneline`. */
export interface OnelineCommit {
  /** The abbreviated commit hash, like `501437f`. */
  readonly hash: string;
  /** The labels git printed in parentheses: `HEAD -> main`, `origin/main`, `tag: v1.0`. */
  readonly refs: readonly string[];
  /** The first line of the commit message. */
  readonly subject: string;
}

// `--graph` draws history to the left of each line with these characters. An octopus
// merge adds "-" and "." to the usual "*", "|", "/", "\", and spaces.
const GRAPH_PREFIX = /^[*|/\\_ .-]*/;

// A hash, then optional (decorations), then the subject. Git abbreviates hashes to at
// least 7 characters by default (4 is the lowest core.abbrev allows), and repositories
// that use SHA-256 have 64-character hashes.
const COMMIT_LINE = /^([0-9a-f]{4,64})(?: \(([^)]*)\))?(?: (.*))?$/;

/**
 * Reads one line of `git log --oneline` output, with or without `--graph` and
 * `--decorate`. Returns the commit, `'graph'` for a line that only draws the graph (like
 * `|\` or `|/`), or null for anything else.
 *
 * One limit: a subject that starts with "(" on a commit with no decorations, like
 * `abc1234 (wip) fix`, reads as if "wip" were a ref. Plain text can't tell them apart.
 */
export function parseOnelineLine(line: string): OnelineCommit | 'graph' | null {
  const rest = line.replace(GRAPH_PREFIX, '');
  const prefix = line.slice(0, line.length - rest.length);
  if (rest === '') return prefix.trim() === '' ? null : 'graph';
  // With --graph, every commit line has a "*" marking the commit. Without it, no prefix.
  if (prefix !== '' && !prefix.includes('*')) return null;

  const match = COMMIT_LINE.exec(rest);
  if (!match) return null;
  const [, hash = '', decorations = '', subject = ''] = match;
  const refs = decorations
    .split(',')
    .map((ref) => ref.trim())
    .filter((ref) => ref !== '');
  return { hash, refs, subject };
}

/** A commit from `git log --oneline --graph`, with where its "*" sits in the drawing. */
export interface GraphCommit extends OnelineCommit {
  /**
   * The column of the "*" that marks this commit, or null when the paste had no graph.
   * Column 0 is the line main followed (a merge's first parent); a "*" further right sits
   * on a lane that joined it, like the branch a merge brought in.
   */
  readonly column: number | null;
}

/**
 * Parses `git log --oneline` output like parseLogOneline, but keeps each commit's place in
 * the `--graph` drawing, so a check can tell a merged branch's commits from main's own.
 */
export function parseLogGraph(text: string): GraphCommit[] {
  const commits: GraphCommit[] = [];
  for (const line of normalizePaste(text).lines) {
    const parsed = parseOnelineLine(line);
    if (parsed === null || parsed === 'graph') continue;
    // parseOnelineLine only accepts a graph prefix that holds a "*", so a line with any
    // prefix at all has one, and a line with none came from a paste without --graph.
    const hasGraph = GRAPH_PREFIX.exec(line)?.[0] !== '';
    commits.push({ ...parsed, column: hasGraph ? line.indexOf('*') : null });
  }
  return commits;
}

/**
 * Parses `git log --oneline` output into commits, newest first, the order git prints them.
 * Graph drawing, blank lines, and anything that isn't a commit line are skipped.
 */
export function parseLogOneline(text: string): OnelineCommit[] {
  const commits: OnelineCommit[] = [];
  for (const line of normalizePaste(text).lines) {
    const parsed = parseOnelineLine(line);
    if (parsed !== null && parsed !== 'graph') commits.push(parsed);
  }
  return commits;
}
