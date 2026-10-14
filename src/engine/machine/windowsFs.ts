import type { FileTree } from '../fs/fileTree';
import { baseName, joinPath, parentDir } from '../fs/paths';
import { FsError, VirtualFs, type DirEntry, type WriteResult } from '../fs/virtualFs';

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
  /** Items with the Hidden attribute, by lower-case path. */
  private readonly hiddenPaths = new Set<string>();
  /** Items with the ReadOnly attribute, by lower-case path. */
  private readonly readOnlyPaths = new Set<string>();

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
    this.forgetAttributes(path);
    this.tree.deleteFile(this.stored(path));
  }

  makeDir(path: string): void {
    this.tree.makeDir(this.stored(path));
  }

  removeDir(path: string, options: { recursive: boolean }): void {
    this.tree.removeDir(this.stored(path), options);
    this.forgetAttributes(path);
  }

  listDir(path: string): DirEntry[] {
    return this.tree.listDir(this.stored(path));
  }

  allFiles(dir = ''): string[] {
    return this.tree.allFiles(this.stored(dir));
  }

  /**
   * Sets the Hidden attribute, like `attrib +h`. On Windows that's what hides an item from
   * a plain listing (AppData is hidden this way); a name starting with a dot hides nothing.
   */
  hide(path: string): void {
    this.hiddenPaths.add(this.stored(path).toLowerCase());
  }

  /**
   * No walk from C:\ to find the stored spelling: `stored` only changes a name's case, so
   * the lower-case key comes out the same. A listing asks this for every item it shows.
   */
  isHidden(path: string): boolean {
    return this.hiddenPaths.has(path.toLowerCase());
  }

  /**
   * Sets the ReadOnly attribute, like `attrib +r`. Windows marks a home's shell folders
   * (Desktop, Documents, Downloads) this way, which listings show as d-r--.
   */
  setReadOnly(path: string): void {
    this.readOnlyPaths.add(this.stored(path).toLowerCase());
  }

  /** Like isHidden, the lower-case key needs no walk. */
  isReadOnly(path: string): boolean {
    return this.readOnlyPaths.has(path.toLowerCase());
  }

  /**
   * Moves a file or folder, like a rename on NTFS: its contents and attributes go with it,
   * and a new spelling of the same name is allowed (notes.txt to Notes.txt). Returns where
   * it landed. The destination's folder must already exist and nothing else may stand at
   * the destination.
   */
  move(from: string, to: string): string {
    const source = this.stored(from);
    const target = joinPath(this.stored(parentDir(to)), baseName(to));
    // The move deletes the source before it rebuilds it, so every check comes first: a
    // move that can't finish must throw with the source untouched, never halfway through.
    this.checkMove(source, target);
    const rebase = (path: string) => target + path.slice(source.length);
    const isFile = this.tree.isFile(source);
    const folders = isFile ? [] : [source, ...this.foldersUnder(source)];
    const files = (isFile ? [source] : this.tree.allFiles(source)).map(
      (file) => [file, this.tree.readFile(file)] as const,
    );
    const lowerSource = source.toLowerCase();
    const inside = (path: string) => path === lowerSource || path.startsWith(`${lowerSource}/`);
    const hidden = [...this.hiddenPaths].filter(inside);
    const readOnly = [...this.readOnlyPaths].filter(inside);
    if (isFile) this.tree.deleteFile(source);
    else this.tree.removeDir(source, { recursive: true });
    this.forgetAttributes(source);
    for (const folder of folders) this.tree.makeDir(rebase(folder));
    for (const [file, content] of files) this.tree.writeFile(rebase(file), content);
    for (const path of hidden) this.hiddenPaths.add(rebase(path).toLowerCase());
    for (const path of readOnly) this.readOnlyPaths.add(rebase(path).toLowerCase());
    return target;
  }

  /** Throws the FsError a move would hit, before the move changes anything. */
  private checkMove(source: string, target: string): void {
    if (!this.tree.exists(source)) throw new FsError('ENOENT', source);
    const lowerSource = source.toLowerCase();
    if (target.toLowerCase().startsWith(`${lowerSource}/`)) throw new FsError('EINVAL', target);
    // Covers a missing folder and a file where a folder should be (a.txt\x.txt).
    if (!this.tree.isDir(parentDir(target))) throw new FsError('ENOTDIR', target);
    // The tree underneath matches case exactly, so look the destination up by its stored
    // spelling: A.txt is where a.txt is. Only the source itself may be there (a new spelling).
    const occupant = this.stored(target);
    if (this.tree.exists(occupant) && occupant.toLowerCase() !== lowerSource)
      throw new FsError('EEXIST', occupant);
  }

  private foldersUnder(dir: string): string[] {
    return this.tree
      .listDir(dir)
      .filter((entry) => entry.kind === 'dir')
      .flatMap((entry) => {
        const folder = joinPath(dir, entry.name);
        return [folder, ...this.foldersUnder(folder)];
      });
  }

  /** A deleted item takes its attributes with it, and so does everything inside it. */
  private forgetAttributes(path: string): void {
    const gone = this.stored(path).toLowerCase();
    for (const attributes of [this.hiddenPaths, this.readOnlyPaths]) {
      for (const marked of [...attributes]) {
        if (marked === gone || marked.startsWith(`${gone}/`)) attributes.delete(marked);
      }
    }
  }
}
