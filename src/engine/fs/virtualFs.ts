import type { FileTree } from './fileTree';
import { isWithin, joinPath, parentDir } from './paths';

/** Node's names for what went wrong. EINVAL is a folder moved inside itself. */
export type FsErrorCode = 'ENOENT' | 'EISDIR' | 'ENOTDIR' | 'EEXIST' | 'ENOTEMPTY' | 'EINVAL';

/** A filesystem failure with a machine-readable code, so the shell can word its own message. */
export class FsError extends Error {
  readonly code: FsErrorCode;
  readonly path: string;

  constructor(code: FsErrorCode, path: string) {
    super(`${code}: ${path}`);
    this.name = 'FsError';
    this.code = code;
    this.path = path;
  }
}

export interface DirEntry {
  name: string;
  kind: 'file' | 'dir';
}

export type WriteResult = 'created' | 'modified' | 'unchanged';

/**
 * The sandbox's working directory: an in-memory tree of text files. Directories are
 * tracked separately so `mkdir` works for empty folders, even though git ignores them.
 */
export class VirtualFs implements FileTree {
  private readonly files = new Map<string, string>();
  private readonly dirs = new Set<string>(['']);

  readFile(path: string): string {
    const content = this.files.get(path);
    if (content !== undefined) return content;
    throw new FsError(this.dirs.has(path) ? 'EISDIR' : 'ENOENT', path);
  }

  isFile(path: string): boolean {
    return this.files.has(path);
  }

  isDir(path: string): boolean {
    return this.dirs.has(path);
  }

  exists(path: string): boolean {
    return this.isFile(path) || this.isDir(path);
  }

  writeFile(path: string, content: string): WriteResult {
    if (path === '' || this.dirs.has(path)) throw new FsError('EISDIR', path);
    this.ensureParentDirs(path);
    const previous = this.files.get(path);
    this.files.set(path, content);
    if (previous === undefined) return 'created';
    return previous === content ? 'unchanged' : 'modified';
  }

  deleteFile(path: string): void {
    if (this.dirs.has(path)) throw new FsError('EISDIR', path);
    if (!this.files.delete(path)) throw new FsError('ENOENT', path);
  }

  /** Creates a directory and any missing parents, like `mkdir -p`. */
  makeDir(path: string): void {
    if (this.files.has(path)) throw new FsError('EEXIST', path);
    this.ensureParentDirs(path);
    this.dirs.add(path);
  }

  removeDir(path: string, options: { recursive: boolean }): void {
    if (path === '' || !this.dirs.has(path)) throw new FsError('ENOENT', path);
    const insideFiles = [...this.files.keys()].filter((file) => isWithin(file, path));
    const insideDirs = [...this.dirs].filter((dir) => dir !== path && isWithin(dir, path));
    if (!options.recursive && insideFiles.length + insideDirs.length > 0) {
      throw new FsError('ENOTEMPTY', path);
    }
    insideFiles.forEach((file) => this.files.delete(file));
    insideDirs.forEach((dir) => this.dirs.delete(dir));
    this.dirs.delete(path);
  }

  /** Direct children of a directory, directories first, each group alphabetical. */
  listDir(path: string): DirEntry[] {
    if (this.files.has(path)) throw new FsError('ENOTDIR', path);
    if (!this.dirs.has(path)) throw new FsError('ENOENT', path);
    const isChild = (candidate: string) => candidate !== '' && parentDir(candidate) === path;
    const dirs = [...this.dirs]
      .filter(isChild)
      .map((dir) => ({ name: nameIn(path, dir), kind: 'dir' as const }));
    const files = [...this.files.keys()]
      .filter(isChild)
      .map((file) => ({ name: nameIn(path, file), kind: 'file' as const }));
    const byName = (a: DirEntry, b: DirEntry) => a.name.localeCompare(b.name);
    return [...dirs.sort(byName), ...files.sort(byName)];
  }

  /** Every file path at or below `dir`, sorted. */
  allFiles(dir = ''): string[] {
    return [...this.files.keys()].filter((file) => isWithin(file, dir)).sort();
  }

  private ensureParentDirs(path: string): void {
    let dir = parentDir(path);
    const missing: string[] = [];
    while (!this.dirs.has(dir)) {
      if (this.files.has(dir)) throw new FsError('ENOTDIR', dir);
      missing.push(dir);
      dir = parentDir(dir);
    }
    missing.forEach((created) => this.dirs.add(created));
  }
}

function nameIn(dir: string, path: string): string {
  return dir === '' ? path : path.slice(joinPath(dir, '').length);
}
