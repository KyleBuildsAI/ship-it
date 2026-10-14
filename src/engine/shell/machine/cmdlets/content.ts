import { baseName, parentDir } from '../../../fs/paths';
import { line, type OutputLine } from '../../../git/cli/output';
import { display, resolveExisting, toCanonical } from '../../../machine/winPath';
import type { ShellResult } from '../../shell';
import type { Bound } from '../bind';
import { heldMessage } from '../redirect';
import type { Cmdlet, CmdletResult, CommandContext } from '../registry';
import { hasWildcard } from '../wildcard';
import { isHeld, resolveItems } from './driveOps';

/**
 * PowerShell's non-interactive error for mandatory parameters left out, in its order. It
 * comes from binding, so it stops the command and prints past 2> (checked in 7.6.6).
 */
const missingMandatory = (cmdlet: string, ...names: readonly string[]): CmdletResult => ({
  ...failed(cmdlet, [
    `Cannot process command because of one or more missing mandatory parameters: ${names.join(' ')}.`,
  ]),
  stopped: true,
});

/**
 * Get-Content (cat, type, gc): a file's lines. -TotalCount (or -Head) keeps the first N,
 * -Tail the last N, and -Raw prints the text as one piece, final line end and all.
 */
export const GET_CONTENT: Cmdlet = {
  spec: {
    name: 'Get-Content',
    parameters: [
      { name: 'Path', type: 'string[]', position: 0 },
      { name: 'TotalCount', type: 'int', aliases: ['First', 'Head'], minimum: 0 },
      { name: 'Tail', type: 'int', aliases: ['Last'], minimum: 0 },
      { name: 'Raw', type: 'switch' },
    ],
  },
  run: (context, bound) => {
    const typed = bound.texts('Path');
    if (typed === null) return missingMandatory('Get-Content', 'Path');
    // Both of these come before PowerShell looks for any file (checked in pwsh 7.6.6).
    if (bound.has('TotalCount') && bound.has('Tail'))
      return failed('Get-Content', [
        'The parameters TotalCount and Tail cannot be used together. Please specify only one parameter.',
      ]);
    // Reading no lines needs no file, so even a missing one is no error.
    if (bound.numbers('TotalCount')?.[0] === 0) return { lines: [], exitCode: 0 };
    const { paths, errors } = findAll(context, typed, false);
    // -Raw refuses a line count at the first file found, after every path was looked up,
    // and stops there: a folder or a second file gets no error of its own. Being what
    // stopped it, that error prints past 2> (checked in 7.6.6).
    const count = bound.has('Tail') ? 'Tail' : bound.has('TotalCount') ? 'TotalCount' : null;
    if (bound.flag('Raw') && count !== null && paths.length > 0)
      return {
        ...failed('Get-Content', [
          ...errors,
          `The 'Raw' and '${count}' parameters cannot be specified in the same command.`,
        ]),
        stopped: true,
      };
    const lines: OutputLine[] = [];
    for (const file of paths) {
      if (context.machine.drive.isDir(file)) {
        errors.push(
          `Unable to get content because it is a directory: '${display(file)}'. Please use 'Get-ChildItem' instead.`,
        );
        continue;
      }
      lines.push(...contentLines(context.machine.drive.readFile(file), bound));
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
  run: (_context, bound) => {
    const values = bound.texts('InputObject');
    // The name stays Write-Output even when typed as echo (checked in pwsh 7.6.6).
    if (values === null) return missingMandatory('Write-Output', 'InputObject');
    return { lines: values.map((text) => line(text)), exitCode: 0 };
  },
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
 * Every item the typed paths name, and PowerShell's error for each path that names none.
 * PowerShell looks up all the paths before it reads or writes any, so these errors print
 * before the ones about single files. With `allowNew`, a path without a wildcard may name
 * a file that isn't there yet, for writing.
 */
function findAll(
  context: CommandContext,
  typed: readonly string[],
  allowNew: boolean,
): { paths: string[]; errors: string[] } {
  const { machine, session } = context;
  const paths: string[] = [];
  const errors: string[] = [];
  for (const path of typed) {
    if (allowNew) {
      const target = toCanonical(path, { cwd: session.cwd, home: machine.home });
      if (target.ok && !hasWildcard(baseName(target.path))) {
        paths.push(target.path);
        continue;
      }
      if (!target.ok && 'network' in target) {
        errors.push(`Could not find a part of the path '${target.network}'.`);
        continue;
      }
    }
    const found = resolveItems(context, path, false);
    if ('refused' in found) errors.push(found.refused);
    else if (found.paths.length === 0)
      // PowerShell names the first path typed here, whichever one matched nothing (7.6.6).
      errors.push(
        `An object at the specified path ${typed[0] ?? path} does not exist, or has been filtered by the -Include or -Exclude parameter.`,
      );
    else paths.push(...found.paths);
  }
  return { paths, errors };
}

/**
 * Set-Content and Add-Content: each value becomes a line ending in a line end. Add-Content
 * appends straight after what's there, as PowerShell does, even without a final line end.
 * A wildcard writes every visible match. Checked in pwsh 7.6.6, PowerShell works in steps:
 *   1. Set-Content empties every file first (see emptyFirst), and may stop there;
 *   2. it looks up every path (see findAll);
 *   3. it opens each file, refusing a missing folder, a folder, or a read-only file;
 *   4. it writes the values to every file it opened.
 */
function write(context: CommandContext, bound: Bound, cmdlet: string): CmdletResult {
  const { ws, machine } = context;
  const { drive } = machine;
  const typed = bound.texts('Path');
  const values = bound.texts('Value');
  if (typed === null || values === null) {
    // PowerShell lists Value before Path (checked in 7.6.6).
    const missing = [values === null ? 'Value' : null, typed === null ? 'Path' : null];
    return missingMandatory(cmdlet, ...missing.filter((name): name is string => name !== null));
  }
  if (cmdlet === 'Set-Content') {
    const refusal = emptyFirst(context, typed);
    // A terminating error, so it prints past 2> (checked in 7.6.6).
    if (refusal !== null) return { ...failed(cmdlet, [refusal]), stopped: true };
  }
  const { paths, errors } = findAll(context, typed, true);
  const opened: string[] = [];
  for (const path of paths) {
    const existing = resolveExisting(drive, path);
    const parent = resolveExisting(drive, parentDir(path));
    // A file standing where a folder should be is as missing as no folder at all.
    if (existing === null && (parent === null || !drive.isDir(parent)))
      errors.push(`Could not find a part of the path '${display(path)}'.`);
    else if (existing !== null && drive.isDir(existing))
      errors.push(`Unable to write content because it is a directory: '${display(existing)}'.`);
    else if (existing !== null && drive.isReadOnly(existing))
      errors.push(`Access to the path '${display(existing)}' is denied.`);
    else if (existing !== null && isHeld(context, existing)) errors.push(heldMessage(existing));
    else opened.push(existing ?? drive.stored(path));
  }
  const text = values.map((value) => `${value}\n`).join('');
  for (const file of opened) {
    const before = cmdlet === 'Add-Content' && drive.isFile(file) ? drive.readFile(file) : '';
    const change = drive.writeFile(file, before + text);
    if (change !== 'unchanged') ws.events.emit({ type: 'fileChanged', path: file, change });
  }
  return withErrors(cmdlet, errors, []);
}

/**
 * Set-Content empties every file it names before writing any. At the first item it can't
 * empty, a folder, a read-only file, or one a redirect holds, the whole command stops: the
 * files before it stay empty and nothing is written (checked in pwsh 7.6.6). Returns that
 * refusal, or null.
 * A path that names nothing is skipped here; looking it up again reports it.
 */
function emptyFirst(context: CommandContext, typed: readonly string[]): string | null {
  const { ws, machine } = context;
  const { drive } = machine;
  const emptied: string[] = [];
  for (const path of typed) {
    const found = resolveItems(context, path, false);
    for (const item of 'refused' in found ? [] : found.paths) {
      const refusal = drive.isDir(item)
        ? `Unable to clear content of '${display(item)}' because it is a directory. Clear-Content is only supported on files.`
        : drive.isReadOnly(item)
          ? `Access to the path '${display(item)}' is denied.`
          : isHeld(context, item)
            ? heldMessage(item)
            : null;
      if (refusal === null) {
        emptied.push(item);
        continue;
      }
      for (const file of emptied) {
        const change = drive.writeFile(file, '');
        if (change !== 'unchanged') ws.events.emit({ type: 'fileChanged', path: file, change });
      }
      return refusal;
    }
  }
  return null;
}

function withErrors(cmdlet: string, errors: readonly string[], lines: OutputLine[]): ShellResult {
  const errorLines = errors.map((message) => line(`${cmdlet}: ${message}`, 'error'));
  return { lines: [...errorLines, ...lines], exitCode: errors.length > 0 ? 1 : 0 };
}

function failed(cmdlet: string, messages: readonly string[]): ShellResult {
  return withErrors(cmdlet, messages, []);
}
