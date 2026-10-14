import type { Workspace } from '../workspace';
import type { Commit, FileSnapshot, ObjectId } from './types';

/**
 * One thing a git command changed, in the Git World's terms: the Workbench (the project
 * folder), the Loading Dock (the index) and the Vault (the commits). The approval card
 * words these for Kyle, and the gate weighs them, the way a laptop's MachineChange is
 * weighed. A change names files and commits, never file contents.
 */
export type GitChange =
  /** `git init`: the project gets a Loading Dock and a Vault. */
  | { readonly kind: 'repoCreated' }
  | {
      readonly kind: 'workbench';
      readonly path: string;
      readonly how: 'created' | 'changed' | 'deleted';
      /**
       * The file held edits that neither the Loading Dock nor the last commit had, and
       * they are gone now: nothing in git can bring them back.
       */
      readonly unsaved: boolean;
    }
  | {
      readonly kind: 'dock';
      readonly path: string;
      /** loaded: the path's change now waits on the dock; unloaded: it left without a commit. */
      readonly how: 'loaded' | 'unloaded';
    }
  /** A new commit sealed into the Vault. */
  | {
      readonly kind: 'sealed';
      readonly id: ObjectId;
      readonly message: string;
      /** How many files it changed against its first parent. */
      readonly files: number;
      readonly branch: string | null;
    }
  /** Commits that were in HEAD's history and aren't now, like after `git reset HEAD~1`. */
  | {
      readonly kind: 'dropped';
      readonly branch: string | null;
      /** Newest first. */
      readonly commits: readonly { readonly id: ObjectId; readonly message: string }[];
    };

/**
 * A frozen copy of the git side of a sandbox: what a command can change. It keeps file
 * contents, so it stays inside the engine; only diffGitSnapshots' changes go out.
 */
export interface GitSnapshot {
  readonly repo: boolean;
  /** Workbench files and their contents. Empty on a laptop, whose drive is diffed instead. */
  readonly files: ReadonlyMap<string, string>;
  /** Workbench paths whose content no commit or dock holds: edits git can't bring back. */
  readonly unsaved: ReadonlySet<string>;
  /** The index entry of every path whose dock differs from HEAD: null for a staged delete. */
  readonly staged: ReadonlyMap<string, ObjectId | null>;
  readonly branch: string | null;
  /** HEAD's first-parent history, newest first. */
  readonly history: readonly Commit[];
  /** Every commit in the Vault, so a new one can be told from an old one HEAD returned to. */
  readonly known: ReadonlySet<ObjectId>;
}

/**
 * Snapshots git's view of a sandbox. `withFiles` false leaves the Workbench out: a laptop's
 * files are compared by the machine's own snapshot, and listing them twice would show one
 * change as two.
 */
export function snapshotGit(ws: Workspace, withFiles = true): GitSnapshot {
  const repo = ws.repo;
  const files = new Map<string, string>();
  if (withFiles) for (const path of ws.fs.allFiles()) files.set(path, ws.fs.readFile(path));
  if (repo === null) {
    return {
      repo: false,
      files,
      unsaved: new Set(files.keys()),
      staged: new Map(),
      branch: null,
      history: [],
      known: new Set(),
    };
  }
  const index = repo.indexEntries();
  const head = repo.headFiles();
  const unsaved = [...files]
    .filter(([path, content]) => !holds(repo.idFor(content), path, index, head))
    .map(([path]) => path);
  return {
    repo: true,
    files,
    unsaved: new Set(unsaved),
    staged: stagedEntries(index, head),
    branch: repo.currentBranch(),
    history: firstParents(repo.headCommit(), (id) => repo.getCommit(id)),
    known: new Set(repo.allCommitIds()),
  };
}

/** Whether the dock or the last commit already holds this exact content for the path. */
function holds(id: ObjectId, path: string, index: FileSnapshot, head: FileSnapshot): boolean {
  return index.get(path) === id || head.get(path) === id;
}

function stagedEntries(index: FileSnapshot, head: FileSnapshot): Map<string, ObjectId | null> {
  const staged = new Map<string, ObjectId | null>();
  for (const path of new Set([...index.keys(), ...head.keys()])) {
    const entry = index.get(path);
    if (entry !== head.get(path)) staged.set(path, entry ?? null);
  }
  return staged;
}

function firstParents(
  start: Commit | null,
  lookup: (id: ObjectId) => Commit | undefined,
): Commit[] {
  const commits: Commit[] = [];
  for (let commit = start; commit !== null;) {
    commits.push(commit);
    const parent = commit.parents[0];
    commit = parent === undefined ? null : (lookup(parent) ?? null);
  }
  return commits;
}

/**
 * What changed between two snapshots, in the order Kyle reads it: the Vault, then the
 * Loading Dock, then the Workbench, as a commit would carry crates down the line.
 */
export function diffGitSnapshots(before: GitSnapshot, after: GitSnapshot): GitChange[] {
  const created: GitChange[] = !before.repo && after.repo ? [{ kind: 'repoCreated' }] : [];
  return [
    ...created,
    ...vaultChanges(before, after),
    ...dockChanges(before, after),
    ...workbenchChanges(before, after),
  ];
}

function vaultChanges(before: GitSnapshot, after: GitSnapshot): GitChange[] {
  const kept = new Set(after.history.map((commit) => commit.id));
  const dropped = before.history
    .filter((commit) => !kept.has(commit.id))
    .map(({ id, message }) => ({ id, message }));
  const changes: GitChange[] =
    dropped.length === 0 ? [] : [{ kind: 'dropped', branch: before.branch, commits: dropped }];
  // Oldest first, so a command that seals two commits lists them in the order they were made.
  const sealed = after.history.filter((commit) => !before.known.has(commit.id)).reverse();
  for (const commit of sealed) {
    const parent = commit.parents[0];
    const parentFiles = after.history.find((older) => older.id === parent)?.files;
    changes.push({
      kind: 'sealed',
      id: commit.id,
      message: commit.message,
      files: changedPaths(parentFiles ?? new Map(), commit.files),
      branch: after.branch,
    });
  }
  return changes;
}

function changedPaths(older: FileSnapshot, newer: FileSnapshot): number {
  const paths = new Set([...older.keys(), ...newer.keys()]);
  return [...paths].filter((path) => older.get(path) !== newer.get(path)).length;
}

/**
 * A path is loaded when its change is waiting on the dock now and wasn't, or a different
 * version of it is. It is unloaded when it left the dock because the dock itself changed,
 * as `git restore --staged` does. A commit also empties the dock, but there the dock is
 * untouched and HEAD caught up, so those paths went into the Vault, not back.
 */
function dockChanges(before: GitSnapshot, after: GitSnapshot): GitChange[] {
  const changes: GitChange[] = [];
  for (const [path, entry] of after.staged) {
    if (!before.staged.has(path) || before.staged.get(path) !== entry) {
      changes.push({ kind: 'dock', path, how: 'loaded' });
    }
  }
  for (const [path, entry] of before.staged) {
    if (after.staged.has(path)) continue;
    const sealedAsIs = after.history[0]?.files.get(path) === (entry ?? undefined);
    if (!sealedAsIs) changes.push({ kind: 'dock', path, how: 'unloaded' });
  }
  return changes;
}

function workbenchChanges(before: GitSnapshot, after: GitSnapshot): GitChange[] {
  const changes: GitChange[] = [];
  for (const [path, content] of after.files) {
    const old = before.files.get(path);
    if (old === undefined)
      changes.push({ kind: 'workbench', path, how: 'created', unsaved: false });
    else if (old !== content) {
      changes.push({ kind: 'workbench', path, how: 'changed', unsaved: before.unsaved.has(path) });
    }
  }
  for (const path of before.files.keys()) {
    if (!after.files.has(path)) {
      changes.push({ kind: 'workbench', path, how: 'deleted', unsaved: before.unsaved.has(path) });
    }
  }
  return changes;
}
