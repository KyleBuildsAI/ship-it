import { isWithin } from './paths';
import { FsError, type DirEntry, type WriteResult } from './virtualFs';

/**
 * What the shell and git need from a folder tree. VirtualFs is a whole tree of its own;
 * SubtreeFs shows one folder of another tree as if it were the whole tree.
 */
export interface FileTree {
  readFile(path: string): string;
  isFile(path: string): boolean;
  isDir(path: string): boolean;
  exists(path: string): boolean;
  writeFile(path: string, content: string): WriteResult;
  deleteFile(path: string): void;
  makeDir(path: string): void;
  removeDir(path: string, options: { recursive: boolean }): void;
  listDir(path: string): DirEntry[];
  allFiles(dir?: string): string[];
}

/**
 * One folder of a bigger tree, seen as if it were the whole tree. Act 1's simulated C:
 * drive holds Act 2's project folder; git sees that folder through this view, with paths
 * relative to it (`src/app.ts`, not `Users/kyle/quillwork/app/src/app.ts`), and every
 * write lands on the drive, so the shell and git always agree.
 *
 * It behaves exactly like a VirtualFs of its own, errors included: an error names the
 * path as seen from inside, and nothing outside the folder can be reached. If something
 * removes the mounted folder from the bigger tree, the view fails cleanly (ENOENT) rather
 * than quietly bringing the folder back on the next write.
 */
export class SubtreeFs implements FileTree {
  private readonly root: FileTree;
  /** Where this view's '' sits in the bigger tree, like 'Users/kyle/quillwork/app'. */
  readonly mount: string;

  constructor(root: FileTree, mount: string) {
    if (mount === '') throw new Error('Mount a subtree at a folder, not at the root.');
    this.root = root;
    this.mount = mount;
    if (!root.isDir(mount)) root.makeDir(mount);
  }

  readFile(path: string): string {
    return this.inside(() => this.root.readFile(this.outer(path)));
  }

  /** The mount is this view's root. Once it's gone, nothing inside it can be used. */
  private requireMount(): void {
    if (!this.root.isDir(this.mount)) throw new FsError('ENOENT', '');
  }

  isFile(path: string): boolean {
    return this.root.isFile(this.outer(path));
  }

  isDir(path: string): boolean {
    return this.root.isDir(this.outer(path));
  }

  exists(path: string): boolean {
    return this.root.exists(this.outer(path));
  }

  writeFile(path: string, content: string): WriteResult {
    // The mount point is this view's root, which is a folder, like a VirtualFs's ''.
    if (path === '') throw new FsError('EISDIR', path);
    this.requireMount();
    return this.inside(() => this.root.writeFile(this.outer(path), content));
  }

  deleteFile(path: string): void {
    this.inside(() => {
      this.root.deleteFile(this.outer(path));
    });
  }

  makeDir(path: string): void {
    this.requireMount();
    this.inside(() => {
      this.root.makeDir(this.outer(path));
    });
  }

  removeDir(path: string, options: { recursive: boolean }): void {
    // A VirtualFs refuses to remove its root; so does this view, keeping the mount.
    if (path === '') throw new FsError('ENOENT', path);
    this.inside(() => {
      this.root.removeDir(this.outer(path), options);
    });
  }

  listDir(path: string): DirEntry[] {
    return this.inside(() => this.root.listDir(this.outer(path)));
  }

  allFiles(dir = ''): string[] {
    return this.root.allFiles(this.outer(dir)).map((file) => this.inner(file));
  }

  private outer(path: string): string {
    return path === '' ? this.mount : `${this.mount}/${path}`;
  }

  private inner(path: string): string {
    return path === this.mount ? '' : path.slice(this.mount.length + 1);
  }

  /** Runs an operation on the bigger tree, renaming any error's path to this view's. */
  private inside<T>(operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      if (error instanceof FsError && isWithin(error.path, this.mount)) {
        throw new FsError(error.code, this.inner(error.path));
      }
      throw error;
    }
  }
}
