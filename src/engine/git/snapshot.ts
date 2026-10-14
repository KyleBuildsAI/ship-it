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
       * The version the command replaced or deleted is gone from git too: no commit held
       * it, and the Loading Dock doesn't now, so nothing can bring it back. False when a
       * commit or the dock still has it, which is why a rewrite like that loses nothing.
       */
      readonly unsaved: boolean;
    }
  | {
      readonly kind: 'dock';
      readonly path: string;
      /**
       * loaded: the path's new content now waits on the dock. removed: its deletion does,
       * so the next commit drops the file (`git rm`, `git rm --cached`). unloaded: its
       * change left the dock without a commit, and the Workbench or a commit still holds
       * that version. discarded: it left, and nothing does any more, like a staged edit
       * under `git reset --hard`: it is lost. A removal is its own case because "onto the
       * dock" would tell Kyle the file is going into the next commit, the opposite.
       */
      readonly how: 'loaded' | 'removed' | 'unloaded' | 'discarded';
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
  /** The object id of every Workbench file's content, to tell whether git still holds it. */
  readonly ids: ReadonlyMap<string, ObjectId>;
  /** The index entry of every path whose dock differs from HEAD: null for a staged delete. */
  readonly staged: ReadonlyMap<string, ObjectId | null>;
  readonly branch: string | null;
  /** HEAD's first-parent history, newest first. */
  readonly history: readonly Commit[];
  /** Every commit in the Vault, so a new one can be told from an old one HEAD returned to. */
  readonly known: ReadonlySet<ObjectId>;
  /**
   * Every file version git can still hand back: on the dock, in any commit, or on the
   * Workbench at a tracked path. A version that left the dock and isn't here was lost.
   */
  readonly held: ReadonlySet<ObjectId>;
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
      // No repository holds anything, so every Workbench file is unsaved.
      ids: new Map(),
      staged: new Map(),
      branch: null,
      history: [],
      known: new Set(),
      held: new Set(),
    };
  }
  const index = repo.indexEntries();
  const head = repo.headFiles();
  const ids = new Map([...files].map(([path, content]) => [path, repo.idFor(content)] as const));
  const known = new Set(repo.allCommitIds());
  return {
    repo: true,
    files,
    ids,
    staged: stagedEntries(index, head),
    branch: repo.currentBranch(),
    history: firstParents(repo.headCommit(), (id) => repo.getCommit(id)),
    known,
    held: heldVersions(ws, index, known),
  };
}

/**
 * The versions git can still give back. The Workbench is read even when `files` was left
 * out: a crate taken off the dock is safe if its file still holds that version, tracked
 * or not, as a new file after `git restore --staged` is.
 */
function heldVersions(
  ws: Workspace,
  index: FileSnapshot,
  commits: ReadonlySet<ObjectId>,
): Set<ObjectId> {
  const held = new Set<ObjectId>(index.values());
  const repo = ws.repo;
  if (repo === null) return held;
  for (const id of commits) {
    for (const blob of repo.getCommit(id)?.files.values() ?? []) held.add(blob);
  }
  for (const path of ws.fs.allFiles()) held.add(repo.idFor(ws.fs.readFile(path)));
  return held;
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
 * version of it is, and removed when that change is its deletion. It is unloaded when it
 * left the dock because the dock itself changed, as `git restore --staged` does, and
 * discarded when the version it held went nowhere. A commit also empties the dock, but
 * there the dock is untouched and HEAD caught up, so those paths went into the Vault.
 */
function dockChanges(before: GitSnapshot, after: GitSnapshot): GitChange[] {
  const changes: GitChange[] = [];
  for (const [path, entry] of after.staged) {
    if (!before.staged.has(path) || before.staged.get(path) !== entry) {
      changes.push({ kind: 'dock', path, how: entry === null ? 'removed' : 'loaded' });
    }
  }
  for (const [path, entry] of before.staged) {
    if (after.staged.has(path)) continue;
    const sealedAsIs = after.history[0]?.files.get(path) === (entry ?? undefined);
    if (sealedAsIs) continue;
    // A staged delete holds no version, so taking it off the dock can't lose one.
    const gone = entry !== null && !after.held.has(entry);
    changes.push({ kind: 'dock', path, how: gone ? 'discarded' : 'unloaded' });
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
      changes.push({
        kind: 'workbench',
        path,
        how: 'changed',
        unsaved: unstaged(path, before, after),
      });
    }
  }
  for (const path of before.files.keys()) {
    if (!after.files.has(path)) {
      changes.push({
        kind: 'workbench',
        path,
        how: 'deleted',
        unsaved: unstaged(path, before, after),
      });
    }
  }
  return changes;
}

/**
 * Whether the Workbench version of a path from before is gone from git after the command.
 * A commit keeps it for good (even one the command takes off the branch, which the reflog
 * still reaches), but the dock only while the dock still has it: `git restore --staged
 * --worktree` wipes a staged edit from both places at once.
 */
function lost(path: string, before: GitSnapshot, after: GitSnapshot): boolean {
  const id = before.ids.get(path);
  if (id === undefined) return true;
  const headAfter = after.history[0]?.files.get(path);
  const dockAfter = after.staged.has(path) ? after.staged.get(path) : headAfter;
  return id !== before.history[0]?.files.get(path) && id !== dockAfter && id !== headAfter;
}

/**
 * A lost Workbench version that was also the one on the dock is a staged edit: the dock's
 * 'discarded' line already says it is gone, so the Workbench line doesn't say it twice.
 */
function unstaged(path: string, before: GitSnapshot, after: GitSnapshot): boolean {
  const id = before.ids.get(path);
  const wasStaged = id !== undefined && before.staged.get(path) === id;
  return lost(path, before, after) && !wasStaged;
}
