import type { Workspace } from '../workspace';
import { isCleanStatus, type RepoStatus } from './status';
import type { Commit, ObjectId, ReflogEntry } from './types';

const EMPTY_STATUS: RepoStatus = { staged: [], unstaged: [], untracked: [], ignored: [] };

/**
 * Read-only questions about a sandbox, used to grade missions by the state the player
 * reached rather than the commands they typed (DESIGN.md pillar 3). Every function is
 * safe to call before `git init`: it answers as if the repository were empty.
 */
export interface GitQueries {
  isRepo: () => boolean;
  status: () => RepoStatus;
  isClean: () => boolean;
  stagedPaths: () => string[];
  /** Tracked files with edits or deletions that aren't staged. */
  modifiedPaths: () => string[];
  untrackedPaths: () => string[];
  ignoredPaths: () => string[];
  /** Files in the HEAD commit. */
  trackedPaths: () => string[];
  currentBranch: () => string | null;
  headCommit: () => Commit | null;
  /** Commits reachable from `ref` by first parents, newest first. Empty if `ref` doesn't resolve. */
  log: (ref?: string) => Commit[];
  /** File content at a revision, or null if the file or revision doesn't exist. */
  fileAt: (ref: string, path: string) => string | null;
  /** File content in the working directory, or null if it doesn't exist. */
  workingFile: (path: string) => string | null;
  reflog: () => readonly ReflogEntry[];
}

export function gitQueries(ws: Workspace): GitQueries {
  const status = () => (ws.repo === null ? EMPTY_STATUS : ws.status());

  const resolve = (ref: string): ObjectId | null => {
    try {
      return ws.repo?.resolve(ref) ?? null;
    } catch {
      // Grading asks "is this true?", so an unresolvable ref simply means "no".
      return null;
    }
  };

  return {
    isRepo: () => ws.repo !== null,
    status,
    isClean: () => isCleanStatus(status()),
    stagedPaths: () => status().staged.map((change) => change.path),
    modifiedPaths: () => status().unstaged.map((change) => change.path),
    untrackedPaths: () => [...status().untracked],
    ignoredPaths: () => [...status().ignored],
    trackedPaths: () => [...(ws.repo?.headFiles().keys() ?? [])],
    currentBranch: () => ws.repo?.currentBranch() ?? null,
    headCommit: () => ws.repo?.headCommit() ?? null,
    log: (ref = 'HEAD') => {
      const commits: Commit[] = [];
      let id = resolve(ref);
      while (id !== null) {
        const commit = ws.repo?.getCommit(id);
        if (!commit) break;
        commits.push(commit);
        id = commit.parents[0] ?? null;
      }
      return commits;
    },
    fileAt: (ref, path) => {
      const id = resolve(ref);
      const blob = id === null ? undefined : ws.repo?.getCommit(id)?.files.get(path);
      return blob === undefined ? null : (ws.repo?.readBlob(blob) ?? null);
    },
    workingFile: (path) => (ws.fs.isFile(path) ? ws.fs.readFile(path) : null),
    reflog: () => ws.repo?.reflog() ?? [],
  };
}
