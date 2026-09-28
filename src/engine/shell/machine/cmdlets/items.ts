import { baseName, joinPath, parentDir } from '../../../fs/paths';
import { line, type OutputLine } from '../../../git/cli/output';
import { display, resolveExisting, toCanonical } from '../../../machine/winPath';
import type { ShellResult } from '../../shell';
import type { Bound } from '../bind';
import { itemRow, itemTable, type ItemSection } from '../format';
import type { Cmdlet, CommandContext } from '../registry';

const ITEM_TYPES = ['file', 'directory'] as const;
type ItemType = (typeof ITEM_TYPES)[number];

/**
 * New-Item (ni): makes a file (the default) or, with -ItemType Directory, a folder, and
 * shows it as a one-row listing. A file needs its folder to exist unless -Force is given;
 * a folder brings any missing parents with it, as on Windows.
 */
export const NEW_ITEM: Cmdlet = {
  spec: {
    name: 'New-Item',
    parameters: [
      { name: 'Path', type: 'string[]', position: 0 },
      { name: 'ItemType', type: 'string', aliases: ['Type'] },
      { name: 'Name', type: 'string' },
      { name: 'Value', type: 'string', aliases: ['Target'] },
      { name: 'Force', type: 'switch' },
    ],
  },
  run: (context, bound) => {
    const typed = bound.text('ItemType');
    const type = typed === null ? 'file' : itemType(typed);
    if (type === null)
      return failed([
        error(
          'The type is not a known type for the file system. Only "file","directory" or "symboliclink" can be specified.',
        ),
      ]);
    if (!bound.has('Path') && !bound.has('Name'))
      return failed([
        error('Cannot process command because of one or more missing mandatory parameters: Path.'),
      ]);
    return createAll(context, bound, type);
  },
};

/** mkdir (md): PowerShell's function for New-Item -ItemType Directory. */
export const MKDIR: Cmdlet = {
  spec: {
    name: 'mkdir',
    parameters: [
      { name: 'Path', type: 'string[]', position: 0 },
      { name: 'Name', type: 'string' },
      { name: 'Force', type: 'switch' },
    ],
  },
  run: (context, bound) =>
    bound.has('Path') || bound.has('Name')
      ? createAll(context, bound, 'directory')
      : failed([
          error(
            'Cannot process command because of one or more missing mandatory parameters: Path.',
          ),
        ]),
};

/** Test-Path: True or False. It checks an Env: variable too, without printing its value. */
export const TEST_PATH: Cmdlet = {
  spec: {
    name: 'Test-Path',
    parameters: [
      { name: 'Path', type: 'string[]', position: 0 },
      { name: 'PathType', type: 'string', aliases: ['Type'] },
    ],
  },
  run: ({ machine, session }, bound) => {
    const want = (bound.text('PathType') ?? 'Any').toLowerCase();
    const answers = (bound.texts('Path') ?? []).map((typed) => {
      const env = /^env:\\?(.+)$/i.exec(typed);
      if (env) return session.env.get(env[1] ?? '') !== null;
      const target = toCanonical(typed, { cwd: session.cwd, home: machine.home });
      const found = target.ok ? resolveExisting(machine.drive, target.path) : null;
      if (found === null) return false;
      if (want === 'leaf') return machine.drive.isFile(found);
      if (want === 'container') return machine.drive.isDir(found);
      return true;
    });
    return { lines: answers.map((answer) => line(answer ? 'True' : 'False')), exitCode: 0 };
  },
};

/** `dir`, `d` and `Directory` all mean a folder: the provider accepts any start of a type. */
function itemType(typed: string): ItemType | null {
  const lower = typed.toLowerCase();
  return lower === '' ? null : (ITEM_TYPES.find((type) => type.startsWith(lower)) ?? null);
}

function createAll(context: CommandContext, bound: Bound, type: ItemType): ShellResult {
  const { machine, session } = context;
  const name = bound.text('Name');
  const errors: OutputLine[] = [];
  const sections: ItemSection[] = [];
  for (const typed of bound.texts('Path') ?? ['.']) {
    const where = name === null ? typed : `${typed}\\${name}`;
    const target = toCanonical(where, { cwd: session.cwd, home: machine.home });
    if (!target.ok) {
      errors.push(
        error(
          'drive' in target
            ? `Cannot find drive. A drive with the name '${target.drive}' does not exist.`
            : `Could not find a part of the path '${target.network}'.`,
        ),
      );
      continue;
    }
    const made = create(context, target.path, type, bound);
    if ('refused' in made) errors.push(error(made.refused));
    else addRow(sections, display(parentDir(made.path)), itemRow(machine.drive, made.path));
  }
  return { lines: [...errors, ...itemTable(sections)], exitCode: errors.length > 0 ? 1 : 0 };
}

/** Items made one after another in the same folder share one heading, as in PowerShell. */
function addRow(sections: ItemSection[], folder: string, row: ItemSection['rows'][number]): void {
  const last = sections.at(-1);
  if (last?.folder === folder)
    sections[sections.length - 1] = { folder, rows: [...last.rows, row] };
  else sections.push({ folder, rows: [row] });
}

/** Makes one item and returns where it landed, or PowerShell's reason it couldn't. */
function create(
  { ws, machine }: CommandContext,
  path: string,
  type: ItemType,
  bound: Bound,
): { path: string } | { refused: string } {
  const force = bound.flag('Force');
  const existing = resolveExisting(machine.drive, path);
  const parent = resolveExisting(machine.drive, parentDir(path));
  if (type === 'directory') {
    if (existing !== null && !(force && machine.drive.isDir(existing)))
      return { refused: `An item with the specified name ${display(existing)} already exists.` };
    machine.drive.makeDir(existing ?? path);
    return { path: machine.drive.stored(path) };
  }
  if (existing !== null && machine.drive.isDir(existing))
    return { refused: `An item with the specified name ${display(existing)} already exists.` };
  if (existing !== null && !force)
    return { refused: `The file '${display(existing)}' already exists.` };
  if (parent === null && !force)
    return { refused: `Could not find a part of the path '${display(path)}'.` };
  if (parent === null) machine.drive.makeDir(parentDir(path));
  const file = existing ?? joinPath(machine.drive.stored(parentDir(path)), baseName(path));
  const change = machine.drive.writeFile(file, bound.text('Value') ?? '');
  if (change !== 'unchanged') ws.events.emit({ type: 'fileChanged', path: file, change });
  return { path: file };
}

function error(message: string): OutputLine {
  return line(`New-Item: ${message}`, 'error');
}

function failed(lines: OutputLine[]): ShellResult {
  return { lines, exitCode: 1 };
}
