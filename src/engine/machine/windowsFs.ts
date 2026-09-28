import type { FileTree } from '../fs/fileTree';
import { joinPath } from '../fs/paths';
import { VirtualFs, type DirEntry, type WriteResult } from '../fs/virtualFs';

/**
 * The laptop's C: drive, case-insensitive and case-preserving like NTFS: `Users\KYLE`
 * and `users\kyle` are the same folder, and a name keeps the spelling it was created
 * with. Two entries that differ only in case can never exist, as on Windows.
 *
 * Every operation first finds the stored spelling of as much of the path as exists, then
 * hands the rest (new names) through as typed.
 */
export class WindowsFs implements FileTree {
  private readonly tree = new VirtualFs();

  /** The path with every existing part spelled as stored; missing parts as typed. */
  stored(path: string): string {
    if (path === '') return '';
    let found = '';
    const segments = path.split('/');
    for (const [index, segment] of segments.entries()) {
      const lower = segment.toLowerCase();
      const match = this.tree.isDir(found)
        ? this.tree.listDir(found).find((entry) => entry.name.toLowerCase() === lower)
        : undefined;
      if (match === undefined) return joinPath(found, segments.slice(index).join('/'));
      found = joinPath(found, match.name);
    }
    return found;
  }

  readFile(path: string): string {
    return this.tree.readFile(this.stored(path));
  }

  isFile(path: string): boolean {
    return this.tree.isFile(this.stored(path));
  }

  isDir(path: string): boolean {
    return this.tree.isDir(this.stored(path));
  }

  exists(path: string): boolean {
    return this.tree.exists(this.stored(path));
  }

  writeFile(path: string, content: string): WriteResult {
    return this.tree.writeFile(this.stored(path), content);
  }

  deleteFile(path: string): void {
    this.tree.deleteFile(this.stored(path));
  }

  makeDir(path: string): void {
    this.tree.makeDir(this.stored(path));
  }

  removeDir(path: string, options: { recursive: boolean }): void {
    this.tree.removeDir(this.stored(path), options);
  }

  listDir(path: string): DirEntry[] {
    return this.tree.listDir(this.stored(path));
  }

  allFiles(dir = ''): string[] {
    return this.tree.allFiles(this.stored(dir));
  }
}
