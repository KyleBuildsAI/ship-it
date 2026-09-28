import { baseName, joinPath, parentDir } from '../../fs/paths';
import type { OutputLine } from '../../git/cli/output';
import type { Machine, Session } from '../../machine/machine';
import { display, resolveExisting, toCanonical } from '../../machine/winPath';
import type { Workspace } from '../../workspace';
import type { LexToken, WordPart } from './lex';
import { hasWildcard, wildcard } from './wildcard';

export interface Redirect {
  readonly stream: 'output' | 'error';
  readonly append: boolean;
  readonly target: readonly WordPart[];
}

/** Where a stream goes: nowhere ($null), or into a file. */
export type Sink = { readonly kind: 'discard' } | { readonly kind: 'file'; readonly path: string };

/** .NET's words for a file another handle holds open, as PowerShell prints them. */
export const heldMessage = (path: string): string =>
  `The process cannot access the file '${display(path)}' because it is being used by another process.`;

/**
 * Takes the redirects out of a statement: `> file`, `>> file`, `2> file`, `2>$null`, and
 * `2>&1` (`merge`), which sends errors wherever the output goes. They may sit anywhere in
 * the line, as in PowerShell (echo a > out.txt b writes a and b).
 */
export function splitRedirects(
  tokens: readonly LexToken[],
): { command: LexToken[]; redirects: Redirect[]; merge: boolean } | { refused: string } {
  const command: LexToken[] = [];
  const redirects: Redirect[] = [];
  let merge = false;
  // 2>&1 counts as the error stream's redirect, so it can't be joined by a 2> (7.6.6).
  const taken = (stream: Redirect['stream']) =>
    (stream === 'error' && merge) || redirects.some((redirect) => redirect.stream === stream);
  const already = (stream: Redirect['stream']) => ({
    refused: `The ${stream} stream for this command is already redirected.`,
  });
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token?.kind === 'merge') {
      if (taken('error')) return already('error');
      merge = true;
      continue;
    }
    if (token?.kind !== 'redirect') {
      if (token !== undefined) command.push(token);
      continue;
    }
    const target = tokens[index + 1];
    if (target?.kind !== 'word')
      return { refused: 'Missing file specification after redirection operator.' };
    if (taken(token.stream)) return already(token.stream);
    redirects.push({ stream: token.stream, append: token.append, target: target.parts });
    index++;
  }
  return { command, redirects, merge };
}

/**
 * Opens a redirect's file before the command runs, as PowerShell does: `>` empties it
 * first (so ls > files.txt lists files.txt too), and `>>` leaves it be. `held` has the
 * files this statement already opened, lower-cased. Returns the sink, or Out-File's
 * refusal.
 */
export function openSink(
  { ws, machine, session }: { ws: Workspace; machine: Machine; session: Session },
  redirect: Redirect,
  text: string,
  held: ReadonlySet<string>,
): Sink | { refused: string } {
  const { drive } = machine;
  const [only] = redirect.target;
  if (
    redirect.target.length === 1 &&
    only?.kind === 'variable' &&
    only.name.toLowerCase() === 'null'
  )
    return { kind: 'discard' };
  const target = toCanonical(text, { cwd: session.cwd, home: machine.home });
  if (!target.ok)
    return {
      refused:
        'drive' in target
          ? `Cannot find drive. A drive with the name '${target.drive}' does not exist.`
          : `Could not find a part of the path '${target.network}'.`,
    };
  const found = findTarget(machine, target.path, text);
  if ('refused' in found) return found;
  const { existing } = found;
  if (existing !== null && drive.isDir(existing))
    return { refused: `Access to the path '${display(existing)}' is denied.` };
  // A file standing where a folder should be is as missing as no folder at all.
  const parent = resolveExisting(drive, parentDir(target.path));
  if (parent === null || !drive.isDir(parent))
    return { refused: `Could not find a part of the path '${display(target.path)}'.` };
  if (existing !== null) {
    // > 2> and >> all refuse a read-only file; only >> takes a hidden one, since emptying
    // a hidden file is what Windows refuses (checked in 7.6.6).
    if (drive.isReadOnly(existing) || (!redirect.append && drive.isHidden(existing)))
      return { refused: `Access to the path '${display(existing)}' is denied.` };
    // > a.txt 2> a.txt: the first redirect already holds it.
    if (held.has(existing.toLowerCase())) return { refused: heldMessage(existing) };
  }
  const path = existing ?? drive.stored(target.path);
  if (!redirect.append || existing === null) {
    const change = drive.writeFile(path, '');
    if (change !== 'unchanged') ws.events.emit({ type: 'fileChanged', path, change });
  }
  return { kind: 'file', path };
}

/**
 * The item a redirect's path names, or null for a file to make. A wildcard must name
 * exactly one visible item, as Out-File needs (checked in 7.6.6).
 */
function findTarget(
  machine: Machine,
  path: string,
  text: string,
): { existing: string | null } | { refused: string } {
  const { drive } = machine;
  const last = baseName(path);
  if (!hasWildcard(last)) return { existing: resolveExisting(drive, path) };
  const folder = resolveExisting(drive, parentDir(path));
  if (folder === null) return { refused: `Could not find a part of the path '${display(path)}'.` };
  const pattern = wildcard(last);
  // A file standing in for the folder just matches nothing.
  const matches = drive.isDir(folder)
    ? drive
        .listDir(folder)
        .map((entry) => joinPath(folder, entry.name))
        .filter((item) => pattern.test(baseName(item)) && !drive.isHidden(item))
    : [];
  const [match] = matches;
  if (match === undefined)
    return {
      refused: `Cannot perform operation because the wildcard path ${text} did not resolve to a file.`,
    };
  if (matches.length > 1)
    return {
      refused:
        'Cannot perform operation because the path resolved to more than one file. This command cannot operate on multiple files.',
    };
  return { existing: match };
}

/**
 * Writes lines to a sink, one per line, after what the file already holds. A held file
 * can't go away while the command runs, so a missing one only means a check was missed;
 * the lines are dropped rather than let a drive error escape the shell.
 */
export function pour(
  { ws, machine }: { ws: Workspace; machine: Machine },
  sink: Sink,
  lines: readonly OutputLine[],
): void {
  if (sink.kind === 'discard' || lines.length === 0 || !machine.drive.isFile(sink.path)) return;
  const before = machine.drive.readFile(sink.path);
  const text = lines.map((output) => `${output.text}\n`).join('');
  const change = machine.drive.writeFile(sink.path, before + text);
  if (change !== 'unchanged') ws.events.emit({ type: 'fileChanged', path: sink.path, change });
}
