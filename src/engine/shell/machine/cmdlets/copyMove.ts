import { baseName, joinPath, parentDir } from '../../../fs/paths';
import { line, type OutputLine } from '../../../git/cli/output';
import { display, resolveExisting, toCanonical } from '../../../machine/winPath';
import type { ShellResult } from '../../shell';
import type { Bound } from '../bind';
import type { Cmdlet, CommandContext } from '../registry';
import { copyItem, deleteItem, inUse, moveItem, resolveItems } from './driveOps';

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

/** Rename-Item (ren, rni): a new name in the same folder. A new path is refused. */
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
    if (typed === null || newName === null)
      return failed('Rename-Item', [
        `Cannot process command because of one or more missing mandatory parameters: ${typed === null ? 'Path NewName' : 'NewName'}.`,
      ]);
    if (/[\\/:]/.test(newName))
      return failed('Rename-Item', [
        'Cannot rename the specified target, because it represents a path or device name.',
      ]);
    const found = resolveItems(context, typed, true);
    if ('refused' in found) return failed('Rename-Item', [found.refused]);
    const [from] = found.paths;
    if (from === undefined) return { lines: [], exitCode: 0 };
    const to = joinPath(parentDir(from), newName);
    const clash = resolveExisting(context.machine.drive, to);
    // A new spelling of the same name is fine: notes.txt to Notes.txt.
    if (clash !== null && clash !== from)
      return failed('Rename-Item', ['Cannot create a file when that file already exists.']);
    if (inUse(context, from))
      return failed('Rename-Item', [
        'The process cannot access the file because it is being used by another process.',
      ]);
    relocate(context, from, to, 'move', true);
    return { lines: [], exitCode: 0 };
  },
};

function transfer(context: CommandContext, bound: Bound, mode: Mode): ShellResult {
  const { machine, session } = context;
  const cmdlet = mode === 'copy' ? 'Copy-Item' : 'Move-Item';
  const force = bound.flag('Force');
  const errors: string[] = [];
  const sources: string[] = [];
  for (const typed of bound.texts('Path') ?? []) {
    const found = resolveItems(context, typed, force);
    if ('refused' in found) errors.push(found.refused);
    else sources.push(...found.paths);
  }
  const typedDestination = bound.text('Destination') ?? '.';
  const destination = toCanonical(typedDestination, { cwd: session.cwd, home: machine.home });
  if (!destination.ok) {
    errors.push(
      'drive' in destination
        ? `Cannot find drive. A drive with the name '${destination.drive}' does not exist.`
        : `Cannot find path '${destination.network}' because it does not exist.`,
    );
    return failed(cmdlet, errors);
  }
  const into = resolveExisting(machine.drive, destination.path);
  for (const from of sources) {
    const to =
      into !== null && machine.drive.isDir(into)
        ? joinPath(into, baseName(from))
        : machine.drive.stored(destination.path);
    const refusal = check(context, from, to, mode, force);
    if (refusal !== null) errors.push(refusal);
    else relocate(context, from, to, mode, bound.flag('Recurse'));
  }
  return errors.length > 0 ? failed(cmdlet, errors) : { lines: [], exitCode: 0 };
}

/** Why an item can't go where it's sent, in PowerShell's words, or null. */
function check(
  context: CommandContext,
  from: string,
  to: string,
  mode: Mode,
  force: boolean,
): string | null {
  const { drive } = context.machine;
  if (to === from) return `Cannot overwrite the item ${display(from)} with itself.`;
  if (to.toLowerCase().startsWith(`${from.toLowerCase()}/`))
    return `Cannot ${mode} item ${display(from)} into a folder inside itself.`;
  if (resolveExisting(drive, parentDir(to)) === null)
    return `Could not find a part of the path '${display(to)}'.`;
  if (mode === 'move' && inUse(context, from))
    return 'The process cannot access the file because it is being used by another process.';
  const existing = resolveExisting(drive, to);
  if (existing !== null && existing !== from && mode === 'move' && !force)
    return 'Cannot create a file when that file already exists.';
  return null;
}

/** Copies or moves one item, and announces where it went. */
function relocate(context: CommandContext, from: string, to: string, mode: Mode, recurse: boolean) {
  const { ws, machine } = context;
  const kind = machine.drive.isDir(from) ? 'folder' : 'file';
  let landed = to;
  if (mode === 'copy') {
    copyItem(context, from, to, recurse);
  } else {
    // -Force lets a move replace what's at the destination.
    const existing = resolveExisting(machine.drive, to);
    if (existing !== null && existing !== from) deleteItem(context, existing);
    landed = moveItem(context, from, to);
  }
  ws.events.emit({ type: 'itemMoved', from, to: landed, kind, copy: mode === 'copy' });
}
function failed(cmdlet: string, messages: readonly string[]): ShellResult {
  const lines: OutputLine[] = messages.map((message) => line(`${cmdlet}: ${message}`, 'error'));
  return { lines, exitCode: 1 };
}
