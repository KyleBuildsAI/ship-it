import { baseName, joinPath, parentDir } from '../../../fs/paths';
import { display, resolveExisting, toCanonical } from '../../../machine/winPath';
import { heldMessage } from '../redirect';
import type { CommandContext } from '../registry';
import { hasWildcard, wildcard } from '../wildcard';

/*
 * What the item cmdlets share: finding the items a typed path names, and copying and
 * deleting them on the drive while announcing each file on the event stream.
 */

/** The items a typed path names: one, or every visible match of a wildcard in its folder. */
export function resolveItems(
  { machine, session }: CommandContext,
  typed: string,
  force: boolean,
): { paths: string[] } | { refused: string } {
  const target = toCanonical(typed, { cwd: session.cwd, home: machine.home });
  if (!target.ok)
    return {
      refused:
        'drive' in target
          ? `Cannot find drive. A drive with the name '${target.drive}' does not exist.`
          : `Cannot find path '${target.network}' because it does not exist.`,
    };
  const last = baseName(target.path);
  if (!hasWildcard(last)) {
    const found = resolveExisting(machine.drive, target.path);
    return found === null
      ? { refused: `Cannot find path '${display(target.path)}' because it does not exist.` }
      : { paths: [found] };
  }
  const folder = resolveExisting(machine.drive, parentDir(target.path));
  // A missing folder is an error, but a file standing in for one just matches nothing
  // (checked in 7.6.6 with nope\*.txt and a.txt\*.txt).
  if (folder === null)
    return {
      refused: `Cannot find path '${display(parentDir(target.path))}' because it does not exist.`,
    };
  if (!machine.drive.isDir(folder)) return { paths: [] };
  const pattern = wildcard(last);
  const paths = machine.drive
    .listDir(folder)
    .map((entry) => joinPath(folder, entry.name))
    .filter((path) => pattern.test(baseName(path)) && (force || !machine.drive.isHidden(path)));
  return { paths };
}

/**
 * Whether PowerShell holds this folder: the one this tab stands in or one above it, or home
 * (Windows keeps files open there). Another tab's folder doesn't count: Set-Location
 * doesn't move the pwsh process, so nothing holds it (checked in 7.6).
 */
export function inUse({ machine, session }: CommandContext, path: string): boolean {
  const holds = (folder: string) => folder === path || folder.startsWith(`${path}/`);
  return path === '' || holds(session.cwd) || holds(machine.home);
}

/** Whether a redirect of this statement holds the file open, as in rm log.txt 2> log.txt. */
export function isHeld({ held }: Pick<CommandContext, 'held'>, path: string): boolean {
  return held.has(path.toLowerCase());
}

/** Whether a held file is somewhere inside this folder. */
export function holdsHeld({ held }: Pick<CommandContext, 'held'>, folder: string): boolean {
  const inside = `${folder.toLowerCase()}/`;
  return [...held].some((path) => path.startsWith(inside));
}

/**
 * Copies a file, or a folder with everything in it (or, without `recurse`, just an empty
 * folder of the same name, as Copy-Item does). A file keeps its Hidden and ReadOnly
 * attributes; a folder keeps neither.
 *
 * Returns what went wrong, in PowerShell's words, instead of throwing: an item that meets
 * something of the other kind in the way is skipped, and the rest still copies, as in
 * PowerShell. `force` only quiets a folder skipped for a file in its place, and a folder
 * that's already there.
 */
export function copyItem(
  context: CommandContext,
  from: string,
  to: string,
  recurse: boolean,
  force = false,
): string[] {
  const { drive } = context.machine;
  // A file goes only into a folder that's there; a folder makes its missing parents, unless
  // a file stands where one of them should be (all checked in 7.6.6).
  if (drive.isFile(from) && !drive.isDir(parentDir(to)))
    return [`Could not find a part of the path '${display(to)}'.`];
  const blocker = fileOnTheWay(context, to);
  if (blocker !== null)
    return [
      `Cannot create '${display(blocker)}' because a file or directory with the same name already exists.`,
    ];
  if (drive.isDir(from) && drive.isFile(to))
    return ['Container cannot be copied onto existing leaf item.'];
  const problems: string[] = [];
  copyEntry(context, from, to, recurse, force, problems);
  return problems;
}

/** Copies one item and, with `recurse`, what's in it, noting each one that can't land. */
function copyEntry(
  context: CommandContext,
  from: string,
  to: string,
  recurse: boolean,
  force: boolean,
  problems: string[],
): void {
  const { ws, machine } = context;
  const { drive } = machine;
  if (drive.isFile(from)) {
    // Met when a folder is copied onto itself (cp src . -Recurse); -Force doesn't help.
    if (to.toLowerCase() === from.toLowerCase()) {
      problems.push(`Cannot overwrite the item ${display(from)} with itself.`);
      return;
    }
    if (drive.isDir(to)) {
      problems.push(`The target file '${display(to)}' is a directory, not a file.`);
      return;
    }
    // A held file can still be read and copied from, but not written over (7.6.6).
    if (isHeld(context, to)) {
      problems.push(heldMessage(to));
      return;
    }
    const change = drive.writeFile(to, drive.readFile(from));
    if (change !== 'unchanged') ws.events.emit({ type: 'fileChanged', path: to, change });
    if (drive.isHidden(from)) drive.hide(to);
    if (drive.isReadOnly(from)) drive.setReadOnly(to);
    return;
  }
  if (drive.isFile(to)) {
    if (!force) problems.push(`An item with the specified name ${display(to)} already exists.`);
    return;
  }
  // A folder already there is copied into all the same; without -Force PowerShell says so
  // first (checked in 7.6.6).
  if (!drive.isDir(to)) drive.makeDir(to);
  else if (!force) problems.push(`An item with the specified name ${display(to)} already exists.`);
  if (!recurse) return;
  // PowerShell copies a folder's files before its subfolders, which sets the order its
  // errors print in (checked in 7.6.6); listDir gives folders first.
  const entries = drive.listDir(from);
  const filesFirst = [
    ...entries.filter((entry) => entry.kind === 'file'),
    ...entries.filter((entry) => entry.kind === 'dir'),
  ];
  for (const entry of filesFirst)
    copyEntry(context, joinPath(from, entry.name), joinPath(to, entry.name), true, force, problems);
}

/** The file standing where a folder above `path` should be, or null if there's none. */
function fileOnTheWay({ machine }: CommandContext, path: string): string | null {
  for (let folder = parentDir(path); folder !== ''; folder = parentDir(folder)) {
    const found = resolveExisting(machine.drive, folder);
    if (found !== null) return machine.drive.isFile(found) ? found : null;
  }
  return null;
}

/** Moves a file or folder (a new name counts), announcing each file as gone and made. */
export function moveItem({ ws, machine }: CommandContext, from: string, to: string): string {
  const before = machine.drive.isFile(from) ? [from] : machine.drive.allFiles(from);
  const landed = machine.drive.move(from, to);
  for (const file of before) {
    ws.events.emit({ type: 'fileChanged', path: file, change: 'deleted' });
    const moved = landed + file.slice(from.length);
    ws.events.emit({ type: 'fileChanged', path: moved, change: 'created' });
  }
  return landed;
}

/** Deletes a file, or a folder with everything in it. */
export function deleteItem({ ws, machine }: CommandContext, path: string): void {
  if (machine.drive.isFile(path)) {
    machine.drive.deleteFile(path);
    ws.events.emit({ type: 'fileChanged', path, change: 'deleted' });
    return;
  }
  for (const file of machine.drive.allFiles(path))
    ws.events.emit({ type: 'fileChanged', path: file, change: 'deleted' });
  machine.drive.removeDir(path, { recursive: true });
}
