import type { VirtualFs } from '../fs/virtualFs';
import type { IgnoreRules } from './ignore';
import type { Repository } from './repository';
import type { FileSnapshot } from './types';

/** A difference between HEAD and the index: what `git commit` would record. */
export type StagedChange =
  | { readonly kind: 'added' | 'modified' | 'deleted'; readonly path: string }
  | { readonly kind: 'renamed'; readonly path: string; readonly from: string };

/** A difference between the index and the working directory: edits not staged yet. */
export interface UnstagedChange {
  readonly kind: 'modified' | 'deleted';
  readonly path: string;
}

/** Everything `git status` reports, as data. All path lists are sorted. */
export interface RepoStatus {
  readonly staged: readonly StagedChange[];
  readonly unstaged: readonly UnstagedChange[];
  /** Files git doesn't know about yet (the unlabeled crates on the Workbench). */
  readonly untracked: readonly string[];
  /** Untracked files a `.gitignore` rule hides (the greyed-out crates). */
  readonly ignored: readonly string[];
}

function stagedChanges(head: FileSnapshot, index: FileSnapshot): StagedChange[] {
  const added: string[] = [];
  const deleted: string[] = [];
  const changes: StagedChange[] = [];

  for (const [path, id] of index) {
    const before = head.get(path);
    if (before === undefined) added.push(path);
    else if (before !== id) changes.push({ kind: 'modified', path });
  }
  for (const path of head.keys()) {
    if (!index.has(path)) deleted.push(path);
  }

  // A deleted file and an added file with identical content is a rename, as with `git mv`.
  const remainingAdded = new Set(added);
  for (const from of deleted) {
    const to = [...remainingAdded].find((path) => index.get(path) === head.get(from));
    if (to === undefined) {
      changes.push({ kind: 'deleted', path: from });
    } else {
      remainingAdded.delete(to);
      changes.push({ kind: 'renamed', path: to, from });
    }
  }
  remainingAdded.forEach((path) => changes.push({ kind: 'added', path }));
  return changes.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** Compares HEAD, the index, and the working directory, exactly the three areas `git status` compares. */
export function computeStatus(repo: Repository, fs: VirtualFs, ignore: IgnoreRules): RepoStatus {
  const index = repo.indexEntries();
  const unstaged: UnstagedChange[] = [];

  for (const [path, id] of index) {
    if (!fs.isFile(path)) {
      unstaged.push({ kind: 'deleted', path });
    } else if (repo.idFor(fs.readFile(path)) !== id) {
      unstaged.push({ kind: 'modified', path });
    }
  }

  const untracked: string[] = [];
  const ignored: string[] = [];
  for (const path of fs.allFiles()) {
    if (index.has(path)) continue;
    (ignore.isIgnored(path) ? ignored : untracked).push(path);
  }

  return {
    staged: stagedChanges(repo.headFiles(), index),
    unstaged: unstaged.sort((a, b) => (a.path < b.path ? -1 : 1)),
    untracked,
    ignored,
  };
}

/** No staged changes, no unstaged edits, no untracked files: what `git status` calls "clean". */
export function isCleanStatus(status: RepoStatus): boolean {
  return (
    status.staged.length === 0 && status.unstaged.length === 0 && status.untracked.length === 0
  );
}
