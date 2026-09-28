import { parentDir } from '../../../fs/paths';
import { line, type OutputLine } from '../../../git/cli/output';
import { display, resolveExisting, toCanonical } from '../../../machine/winPath';
import type { ShellResult } from '../../shell';
import type { Bound } from '../bind';
import type { Cmdlet, CommandContext } from '../registry';
import { resolveItems } from './driveOps';

const MISSING_PATH =
  'Cannot process command because of one or more missing mandatory parameters: Path.';

/**
 * Get-Content (cat, type, gc): a file's lines. -TotalCount (or -Head) keeps the first N,
 * -Tail the last N, and -Raw prints the text as one piece, final line end and all.
 */
export const GET_CONTENT: Cmdlet = {
  spec: {
    name: 'Get-Content',
    parameters: [
      { name: 'Path', type: 'string[]', position: 0 },
      { name: 'TotalCount', type: 'int', aliases: ['First', 'Head'] },
      { name: 'Tail', type: 'int', aliases: ['Last'] },
      { name: 'Raw', type: 'switch' },
    ],
  },
  run: (context, bound) => {
    const typed = bound.texts('Path');
    if (typed === null) return failed('Get-Content', [MISSING_PATH]);
    const errors: string[] = [];
    const lines: OutputLine[] = [];
    for (const path of typed) {
      const found = resolveItems(context, path, false);
      if ('refused' in found) {
        errors.push(found.refused);
        continue;
      }
      for (const file of found.paths) {
        if (context.machine.drive.isDir(file)) {
          errors.push(
            `Unable to get content because it is a directory: '${display(file)}'. Please use 'Get-ChildItem' instead.`,
          );
          continue;
        }
        lines.push(...contentLines(context.machine.drive.readFile(file), bound));
      }
    }
    return withErrors('Get-Content', errors, lines);
  },
};

/** Set-Content: replaces a file's text with the values, one line each. */
export const SET_CONTENT: Cmdlet = {
  spec: {
    name: 'Set-Content',
    parameters: [
      { name: 'Path', type: 'string[]', position: 0 },
      { name: 'Value', type: 'string[]', position: 1 },
    ],
  },
  run: (context, bound) => write(context, bound, 'Set-Content'),
};

/** Add-Content (ac): adds the values to the end of a file, making it if needed. */
export const ADD_CONTENT: Cmdlet = {
  spec: {
    name: 'Add-Content',
    parameters: [
      { name: 'Path', type: 'string[]', position: 0 },
      { name: 'Value', type: 'string[]', position: 1 },
    ],
  },
  run: (context, bound) => write(context, bound, 'Add-Content'),
};

/** Write-Output (echo, write): each value on its own line, as PowerShell prints them. */
export const WRITE_OUTPUT: Cmdlet = {
  spec: {
    name: 'Write-Output',
    parameters: [
      { name: 'InputObject', type: 'string[]', position: 0, remaining: true },
      { name: 'NoEnumerate', type: 'switch' },
    ],
  },
  run: (_context, bound) => ({
    lines: (bound.texts('InputObject') ?? []).map((text) => line(text)),
    exitCode: 0,
  }),
};

/** A file's text as lines to print, after -TotalCount, -Tail or -Raw. */
function contentLines(text: string, bound: Bound): OutputLine[] {
  if (bound.flag('Raw')) return text === '' ? [] : text.split('\n').map((part) => line(part));
  const all = text === '' ? [] : text.replace(/\n$/, '').split('\n');
  const head = bound.numbers('TotalCount')?.[0];
  const tail = bound.numbers('Tail')?.[0];
  const kept =
    head !== undefined
      ? all.slice(0, head)
      : tail !== undefined
        ? all.slice(Math.max(0, all.length - tail))
        : all;
  return kept.map((part) => line(part));
}

/**
 * Set-Content and Add-Content: each value becomes a line ending in a line end. Add-Content
 * appends straight after what's there, as PowerShell does, even without a final line end.
 */
function write(context: CommandContext, bound: Bound, cmdlet: string): ShellResult {
  const { ws, machine, session } = context;
  const typed = bound.texts('Path');
  if (typed === null) return failed(cmdlet, [MISSING_PATH]);
  const text = (bound.texts('Value') ?? []).map((value) => `${value}\n`).join('');
  const errors: string[] = [];
  for (const path of typed) {
    const target = toCanonical(path, { cwd: session.cwd, home: machine.home });
    if (!target.ok) {
      errors.push(
        'drive' in target
          ? `Cannot find drive. A drive with the name '${target.drive}' does not exist.`
          : `Could not find a part of the path '${target.network}'.`,
      );
      continue;
    }
    const existing = resolveExisting(machine.drive, target.path);
    if (existing !== null && machine.drive.isDir(existing)) {
      errors.push(
        cmdlet === 'Set-Content'
          ? `Unable to clear content of '${display(existing)}' because it is a directory. Clear-Content is only supported on files.`
          : `Access to the path '${display(existing)}' is denied.`,
      );
      continue;
    }
    if (resolveExisting(machine.drive, parentDir(target.path)) === null) {
      errors.push(`Could not find a part of the path '${display(target.path)}'.`);
      continue;
    }
    const file = existing ?? machine.drive.stored(target.path);
    const before =
      cmdlet === 'Add-Content' && existing !== null ? machine.drive.readFile(file) : '';
    const change = machine.drive.writeFile(file, before + text);
    if (change !== 'unchanged') ws.events.emit({ type: 'fileChanged', path: file, change });
  }
  return withErrors(cmdlet, errors, []);
}

function withErrors(cmdlet: string, errors: readonly string[], lines: OutputLine[]): ShellResult {
  const errorLines = errors.map((message) => line(`${cmdlet}: ${message}`, 'error'));
  return { lines: [...errorLines, ...lines], exitCode: errors.length > 0 ? 1 : 0 };
}

function failed(cmdlet: string, messages: readonly string[]): ShellResult {
  return withErrors(cmdlet, messages, []);
}
