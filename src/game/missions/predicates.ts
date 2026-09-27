import type { GitQueries } from '../../engine/git/queries';
import type { Commit } from '../../engine/git/types';

/**
 * The mission success language. A predicate is plain data that describes a state of the
 * sandbox ("app.ts is staged", "the tree is clean"), never the commands used to get
 * there, so any valid path to the target state passes (DESIGN.md pillar 3).
 *
 * Every kind accepts an optional `label`. It replaces the generated description in the
 * objective checklist, for checks whose plain-English form would be too technical to
 * show a player, like a long regular expression.
 */
export type Predicate =
  | { kind: 'isRepo'; label?: string }
  /** Nothing staged, no unstaged edits, no untracked files. Ignored files don't count. */
  | { kind: 'clean'; label?: string }
  /**
   * Every path has a staged change. With `exact`, nothing else is staged. A staged
   * rename is a change to both names: the old one is deleted, the new one added.
   */
  | { kind: 'staged'; paths: string[]; exact?: boolean; label?: string }
  | { kind: 'notStaged'; paths: string[]; label?: string }
  /** Every path is new to git and not ignored. Ignored files are what `ignored` checks. */
  | { kind: 'untracked'; paths: string[]; label?: string }
  /** Every path is in the HEAD commit. */
  | { kind: 'tracked'; paths: string[]; label?: string }
  /** No path is in the HEAD commit. */
  | { kind: 'notTracked'; paths: string[]; label?: string }
  /** Every path exists on disk and a .gitignore rule hides it. */
  | { kind: 'ignored'; paths: string[]; label?: string }
  /** Every path has edits (or a deletion) that aren't staged yet. */
  | { kind: 'modified'; paths: string[]; label?: string }
  /**
   * Commits in HEAD's history, following first parents only, so commits that arrived
   * from the other side of a merge aren't counted. Give `equals`, or `min` and/or `max`.
   */
  | { kind: 'commitCount'; min?: number; max?: number; equals?: number; label?: string }
  | { kind: 'headMessage'; pattern: string; flags?: string; label?: string }
  /** Every commit message matches, or only the newest `last` of them. */
  | { kind: 'allMessagesMatch'; pattern: string; flags?: string; last?: number; label?: string }
  /** The file is in the HEAD commit, optionally with exact or partial content. */
  | { kind: 'fileAtHead'; path: string; equals?: string; contains?: string; label?: string }
  /** The file on disk. `exists: false` means it must be gone. */
  | {
      kind: 'workingFile';
      path: string;
      equals?: string;
      contains?: string;
      exists?: boolean;
      label?: string;
    }
  /**
   * The commit at `ref` (HEAD when omitted) changed every path, compared with its first
   * parent. With `only`, it changed nothing else.
   */
  | { kind: 'commitChanged'; ref?: string; paths: string[]; only?: boolean; label?: string }
  | { kind: 'reflogContains'; pattern: string; flags?: string; label?: string }
  /**
   * HEAD is on the commit with this message. Used to check "you went back to X" after a
   * reset. Comparing with a reflog position like HEAD@{2} would not work, because every
   * command the player runs shifts those positions.
   */
  | { kind: 'headMessageIs'; message: string; label?: string }
  | { kind: 'all'; of: Predicate[]; label?: string }
  | { kind: 'any'; of: Predicate[]; label?: string }
  | { kind: 'not'; predicate: Predicate; label?: string };

export type PredicateKind = Predicate['kind'];

/** One row of the objective checklist a mission shows beside the terminal. */
export interface CheckRow {
  readonly label: string;
  readonly passed: boolean;
  /** Present for `all` and `any` rows, so the UI can show what's inside. */
  readonly children?: readonly CheckRow[];
}

// ---- Evaluation -------------------------------------------------------------------

function everyIn(paths: readonly string[], list: readonly string[]): boolean {
  const present = new Set(list);
  return paths.every((path) => present.has(path));
}

function noneIn(paths: readonly string[], list: readonly string[]): boolean {
  const present = new Set(list);
  return !paths.some((path) => present.has(path));
}

function sameSet(paths: readonly string[], list: readonly string[]): boolean {
  const wanted = new Set(paths);
  const actual = new Set(list);
  return wanted.size === actual.size && [...wanted].every((path) => actual.has(path));
}

/**
 * Every path whose staged version differs from HEAD. `stagedPaths()` lists a rename
 * once, under its new name, so after `git mv b.ts c.ts` it would say b.ts has nothing
 * staged, when in fact its deletion is. Adding the old name back fixes that.
 */
function stagedChangePaths(q: GitQueries): string[] {
  const { staged } = q.status();
  return staged.flatMap((change) =>
    change.kind === 'renamed' ? [change.path, change.from] : [change.path],
  );
}

function matches(text: string, pattern: string, flags = ''): boolean {
  return new RegExp(pattern, flags).test(text);
}

function contentMatches(
  content: string | null,
  expected: { equals?: string; contains?: string },
): boolean {
  if (content === null) return false;
  if (expected.equals !== undefined && content !== expected.equals) return false;
  if (expected.contains !== undefined && !content.includes(expected.contains)) return false;
  return true;
}

function countMatches(count: number, bounds: { min?: number; max?: number; equals?: number }) {
  if (bounds.equals !== undefined && count !== bounds.equals) return false;
  if (bounds.min !== undefined && count < bounds.min) return false;
  if (bounds.max !== undefined && count > bounds.max) return false;
  return true;
}

/**
 * Paths whose content differs between a commit and its first parent, including files
 * added or deleted. Commits store every file's blob id, and equal ids mean equal
 * content, so comparing ids is enough.
 */
export function changedPaths(commit: Commit, parent: Commit | undefined): string[] {
  const before = parent?.files ?? new Map<string, string>();
  const changed = new Set<string>();
  for (const [path, id] of commit.files) {
    if (before.get(path) !== id) changed.add(path);
  }
  for (const path of before.keys()) {
    if (!commit.files.has(path)) changed.add(path);
  }
  return [...changed].sort();
}

function commitChanged(q: GitQueries, ref: string, paths: string[], only: boolean): boolean {
  // log() walks first parents, so the second entry is exactly the parent to compare with.
  const [commit, parent] = q.log(ref);
  if (commit === undefined) return false;
  const changed = changedPaths(commit, parent);
  return only ? sameSet(paths, changed) : everyIn(paths, changed);
}

function allMessagesMatch(q: GitQueries, pattern: string, flags?: string, last?: number) {
  const history = q.log();
  // "The last 3 messages match" can't be true of a history with fewer than 3 commits.
  if (history.length === 0 || (last !== undefined && history.length < last)) return false;
  const checked = last === undefined ? history : history.slice(0, last);
  return checked.every((commit) => matches(commit.message, pattern, flags));
}

/** Is the predicate true of the sandbox right now? */
export function evaluate(predicate: Predicate, q: GitQueries): boolean {
  switch (predicate.kind) {
    case 'isRepo':
      return q.isRepo();
    case 'clean':
      // An empty folder with no repository isn't "clean": there is no tree to be clean.
      return q.isRepo() && q.isClean();
    case 'staged':
      return predicate.exact === true
        ? sameSet(predicate.paths, stagedChangePaths(q))
        : everyIn(predicate.paths, stagedChangePaths(q));
    case 'notStaged':
      return noneIn(predicate.paths, stagedChangePaths(q));
    case 'untracked':
      return everyIn(predicate.paths, q.untrackedPaths());
    case 'tracked':
      return everyIn(predicate.paths, q.trackedPaths());
    case 'notTracked':
      return noneIn(predicate.paths, q.trackedPaths());
    case 'ignored':
      return everyIn(predicate.paths, q.ignoredPaths());
    case 'modified':
      return everyIn(predicate.paths, q.modifiedPaths());
    case 'commitCount':
      return countMatches(q.log().length, predicate);
    case 'headMessage': {
      const head = q.headCommit();
      return head !== null && matches(head.message, predicate.pattern, predicate.flags);
    }
    case 'allMessagesMatch':
      return allMessagesMatch(q, predicate.pattern, predicate.flags, predicate.last);
    case 'fileAtHead':
      return contentMatches(q.fileAt('HEAD', predicate.path), predicate);
    case 'workingFile': {
      const content = q.workingFile(predicate.path);
      if (predicate.exists === false) return content === null;
      return contentMatches(content, predicate);
    }
    case 'commitChanged':
      return commitChanged(q, predicate.ref ?? 'HEAD', predicate.paths, predicate.only === true);
    case 'reflogContains':
      return q.reflog().some((entry) => matches(entry.message, predicate.pattern, predicate.flags));
    case 'headMessageIs':
      // Trimmed so a trailing newline from an editor doesn't fail an otherwise exact match.
      return q.headCommit()?.message.trim() === predicate.message.trim();
    case 'all':
      return predicate.of.every((child) => evaluate(child, q));
    case 'any':
      return predicate.of.some((child) => evaluate(child, q));
    case 'not':
      return !evaluate(predicate.predicate, q);
  }
}

// ---- Plain-English descriptions ---------------------------------------------------

const listFormat = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

/** "app.ts is" / "app.ts and README.md are": the subject and verb agree with the count. */
function subject(paths: readonly string[], singular: string, plural: string): string {
  return `${listFormat.format(paths)} ${paths.length === 1 ? singular : plural}`;
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function regexText(pattern: string, flags = ''): string {
  return `/${pattern}/${flags}`;
}

function describeCount(bounds: { min?: number; max?: number; equals?: number }): string {
  const { min, max, equals } = bounds;
  if (equals !== undefined) return `Exactly ${plural(equals, 'commit')}`;
  if (min !== undefined && max !== undefined) {
    return `Between ${String(min)} and ${plural(max, 'commit')}`;
  }
  if (min !== undefined) return `At least ${plural(min, 'commit')}`;
  return `At most ${plural(max ?? 0, 'commit')}`;
}

function describeContent(
  where: string,
  expected: { equals?: string; contains?: string },
  fallback: string,
): string {
  if (expected.equals !== undefined) return `${where} has the expected content`;
  if (expected.contains !== undefined) return `${where} contains "${expected.contains}"`;
  return fallback;
}

function commitName(ref: string | undefined): string {
  return ref === undefined || ref === 'HEAD' ? 'The latest commit' : `Commit ${ref}`;
}

/** A short plain-English sentence for the objective checklist, e.g. "Working tree is clean". */
export function describe(predicate: Predicate): string {
  if (predicate.label !== undefined) return predicate.label;
  switch (predicate.kind) {
    case 'isRepo':
      return 'This folder is a git repository';
    case 'clean':
      return 'Working tree is clean';
    case 'staged':
      return predicate.exact === true
        ? `Only ${subject(predicate.paths, 'is', 'are')} staged`
        : `${subject(predicate.paths, 'is', 'are')} staged`;
    case 'notStaged':
      return `${subject(predicate.paths, 'is', 'are')} not staged`;
    case 'untracked':
      return `${subject(predicate.paths, 'is', 'are')} untracked`;
    case 'tracked':
      return `${subject(predicate.paths, 'is', 'are')} tracked`;
    case 'notTracked':
      return `${subject(predicate.paths, 'is', 'are')} not tracked`;
    case 'ignored':
      return `${subject(predicate.paths, 'is', 'are')} ignored`;
    case 'modified':
      return `${subject(predicate.paths, 'has', 'have')} unstaged edits`;
    case 'commitCount':
      return describeCount(predicate);
    case 'headMessage':
      return `The latest commit message matches ${regexText(predicate.pattern, predicate.flags)}`;
    case 'allMessagesMatch': {
      const regex = regexText(predicate.pattern, predicate.flags);
      if (predicate.last === undefined) return `Every commit message matches ${regex}`;
      if (predicate.last === 1) return `The latest commit message matches ${regex}`;
      return `The last ${String(predicate.last)} commit messages match ${regex}`;
    }
    case 'fileAtHead':
      return describeContent(
        `Committed ${predicate.path}`,
        predicate,
        `${predicate.path} is committed`,
      );
    case 'workingFile':
      if (predicate.exists === false) return `${predicate.path} does not exist`;
      return describeContent(predicate.path, predicate, `${predicate.path} exists`);
    case 'commitChanged':
      return `${commitName(predicate.ref)} changes ${predicate.only === true ? 'only ' : ''}${listFormat.format(predicate.paths)}`;
    case 'reflogContains':
      return `The reflog has an entry matching ${regexText(predicate.pattern, predicate.flags)}`;
    case 'headMessageIs':
      return `HEAD is on the commit "${predicate.message}"`;
    case 'all':
      return 'All of these are true';
    case 'any':
      return 'At least one of these is true';
    case 'not':
      return `Not true: ${describe(predicate.predicate)}`;
  }
}

// ---- Objective checklist ----------------------------------------------------------

function explainOne(predicate: Predicate, q: GitQueries): CheckRow {
  const row = { label: describe(predicate), passed: evaluate(predicate, q) };
  if (predicate.kind === 'all' || predicate.kind === 'any') {
    return { ...row, children: predicate.of.map((child) => explainOne(child, q)) };
  }
  return row;
}

/**
 * The objective checklist for a predicate: one row per objective, each ticked or not.
 * An unlabelled `all` at the top is how missions list several objectives, so each of its
 * children becomes its own row instead of one "All of these are true" row.
 */
export function explain(predicate: Predicate, q: GitQueries): CheckRow[] {
  if (predicate.kind === 'all' && predicate.label === undefined) {
    return predicate.of.map((child) => explainOne(child, q));
  }
  return [explainOne(predicate, q)];
}
