import { baseName, joinPath, parentDir } from '../../../fs/paths';
import { line, type OutputLine } from '../../../git/cli/output';
import { display, resolveExisting, toCanonical } from '../../../machine/winPath';
import type { ShellResult } from '../../shell';
import type { Bound } from '../bind';
import { itemRow, itemTable, type ItemSection } from '../format';
import type { Cmdlet, CommandContext } from '../registry';
import { hasWildcard, wildcard } from '../wildcard';

const ITEM_TYPES = ['file', 'directory'] as const;
type ItemType = (typeof ITEM_TYPES)[number];

const MISSING_PATH =
  'Cannot process command because of one or more missing mandatory parameters: Path.';

/** Characters Windows won't allow in a file or folder name. */
const INVALID_NAME = /[*?<>|"]/;

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
    if (!bound.has('Path') && !bound.has('Name')) return failed([error(MISSING_PATH)]);
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
  // mkdir is a function that calls New-Item, so its errors name New-Item, except this one,
  // which PowerShell raises before the function runs (both captured).
  run: (context, bound) =>
    bound.has('Path') || bound.has('Name')
      ? createAll(context, bound, 'directory')
      : failed([error(MISSING_PATH, 'mkdir')]),
};

/** Test-Path parameters PowerShell has that this sandbox refuses rather than ignores. */
const TEST_PATH_NOT_YET = [
  'Filter',
  'Include',
  'Exclude',
  'IsValid',
  'Credential',
  'OlderThan',
  'NewerThan',
];

/**
 * Test-Path: True or False, for each path. A wildcard is True when anything visible
 * matches. It checks Env: variables too (Env:NAME, Env:PAT*), without printing a value.
 */
export const TEST_PATH: Cmdlet = {
  spec: {
    name: 'Test-Path',
    parameters: [
      { name: 'Path', type: 'string[]', position: 0 },
      { name: 'LiteralPath', type: 'string[]', aliases: ['PSPath', 'LP'] },
      { name: 'Filter', type: 'string' },
      { name: 'Include', type: 'string[]' },
      { name: 'Exclude', type: 'string[]' },
      { name: 'PathType', type: 'string', aliases: ['Type'] },
      { name: 'IsValid', type: 'switch' },
      { name: 'Credential', type: 'string' },
      { name: 'OlderThan', type: 'string', provider: true },
      { name: 'NewerThan', type: 'string', provider: true },
    ],
  },
  run: (context, bound) => {
    const missing = TEST_PATH_NOT_YET.find((name) => bound.has(name));
    if (missing !== undefined)
      return failed([line(`This sandbox doesn't run Test-Path -${missing} yet.`, 'error')]);
    const paths = [
      ...(bound.texts('Path') ?? []).map((typed) => ({ typed, literal: false })),
      ...(bound.texts('LiteralPath') ?? []).map((typed) => ({ typed, literal: true })),
    ];
    if (paths.length === 0) return failed([error(MISSING_PATH, 'Test-Path')]);
    const want = (bound.text('PathType') ?? 'Any').toLowerCase();
    const answers = paths.map(({ typed, literal }) => testPath(context, typed, literal, want));
    return { lines: answers.map((answer) => line(answer ? 'True' : 'False')), exitCode: 0 };
  },
};

function testPath(
  { machine, session }: CommandContext,
  typed: string,
  literal: boolean,
  want: string,
): boolean {
  const env = /^env:\\?(.*)$/i.exec(typed);
  if (env) {
    const name = env[1] ?? '';
    // Env: itself is the drive's root, a container.
    if (name === '') return want !== 'leaf';
    if (want === 'container') return false;
    if (!literal && hasWildcard(name)) {
      const pattern = wildcard(name);
      return session.env.entries().some((entry) => pattern.test(entry.name));
    }
    return session.env.get(name) !== null;
  }
  const target = toCanonical(typed, { cwd: session.cwd, home: machine.home });
  if (!target.ok) return false;
  const last = baseName(target.path);
  const found =
    !literal && hasWildcard(last)
      ? matches(machine.drive, target.path)
      : [resolveExisting(machine.drive, target.path)].filter(
          (path): path is string => path !== null,
        );
  return found.some((path) => {
    if (want === 'leaf') return machine.drive.isFile(path);
    if (want === 'container') return machine.drive.isDir(path);
    return true;
  });
}

/** The visible items a wildcard at the end of a path picks in its folder. */
function matches(drive: CommandContext['machine']['drive'], path: string): string[] {
  const folder = resolveExisting(drive, parentDir(path));
  if (folder === null || !drive.isDir(folder)) return [];
  const pattern = wildcard(baseName(path));
  return drive
    .listDir(folder)
    .map((entry) => joinPath(folder, entry.name))
    .filter((item) => pattern.test(baseName(item)) && !drive.isHidden(item));
}
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
  if (path.split('/').some((segment) => INVALID_NAME.test(segment)))
    return {
      refused: `The filename, directory name, or volume label syntax is incorrect. : '${display(path)}'.`,
    };
  // A file where a folder should be, like notes.txt\sub.txt.
  const blocker = fileOnTheWay(machine.drive, parentDir(path));
  if (blocker !== null)
    return {
      refused:
        type === 'file'
          ? `Could not find a part of the path '${display(path)}'.`
          : `Cannot create '${display(blocker)}' because a file or directory with the same name already exists.`,
    };
  const existing = resolveExisting(machine.drive, path);
  const parent = resolveExisting(machine.drive, parentDir(path));
  if (type === 'directory') {
    if (existing !== null && !(force && machine.drive.isDir(existing)))
      return { refused: `An item with the specified name ${display(existing)} already exists.` };
    return { path: machine.makeFolder(existing ?? path) };
  }
  if (existing !== null && machine.drive.isDir(existing))
    return { refused: `Access to the path '${display(existing)}' is denied.` };
  if (existing !== null && !force)
    return { refused: `The file '${display(existing)}' already exists.` };
  if (parent === null && !force)
    return { refused: `Could not find a part of the path '${display(path)}'.` };
  // -Force makes the missing folders too, so they're announced like any other new folder.
  if (parent === null) machine.makeFolder(parentDir(path));
  const file = existing ?? joinPath(machine.drive.stored(parentDir(path)), baseName(path));
  const change = machine.drive.writeFile(file, bound.text('Value') ?? '');
  if (change !== 'unchanged') ws.events.emit({ type: 'fileChanged', path: file, change });
  return { path: file };
}

/** The first file along a folder path, if the path runs through one. */
function fileOnTheWay(drive: CommandContext['machine']['drive'], folder: string): string | null {
  let walked = '';
  for (const segment of folder.split('/').filter((part) => part !== '')) {
    walked = joinPath(walked, segment);
    const found = resolveExisting(drive, walked);
    if (found === null) return null;
    if (drive.isFile(found)) return found;
  }
  return null;
}

function error(message: string, cmdlet = 'New-Item'): OutputLine {
  return line(`${cmdlet}: ${message}`, 'error');
}

function failed(lines: OutputLine[]): ShellResult {
  return { lines, exitCode: 1 };
}
