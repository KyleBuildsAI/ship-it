import { Emitter } from './events';
import type { FileTree } from './fs/fileTree';
import { VirtualFs } from './fs/virtualFs';
import { IgnoreRules } from './git/ignore';
import { Repository, type RepositoryDeps } from './git/repository';
import { computeStatus, type RepoStatus } from './git/status';
import type { Commit, ObjectId } from './git/types';

/**
 * Everything the 3D world and HUD can react to. The engine emits these; it never
 * knows or cares who listens.
 */
export type EngineEvent =
  | { readonly type: 'repoInitialized' }
  | {
      readonly type: 'fileChanged';
      readonly path: string;
      readonly change: 'created' | 'modified' | 'deleted';
    }
  | { readonly type: 'staged'; readonly paths: readonly string[] }
  | { readonly type: 'unstaged'; readonly paths: readonly string[] }
  | { readonly type: 'committed'; readonly commit: Commit; readonly branch: string | null }
  | {
      readonly type: 'branchMoved';
      readonly branch: string;
      readonly from: ObjectId | null;
      readonly to: ObjectId;
    }
  | {
      readonly type: 'headMoved';
      readonly from: ObjectId | null;
      readonly to: ObjectId;
      readonly reason: string;
    };

/** Thrown when a git command runs in a folder that was never `git init`-ed. */
export class NotARepositoryError extends Error {
  constructor() {
    super('not a git repository');
    this.name = 'NotARepositoryError';
  }
}

export const GITIGNORE = '.gitignore';

export interface WorkspaceOptions {
  /**
   * The project folder's files. A fresh tree of its own by default; Act 1 passes a
   * SubtreeFs, so the project is one folder of a bigger simulated drive.
   */
  readonly fs?: FileTree;
}

/**
 * One sandbox: a project folder (the Workbench) and, once initialized, its repository
 * (the Loading Dock and the Vault). Shell and git commands both act on a Workspace.
 */
export class Workspace {
  readonly fs: FileTree;
  readonly events = new Emitter<EngineEvent>();
  readonly deps: RepositoryDeps;
  private repository: Repository | null = null;

  constructor(deps: RepositoryDeps, options: WorkspaceOptions = {}) {
    this.deps = deps;
    this.fs = options.fs ?? new VirtualFs();
  }

  get repo(): Repository | null {
    return this.repository;
  }

  requireRepo(): Repository {
    if (this.repository === null) throw new NotARepositoryError();
    return this.repository;
  }

  /** `git init`. Running it again is harmless, as in real git. */
  initRepo(): { reinitialized: boolean } {
    if (this.repository !== null) return { reinitialized: true };
    this.repository = new Repository(this.deps);
    this.events.emit({ type: 'repoInitialized' });
    return { reinitialized: false };
  }

  writeFile(path: string, content: string): void {
    const change = this.fs.writeFile(path, content);
    if (change !== 'unchanged') this.events.emit({ type: 'fileChanged', path, change });
  }

  deleteFile(path: string): void {
    this.fs.deleteFile(path);
    this.events.emit({ type: 'fileChanged', path, change: 'deleted' });
  }

  /** Rules from the root `.gitignore`, re-read every time so edits apply immediately. */
  ignoreRules(): IgnoreRules {
    return new IgnoreRules(this.fs.isFile(GITIGNORE) ? this.fs.readFile(GITIGNORE) : '');
  }

  status(): RepoStatus {
    return computeStatus(this.requireRepo(), this.fs, this.ignoreRules());
  }
}
