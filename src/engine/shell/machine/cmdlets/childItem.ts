import { baseName, joinPath, parentDir } from '../../../fs/paths';
import { line, type OutputLine } from '../../../git/cli/output';
import type { Machine, Session } from '../../../machine/machine';
import { display, resolveExisting, toCanonical } from '../../../machine/winPath';
import type { Bound } from '../bind';
import {
  itemTable,
  nameValueTable,
  windowsLength,
  type ItemRow,
  type ItemSection,
} from '../format';
import type { Cmdlet } from '../registry';

/** What the listing keeps, from the switches. */
interface Options {
  /** Name patterns an item must all match: -Filter, and a wildcard in the path. */
  readonly filters: readonly RegExp[];
  readonly recurse: boolean;
  readonly depth: number;
  readonly showHidden: boolean;
  readonly onlyHidden: boolean;
  readonly onlyReadOnly: boolean;
  readonly nameOnly: boolean;
  readonly kind: 'file' | 'dir' | null;
}

/** Parameters PowerShell has that this sandbox refuses rather than quietly ignores. */
const NOT_YET = ['Include', 'Exclude', 'Attributes', 'FollowSymlink', 'System'];

/** cmd's dir switches, and what PowerShell calls them. */
const CMD_SWITCHES: Readonly<Record<string, string>> = {
  '/s': '-Recurse',
  '/a': '-Force',
  '/b': '-Name',
  '/ad': '-Directory',
};

/**
 * Get-ChildItem (ls, dir, gci): the items in a folder, as PowerShell's table. Paths may
 * use wildcards (*.md), and Env: lists the tab's environment variables instead.
 */
export const GET_CHILD_ITEM: Cmdlet = {
  spec: {
    name: 'Get-ChildItem',
    // All of PowerShell's parameters, in its order, so shortened names match as they do
    // there: -d is -Depth, and -a is ambiguous.
    parameters: [
      { name: 'Path', type: 'string[]', position: 0 },
      { name: 'LiteralPath', type: 'string[]', aliases: ['PSPath', 'LP'] },
      { name: 'Filter', type: 'string', position: 1 },
      { name: 'Include', type: 'string[]' },
      { name: 'Exclude', type: 'string[]' },
      { name: 'Recurse', type: 'switch', aliases: ['s'] },
      { name: 'Depth', type: 'uint' },
      { name: 'Force', type: 'switch' },
      { name: 'Name', type: 'switch' },
      { name: 'Attributes', type: 'string', provider: true },
      { name: 'FollowSymlink', type: 'switch', provider: true },
      { name: 'Directory', type: 'switch', aliases: ['ad'], provider: true },
      { name: 'File', type: 'switch', aliases: ['af'], provider: true },
      { name: 'Hidden', type: 'switch', aliases: ['ah', 'h'], provider: true },
      { name: 'ReadOnly', type: 'switch', aliases: ['ar'], provider: true },
      { name: 'System', type: 'switch', aliases: ['as'], provider: true },
    ],
  },
  run: ({ machine, session }, bound) => {
    const missing = NOT_YET.find((name) => bound.has(name));
    if (missing !== undefined)
      return {
        lines: [line(`This sandbox doesn't run Get-ChildItem -${missing} yet.`, 'error')],
        exitCode: 1,
      };
    const options = readOptions(bound);
    const errors: OutputLine[] = [];
    const sections: ItemSection[] = [];
    const names: string[] = [];
    const variables: { name: string; value: string }[] = [];
    const literal = (bound.texts('LiteralPath') ?? []).map((typed) => ({ typed, literal: true }));
    const paths = [
      ...(bound.texts('Path') ?? []).map((typed) => ({ typed, literal: false })),
      ...literal,
    ];
    for (const { typed, literal: exact } of paths.length > 0
      ? paths
      : [{ typed: '.', literal: false }]) {
      const env = /^env:\\?(.*)$/i.exec(typed);
      const listed = env
        ? listVariables(session, env[1] ?? '', variables)
        : listItems(machine, session, typed, exact, options, sections, names);
      errors.push(...listed);
    }
    const nameOnly = bound.flag('Name');
    const output = nameOnly
      ? [...names, ...variables.map((variable) => variable.name)].map((name) => line(name))
      : [...itemTable(sections), ...nameValueTable(variables)];
    return { lines: [...errors, ...output], exitCode: errors.length > 0 ? 1 : 0 };
  },
};

function readOptions(bound: Bound): Options {
  const filter = bound.text('Filter');
  const depth = bound.numbers('Depth')?.[0];
  return {
    filters: filter === null ? [] : [wildcard(filter)],
    // -Depth implies -Recurse, as in PowerShell.
    recurse: bound.flag('Recurse') || depth !== undefined,
    depth: depth ?? Number.POSITIVE_INFINITY,
    showHidden: bound.flag('Force') || bound.flag('Hidden'),
    onlyHidden: bound.flag('Hidden'),
    onlyReadOnly: bound.flag('ReadOnly'),
    // Bare names; they also keep a wildcard at the top level (see listItems).
    nameOnly: bound.flag('Name'),
    kind: bound.flag('File') ? 'file' : bound.flag('Directory') ? 'dir' : null,
  };
}

/** Lists one typed path into the sections, returning any error lines. */
function listItems(
  machine: Machine,
  session: Session,
  typed: string,
  literal: boolean,
  options: Options,
  sections: ItemSection[],
  names: string[],
): OutputLine[] {
  const target = toCanonical(typed, { cwd: session.cwd, home: machine.home });
  if (!target.ok)
    return 'drive' in target
      ? failure(`Cannot find drive. A drive with the name '${target.drive}' does not exist.`)
      : failure(`Cannot find path '${target.network}' because it does not exist.`);

  const last = baseName(target.path);
  const pattern = !literal && /[*?[]/.test(last) ? wildcard(last) : null;
  const path = pattern === null ? target.path : parentDir(target.path);
  const found = resolveExisting(machine.drive, path);
  if (found === null) {
    const hint = CMD_SWITCHES[typed.toLowerCase()];
    return failure(
      `Cannot find path '${display(path)}' because it does not exist.`,
      ...(hint === undefined ? [] : [`In PowerShell, dir ${typed} is: Get-ChildItem ${hint}`]),
    );
  }
  if (machine.drive.isFile(found)) {
    const row = rowFor(machine, found);
    if (keeps(row, options)) {
      sections.push({ folder: display(parentDir(found)), rows: [row] });
      names.push(row.name);
    }
    return [];
  }
  // A wildcard picks items in its folder; with -Recurse it filters every level below,
  // except with -Name, where PowerShell 7.6 matches it at the top only (checked).
  const listing =
    pattern === null
      ? options
      : {
          ...options,
          filters: [...options.filters, pattern],
          recurse: options.recurse && !options.nameOnly,
        };
  walk(machine, found, '', 0, listing, sections, names);
  return [];
}

function walk(
  machine: Machine,
  dir: string,
  relative: string,
  level: number,
  options: Options,
  sections: ItemSection[],
  names: string[],
): void {
  const children = machine.drive
    .listDir(dir)
    .map((entry) => rowFor(machine, joinPath(dir, entry.name)))
    .filter((row) => options.showHidden || !row.hidden)
    .sort(byKindThenName);
  const rows = children.filter((row) => keeps(row, options));
  sections.push({ folder: display(dir), rows });
  names.push(...rows.map((row) => (relative === '' ? row.name : `${relative}\\${row.name}`)));
  if (!options.recurse || level >= options.depth) return;
  for (const child of children) {
    if (child.kind !== 'dir') continue;
    const inside = relative === '' ? child.name : `${relative}\\${child.name}`;
    walk(machine, joinPath(dir, child.name), inside, level + 1, options, sections, names);
  }
}

function rowFor(machine: Machine, path: string): ItemRow {
  const isDir = machine.drive.isDir(path);
  return {
    name: baseName(path),
    kind: isDir ? 'dir' : 'file',
    hidden: machine.drive.isHidden(path),
    readOnly: machine.drive.isReadOnly(path),
    length: isDir ? 0 : windowsLength(machine.drive.readFile(path)),
  };
}

function keeps(row: ItemRow, options: Options): boolean {
  if (options.onlyHidden && !row.hidden) return false;
  if (options.onlyReadOnly && !row.readOnly) return false;
  if (options.kind !== null && row.kind !== options.kind) return false;
  return options.filters.every((filter) => filter.test(row.name));
}

/** Folders first, then files, each by name ignoring case, as the file system provider lists. */
function byKindThenName(a: ItemRow, b: ItemRow): number {
  if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
  const left = a.name.toLowerCase();
  const right = b.name.toLowerCase();
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Env:, Env:NAME or Env:PATTERN*: the tab's variables, sorted by name. */
function listVariables(
  session: Session,
  name: string,
  into: { name: string; value: string }[],
): OutputLine[] {
  const all = session.env
    .entries()
    .sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
  if (name === '') {
    into.push(...all);
    return [];
  }
  const pattern = /[*?[]/.test(name) ? wildcard(name) : null;
  const matches = all.filter((entry) =>
    pattern === null ? entry.name.toLowerCase() === name.toLowerCase() : pattern.test(entry.name),
  );
  if (matches.length === 0 && pattern === null)
    return failure(`Cannot find path '${name}' because it does not exist.`);
  into.push(...matches);
  return [];
}

/** A PowerShell wildcard (* ? [abc]) as a whole-name, case-insensitive pattern. */
function wildcard(pattern: string): RegExp {
  let source = '';
  for (const char of pattern) {
    if (char === '*') source += '.*';
    else if (char === '?') source += '.';
    else if (char === '[' || char === ']') source += char;
    else source += char.replace(/[.+^${}()|\\/-]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'i');
}

function failure(message: string, ...hints: string[]): OutputLine[] {
  return [line(`Get-ChildItem: ${message}`, 'error'), ...hints.map((hint) => line(hint, 'hint'))];
}
