import { parentDir } from '../../fs/paths';
import type { OutputLine } from '../../git/cli/output';
import type { Machine, Session } from '../../machine/machine';
import { display, resolveExisting, toCanonical } from '../../machine/winPath';
import type { Workspace } from '../../workspace';
import type { LexToken, WordPart } from './lex';

export interface Redirect {
  readonly stream: 'output' | 'error';
  readonly append: boolean;
  readonly target: readonly WordPart[];
}

/** Where a stream goes: nowhere ($null), or into a file. */
export type Sink = { readonly kind: 'discard' } | { readonly kind: 'file'; readonly path: string };

/**
 * Takes the redirects out of a statement: `> file`, `>> file`, `2> file`, `2>$null`. They
 * may sit anywhere in the line, as in PowerShell (echo a > out.txt b writes a and b).
 */
export function splitRedirects(
  tokens: readonly LexToken[],
): { command: LexToken[]; redirects: Redirect[] } | { refused: string } {
  const command: LexToken[] = [];
  const redirects: Redirect[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token?.kind !== 'redirect') {
      if (token !== undefined) command.push(token);
      continue;
    }
    const target = tokens[index + 1];
    if (target?.kind !== 'word')
      return { refused: 'Missing file specification after redirection operator.' };
    if (redirects.some((redirect) => redirect.stream === token.stream))
      return {
        refused: `The ${token.stream === 'output' ? 'output' : 'error'} stream for this command is already redirected.`,
      };
    redirects.push({ stream: token.stream, append: token.append, target: target.parts });
    index++;
  }
  return { command, redirects };
}

/**
 * Opens a redirect's file before the command runs, as PowerShell does: `>` empties it
 * first (so ls > files.txt lists files.txt too), and `>>` leaves it be. Returns the sink,
 * or Out-File's refusal.
 */
export function openSink(
  { ws, machine, session }: { ws: Workspace; machine: Machine; session: Session },
  redirect: Redirect,
  text: string,
): Sink | { refused: string } {
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
  const existing = resolveExisting(machine.drive, target.path);
  if (existing !== null && machine.drive.isDir(existing))
    return { refused: `Access to the path '${display(existing)}' is denied.` };
  if (resolveExisting(machine.drive, parentDir(target.path)) === null)
    return { refused: `Could not find a part of the path '${display(target.path)}'.` };
  const path = existing ?? machine.drive.stored(target.path);
  if (!redirect.append || existing === null) {
    const change = machine.drive.writeFile(path, '');
    if (change !== 'unchanged') ws.events.emit({ type: 'fileChanged', path, change });
  }
  return { kind: 'file', path };
}

/** Writes lines to a sink, one per line, after what the file already holds. */
export function pour(
  { ws, machine }: { ws: Workspace; machine: Machine },
  sink: Sink,
  lines: readonly OutputLine[],
): void {
  if (sink.kind === 'discard' || lines.length === 0) return;
  const before = machine.drive.readFile(sink.path);
  const text = lines.map((output) => `${output.text}\n`).join('');
  const change = machine.drive.writeFile(sink.path, before + text);
  if (change !== 'unchanged') ws.events.emit({ type: 'fileChanged', path: sink.path, change });
}
