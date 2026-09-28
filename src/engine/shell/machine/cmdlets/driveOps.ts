import { baseName, joinPath, parentDir } from '../../../fs/paths';
import { display, resolveExisting, toCanonical } from '../../../machine/winPath';
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
  if (folder === null || !machine.drive.isDir(folder)) return { paths: [] };
  const pattern = wildcard(last);
  const paths = machine.drive
    .listDir(folder)
    .map((entry) => joinPath(folder, entry.name))
    .filter((path) => pattern.test(baseName(path)) && (force || !machine.drive.isHidden(path)));
  return { paths };
}

/** Whether any terminal tab stands in this folder or below it, which keeps it in use. */
export function inUse({ machine }: CommandContext, path: string): boolean {
  return machine
    .sessions()
    .some((tab) => path === '' || tab.cwd === path || tab.cwd.startsWith(`${path}/`));
}

/**
 * Copies a file, or a folder with everything in it (or, without `recurse`, just an empty
 * folder of the same name, as Copy-Item does). Hidden attributes come along.
 */
export function copyItem(context: CommandContext, from: string, to: string, recurse: boolean) {
  const { ws, machine } = context;
  const { drive } = machine;
  if (drive.isFile(from)) {
    const change = drive.writeFile(to, drive.readFile(from));
    if (change !== 'unchanged') ws.events.emit({ type: 'fileChanged', path: to, change });
  } else {
    drive.makeDir(to);
    if (recurse)
      for (const entry of drive.listDir(from))
        copyItem(context, joinPath(from, entry.name), joinPath(to, entry.name), true);
  }
  if (drive.isHidden(from)) drive.hide(to);
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
