import { baseName, joinPath, parentDir } from '../../../fs/paths';
import { line, type OutputLine } from '../../../git/cli/output';
import { display, resolveExisting, toCanonical } from '../../../machine/winPath';
import type { ShellResult } from '../../shell';
import type { Bound } from '../bind';
import type { Cmdlet, CommandContext } from '../registry';
import { copyItem, deleteItem, holdsHeld, inUse, isHeld, moveItem, resolveItems } from './driveOps';

type Mode = 'copy' | 'move';

/**
 * Copy-Item (cp, copy, cpi): copies files, or folders with -Recurse. Without -Recurse a
 * folder copies as an empty folder, as in PowerShell. Into an existing folder, the copy
 * goes inside it; otherwise it takes the destination's name.
 */
export const COPY_ITEM: Cmdlet = {
  spec: {
    name: 'Copy-Item',
    parameters: [
      { name: 'Path', type: 'string[]', position: 0 },
      { name: 'Destination', type: 'string', position: 1 },
      { name: 'Recurse', type: 'switch' },
      { name: 'Force', type: 'switch' },
    ],
  },
  run: (context, bound) => transfer(context, bound, 'copy'),
};

/** Move-Item (mv, move, mi): moves items into a folder, or to a new name. */
export const MOVE_ITEM: Cmdlet = {
  spec: {
    name: 'Move-Item',
    parameters: [
      { name: 'Path', type: 'string[]', position: 0 },
      { name: 'Destination', type: 'string', position: 1 },
      { name: 'Force', type: 'switch' },
    ],
  },
  run: (context, bound) => transfer(context, bound, 'move'),
};

/**
 * Rename-Item (ren, rni): a new name in the same folder. A wildcard may name one item,
 * never several; a NewName that points at another folder is refused.
 */
export const RENAME_ITEM: Cmdlet = {
  spec: {
    name: 'Rename-Item',
    parameters: [
      { name: 'Path', type: 'string', position: 0 },
      { name: 'NewName', type: 'string', position: 1 },
      { name: 'Force', type: 'switch' },
    ],
  },
  run: (context, bound) => {
    const typed = bound.text('Path');
    const newName = bound.text('NewName');
    // Left out, a mandatory parameter stops the command while binding, so it prints past 2>.
    if (typed === null || newName === null)
      return {
        ...failed('Rename-Item', [
          `Cannot process command because of one or more missing mandatory parameters: ${typed === null ? 'Path NewName' : 'NewName'}.`,
        ]),
        stopped: true,
      };
    const found = resolveItems(context, typed, bound.flag('Force'));
    if ('refused' in found) return failed('Rename-Item', [found.refused]);
    const [from] = found.paths;
    // A wildcard renames only when it matches exactly one item (checked in 7.6.6).
    if (from === undefined || found.paths.length > 1)
      return failed('Rename-Item', [`Cannot rename because item at '${typed}' does not exist.`]);
    // PowerShell checks what it holds before it reads the new name at all.
    if (inUse(context, from))
      return failed('Rename-Item', [
        `Cannot rename the item at '${display(from)}' because it is in use.`,
      ]);
    const name = leafName(newName, from);
    // This one stops the command, so it prints past 2> (checked in 7.6.6).
    if (name === null)
      return {
        ...failed('Rename-Item', [
          'Cannot rename the specified target, because it represents a path or device name.',
        ]),
        stopped: true,
      };
    const { drive } = context.machine;
    const to = renamed(from, name);
    // The very same name: a file is left alone, a folder is refused (checked in 7.6.6).
    if (to === from)
      return drive.isDir(from)
        ? failed('Rename-Item', ['Source and destination path must be different.'])
        : { lines: [], exitCode: 0 };
    const clash = resolveExisting(drive, to);
    // A new spelling of the same name is fine: notes.txt to Notes.txt. Anything else there
    // stops it, in the words of .NET's folder or file move (checked in 7.6.6).
    if (clash !== null && clash !== from)
      return failed('Rename-Item', [
        drive.isDir(from)
          ? `Cannot create '${display(to)}' because a file or directory with the same name already exists.`
          : 'Cannot create a file when that file already exists.',
      ]);
    // What a redirect holds can't be renamed, nor can the folder it's in (checked in 7.6.6).
    if (isHeld(context, from))
      return failed('Rename-Item', [
        'The process cannot access the file because it is being used by another process.',
      ]);
    if (holdsHeld(context, from))
      return failed('Rename-Item', [`Access to the path '${display(from)}' is denied.`]);
    moveOne(context, from, to);
    return { lines: [], exitCode: 0 };
  },
};

/** The path a new name gives an item. '.' (or a bare .\) and '..' name folders above it. */
function renamed(from: string, name: string): string {
  const folder = parentDir(from);
  if (name === '' || name === '.') return folder;
  if (name === '..') return parentDir(folder);
  return joinPath(folder, name);
}

/**
 * The name alone from Rename-Item's NewName, or null for a path PowerShell refuses. As
 * FileSystemProvider.RenameItem reads it: a leading .\ is dropped, and so is a folder
 * spelled like the item's own (ignoring case, with no .. worked out, so ..\kyle\b.txt is
 * still refused); any other folder is refused (checked in 7.6.6).
 */
function leafName(newName: string, from: string): string | null {
  let name = newName;
  if (/^\.[\\/]/.test(name)) name = name.slice(2);
  else {
    const cut = Math.max(name.lastIndexOf('\\'), name.lastIndexOf('/'));
    const folder = name.slice(0, cut).replace(/\//g, '\\').toLowerCase();
    if (cut >= 0 && folder === display(parentDir(from)).toLowerCase()) name = name.slice(cut + 1);
  }
  return /[\\/:]/.test(name) ? null : name;
}

function transfer(context: CommandContext, bound: Bound, mode: Mode): ShellResult {
  const { machine, session } = context;
  const cmdlet = mode === 'copy' ? 'Copy-Item' : 'Move-Item';
  const force = bound.flag('Force');
  const recurse = bound.flag('Recurse');
  const errors: string[] = [];
  const typedDestination = bound.text('Destination') ?? '.';
  const destination = toCanonical(typedDestination, { cwd: session.cwd, home: machine.home });
  const into = destination.ok ? resolveExisting(machine.drive, destination.path) : null;
  // PowerShell finishes each path before it looks up the next, so errors print in the
  // order the paths were typed (checked in 7.6.6).
  for (const typed of bound.texts('Path') ?? []) {
    const found = resolveItems(context, typed, force);
    if ('refused' in found) {
      errors.push(found.refused);
      continue;
    }
    if (!destination.ok) {
      // Once for each path that found something, however many items (checked in 7.6.6).
      if (found.paths.length > 0)
        errors.push(
          'drive' in destination
            ? `Cannot find drive. A drive with the name '${destination.drive}' does not exist.`
            : `Cannot find path '${destination.network}' because it does not exist.`,
        );
      continue;
    }
    for (const from of found.paths) {
      const to = landing(context, from, into, destination.path, mode);
      if (mode === 'copy') {
        const refusal = checkCopy(context, from, to, into, recurse);
        if (refusal !== null) errors.push(refusal);
        else errors.push(...copyOne(context, from, to, recurse, force));
        continue;
      }
      // Moving a file to where it already is does nothing and says nothing (checked in 7.6.6).
      if (to === from && machine.drive.isFile(from)) continue;
      const refusal = checkMove(context, from, to, force);
      if (refusal !== null) errors.push(refusal);
      else moveOne(context, from, to);
    }
  }
  return errors.length > 0 ? failed(cmdlet, errors) : { lines: [], exitCode: 0 };
}

/**
 * Where an item goes: inside the destination when that's a folder, otherwise to the
 * destination itself. A copy lands on what's there under its stored name; a move keeps
 * the last name as typed, so mv readme.md README.md respells the file (checked in 7.6.6).
 */
function landing(
  { machine }: CommandContext,
  from: string,
  into: string | null,
  typedPath: string,
  mode: Mode,
): string {
  const { drive } = machine;
  if (into !== null && drive.isDir(into)) return joinPath(into, baseName(from));
  if (mode === 'copy') return drive.stored(typedPath);
  return joinPath(drive.stored(parentDir(typedPath)), baseName(typedPath));
}

/**
 * Why Copy-Item won't start on an item, in PowerShell's words, or null. What copyItem finds
 * in the way (a missing folder for a file, a file where a folder goes, or the other way
 * round) it reports itself, so those aren't repeated here.
 */
function checkCopy(
  { machine }: CommandContext,
  from: string,
  to: string,
  into: string | null,
  recurse: boolean,
): string | null {
  const { drive } = machine;
  // The destination is the item itself (checked in 7.6.6): cp a.txt A.TXT, cp src src.
  if (into === from || (to === from && drive.isFile(from)))
    return `Cannot overwrite the item ${display(from)} with itself.`;
  // Real 7.6.6 copies a folder into its own subfolder without end (it had to be stopped),
  // so the game refuses instead. Without -Recurse only an empty folder lands, which is fine.
  if (recurse && drive.isDir(from) && to.toLowerCase().startsWith(`${from.toLowerCase()}/`))
    return `Cannot copy item ${display(from)} into a folder inside itself.`;
  return null;
}

/**
 * Why Move-Item won't move an item, in PowerShell's words, or null. The order is 7.6.6's:
 * what PowerShell holds first, then a folder into itself, then the destination's folder,
 * then what's already at the destination.
 */
function checkMove(
  context: CommandContext,
  from: string,
  to: string,
  force: boolean,
): string | null {
  const { drive } = context.machine;
  if (inUse(context, from))
    return `Cannot move item because the item at '${display(from)}' is in use.`;
  if (drive.isDir(from) && (to === from || to.toLowerCase().startsWith(`${from.toLowerCase()}/`)))
    return `Destination path cannot be a subdirectory of the source or the source itself: ${display(to)}.`;
  const parent = resolveExisting(drive, parentDir(to));
  // Move-Item's .NET error names no path, unlike Copy-Item's.
  if (parent === null || !drive.isDir(parent)) return 'Could not find a part of the path.';
  const existing = resolveExisting(drive, to);
  if (existing !== null && existing !== from) {
    // A folder never replaces anything, and a file never replaces a folder, -Force or not;
    // -Force lets a file replace only a file, and not one a redirect holds.
    if (drive.isDir(from))
      return `Cannot create '${display(to)}' because a file or directory with the same name already exists.`;
    if (!force || drive.isDir(existing) || isHeld(context, existing))
      return 'Cannot create a file when that file already exists.';
  }
  // A held file, or a folder with one inside, can't move. The whole folder stays here,
  // where PowerShell would move the rest of what's in it (7.6.6 names no path).
  if (isHeld(context, from) || holdsHeld(context, from))
    return 'The process cannot access the file because it is being used by another process.';
  return null;
}

/**
 * Copies one item and announces it, returning what went wrong on the way. copyItem refuses
 * outright, writing nothing, when the destination itself is in the way, so only a copy that
 * landed (an item of its kind, at a new place) is announced.
 */
function copyOne(
  context: CommandContext,
  from: string,
  to: string,
  recurse: boolean,
  force: boolean,
): string[] {
  const { ws, machine } = context;
  const { drive } = machine;
  const kind = drive.isDir(from) ? 'folder' : 'file';
  const problems = copyItem(context, from, to, recurse, force);
  const landed = to !== from && (kind === 'folder' ? drive.isDir(to) : drive.isFile(to));
  if (landed) ws.events.emit({ type: 'itemMoved', from, to, kind, copy: true });
  return problems;
}

/** Moves one item (a new name counts), replacing a file only where checkMove allowed it. */
function moveOne(context: CommandContext, from: string, to: string): void {
  const { ws, machine } = context;
  const kind = machine.drive.isDir(from) ? 'folder' : 'file';
  const existing = resolveExisting(machine.drive, to);
  if (existing !== null && existing !== from) deleteItem(context, existing);
  const landed = moveItem(context, from, to);
  ws.events.emit({ type: 'itemMoved', from, to: landed, kind, copy: false });
}

function failed(cmdlet: string, messages: readonly string[]): ShellResult {
  const lines: OutputLine[] = messages.map((message) => line(`${cmdlet}: ${message}`, 'error'));
  return { lines, exitCode: 1 };
}
