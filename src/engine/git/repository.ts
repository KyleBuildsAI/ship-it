import { blobId, type HashFunction } from './hash';
import { resolveRevision, type RevisionContext } from './revparse';
import type { Commit, FileSnapshot, Head, ObjectId, ReflogEntry, Signature } from './types';

export interface RepositoryDeps {
  hash: HashFunction;
  /** Milliseconds since the epoch. Injected so tests get the same ids every run. */
  clock: () => number;
  author: Signature;
}

export const DEFAULT_BRANCH = 'main';

/** A commit as plain JSON: its files as an object instead of a Map. */
export interface CommitData {
  readonly id: ObjectId;
  readonly parents: readonly ObjectId[];
  readonly message: string;
  readonly author: Signature;
  readonly timestamp: number;
  readonly files: Readonly<Record<string, ObjectId>>;
}

/**
 * Everything in a repository as plain JSON, so a sandbox can go into the save and come
 * back exactly: same commit ids, same reflog, same staging area.
 */
export interface RepositoryData {
  readonly blobs: Readonly<Record<ObjectId, string>>;
  readonly commits: readonly CommitData[];
  readonly branches: Readonly<Record<string, ObjectId>>;
  readonly index: Readonly<Record<string, ObjectId>>;
  readonly reflog: readonly ReflogEntry[];
  readonly head: Head;
}

/**
 * The `.git` folder as data: stored objects, branches, HEAD, the index (staging area),
 * and the HEAD reflog. It knows nothing about the working directory or text output;
 * commands combine it with the filesystem and format results.
 */
export class Repository implements RevisionContext {
  private readonly deps: RepositoryDeps;
  private readonly blobs = new Map<ObjectId, string>();
  private readonly commits = new Map<ObjectId, Commit>();
  private readonly branches = new Map<string, ObjectId>();
  private readonly index = new Map<string, ObjectId>();
  private readonly headLog: ReflogEntry[] = [];
  private head: Head = { kind: 'branch', name: DEFAULT_BRANCH };

  constructor(deps: RepositoryDeps) {
    this.deps = deps;
  }

  /** The whole repository as plain data (see RepositoryData). */
  toData(): RepositoryData {
    return {
      blobs: Object.fromEntries(this.blobs),
      commits: [...this.commits.values()].map((commit) => ({
        ...commit,
        parents: [...commit.parents],
        files: Object.fromEntries(commit.files),
      })),
      branches: Object.fromEntries(this.branches),
      index: Object.fromEntries(this.index),
      reflog: [...this.headLog],
      head: this.head,
    };
  }

  /** Rebuilds a repository from toData's output. New commits use `deps`, as usual. */
  static fromData(data: RepositoryData, deps: RepositoryDeps): Repository {
    const repo = new Repository(deps);
    for (const [id, content] of Object.entries(data.blobs)) repo.blobs.set(id, content);
    for (const commit of data.commits) {
      repo.commits.set(commit.id, { ...commit, files: new Map(Object.entries(commit.files)) });
    }
    for (const [name, id] of Object.entries(data.branches)) repo.branches.set(name, id);
    for (const [path, id] of Object.entries(data.index)) repo.index.set(path, id);
    repo.headLog.push(...data.reflog);
    repo.head = data.head;
    return repo;
  }

  // ---- Objects -------------------------------------------------------------

  writeBlob(content: string): ObjectId {
    const id = blobId(content, this.deps.hash);
    this.blobs.set(id, content);
    return id;
  }

  /** The id a file's content would get, without storing it. Used to spot edited files. */
  idFor(content: string): ObjectId {
    return blobId(content, this.deps.hash);
  }

  readBlob(id: ObjectId): string {
    const content = this.blobs.get(id);
    if (content === undefined) throw new Error(`missing blob ${id}`);
    return content;
  }

  getCommit(id: ObjectId): Commit | undefined {
    return this.commits.get(id);
  }

  allCommitIds(): Iterable<ObjectId> {
    return this.commits.keys();
  }

  // ---- HEAD and branches ---------------------------------------------------

  getHead(): Head {
    return this.head;
  }

  /** The branch HEAD is on, or null when HEAD is detached. */
  currentBranch(): string | null {
    return this.head.kind === 'branch' ? this.head.name : null;
  }

  /** The commit HEAD points at, or null on a brand-new branch with no commits yet. */
  headCommitId(): ObjectId | null {
    if (this.head.kind === 'detached') return this.head.commit;
    return this.branches.get(this.head.name) ?? null;
  }

  headCommit(): Commit | null {
    const id = this.headCommitId();
    return id === null ? null : (this.commits.get(id) ?? null);
  }

  branchTip(name: string): ObjectId | undefined {
    return this.branches.get(name);
  }

  branchNames(): string[] {
    return [...this.branches.keys()].sort();
  }

  /** Files in the HEAD commit; empty before the first commit. */
  headFiles(): FileSnapshot {
    return this.headCommit()?.files ?? new Map();
  }

  resolve(revision: string): ObjectId {
    return resolveRevision(this, revision);
  }

  /** Newest first, like `git reflog`. */
  reflog(): readonly ReflogEntry[] {
    return [...this.headLog].reverse();
  }

  /**
   * Moves HEAD's branch (or a detached HEAD) to `target` and records why in the reflog.
   * This is the one place HEAD moves, so the reflog can never miss a step.
   */
  moveHead(target: ObjectId, reason: string): void {
    const from = this.headCommitId();
    if (this.head.kind === 'branch') {
      this.branches.set(this.head.name, target);
    } else {
      this.head = { kind: 'detached', commit: target };
    }
    this.headLog.push({ from, to: target, message: reason, timestamp: this.deps.clock() });
  }

  /** Points HEAD straight at a commit, leaving every branch where it was ("detached HEAD"). */
  detachHead(target: ObjectId, reason: string): void {
    const from = this.headCommitId();
    this.head = { kind: 'detached', commit: target };
    this.headLog.push({ from, to: target, message: reason, timestamp: this.deps.clock() });
  }

  // ---- Index (staging area) ------------------------------------------------

  indexEntries(): FileSnapshot {
    return this.index;
  }

  stage(path: string, content: string): ObjectId {
    const id = this.writeBlob(content);
    this.index.set(path, id);
    return id;
  }

  /** Points an index entry at a blob that's already stored, e.g. restoring a file from HEAD. */
  setIndexEntry(path: string, id: ObjectId): void {
    if (!this.blobs.has(id)) throw new Error(`missing blob ${id}`);
    this.index.set(path, id);
  }

  removeFromIndex(path: string): boolean {
    return this.index.delete(path);
  }

  /** Makes the index match a snapshot exactly, as `git reset` does. */
  replaceIndex(files: FileSnapshot): void {
    this.index.clear();
    for (const [path, id] of files) this.index.set(path, id);
  }

  // ---- Commits -------------------------------------------------------------

  /**
   * Stores a commit object. Its id is a hash of everything in it, so any change to the
   * files, message, author, time, or parents gives a different id.
   */
  createCommit(message: string, files: FileSnapshot, parents: readonly ObjectId[]): Commit {
    const timestamp = this.deps.clock();
    const { author } = this.deps;
    const sortedFiles = new Map([...files].sort(([a], [b]) => (a < b ? -1 : 1)));
    const listing = [...sortedFiles].map(([path, id]) => `${path}\0${id}`).join('\n');
    const body = [
      `tree ${this.deps.hash(listing)}`,
      ...parents.map((parent) => `parent ${parent}`),
      `author ${author.name} <${author.email}> ${String(Math.floor(timestamp / 1000))} +0000`,
      '',
      message,
    ].join('\n');
    const id = this.deps.hash(`commit ${String(body.length)}\0${body}`);
    const commit: Commit = {
      id,
      parents: [...parents],
      message,
      author,
      timestamp,
      files: sortedFiles,
    };
    this.commits.set(id, commit);
    return commit;
  }

  /** `git commit`: snapshot the index as a new commit on top of HEAD and move HEAD to it. */
  commitIndex(message: string): Commit {
    const parent = this.headCommitId();
    const commit = this.createCommit(message, new Map(this.index), parent === null ? [] : [parent]);
    const subject = message.split('\n')[0] ?? '';
    this.moveHead(commit.id, `commit${parent === null ? ' (initial)' : ''}: ${subject}`);
    return commit;
  }
}
