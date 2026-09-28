import type { FileTree } from '../fs/fileTree';
import { joinPath } from '../fs/paths';

/*
 * Paths on the simulated Windows drive. Inside the engine every path is canonical: relative
 * to the root of C:, with forward slashes, like 'Users/kyle/notes'. The root of C: is ''.
 * The player types (and reads) Windows paths: C:\Users\kyle, ..\web, ~\notes.
 */

/**
 * A path on C:; or a drive this machine doesn't have (another letter, or a PowerShell drive
 * such as Env: or HKLM: that isn't a folder), for PowerShell's "Cannot find drive"; or a
 * network path (\\server\share), which this laptop can't reach.
 */
export type PathResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly drive: string }
  | { readonly ok: false; readonly network: string };

export interface PathContext {
  /** The folder the terminal stands in, canonical. */
  readonly cwd: string;
  /** The player's home folder, canonical, like 'Users/kyle'. */
  readonly home: string;
}

/** Everything before the first colon names a drive, as PowerShell reads it: C:, Env:, HKLM:. */
const DRIVE = /^([^\\:]+):(.*)$/;
/** The \\?\ and \\.\ prefixes Windows accepts in front of a drive path. */
const DEVICE_PREFIX = /^\\\\[?.]\\/;

/**
 * Turns a typed path into a canonical one. Accepts C:\..., c:/..., a bare C: (the current
 * folder), \... (the root of C:), ~ and ~\... (home), and relative paths with . and ..,
 * where .. stops at the root as it does on Windows. Surrounding quotes are dropped, and so
 * is a \\?\ prefix. Any other drive, and any network path, is reported rather than guessed.
 */
export function toCanonical(input: string, context: PathContext): PathResult {
  let text = input.trim();
  const quoted = /^(['"])(.*)\1$/.exec(text);
  if (quoted) text = quoted[2] ?? '';
  text = text.replace(/\//g, '\\').replace(DEVICE_PREFIX, '');
  if (text.startsWith('\\\\')) return { ok: false, network: text };

  let start: string;
  let rest: string;
  const drive = DRIVE.exec(text);
  if (drive) {
    const name = drive[1] ?? '';
    if (name.toUpperCase() !== 'C') return { ok: false, drive: name };
    rest = drive[2] ?? '';
    // C:\... starts at the root; C:folder and a bare C: start where the terminal stands.
    start = rest.startsWith('\\') ? '' : context.cwd;
  } else if (text === '~' || text.startsWith('~\\')) {
    start = context.home;
    rest = text.slice(1);
  } else if (text.startsWith('\\')) {
    start = '';
    rest = text;
  } else {
    start = context.cwd;
    rest = text;
  }

  const segments = start === '' ? [] : start.split('/');
  for (const segment of rest.split('\\')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return { ok: true, path: segments.join('/') };
}

/** How a canonical path reads on screen: 'Users/kyle' is C:\Users\kyle, '' is C:\. */
export function display(path: string): string {
  return `C:\\${path.replace(/\//g, '\\')}`;
}

/**
 * The canonical folder a PATH entry names, like 'C:\Program Files\nodejs\' to
 * 'Program Files/nodejs'. A trailing \ doesn't matter. Null for an entry that isn't an
 * absolute folder on C:, which command lookup skips.
 */
export function fromDisplay(entry: string): string | null {
  const text = entry.trim();
  if (!/^[Cc]:[\\/]/.test(text)) return null;
  const result = toCanonical(text, { cwd: '', home: '' });
  return result.ok ? result.path : null;
}

/**
 * Finds a path on a tree the way Windows does, ignoring case, and returns it with the
 * casing it was stored with ('users/KYLE' finds 'Users/kyle'). Null if it doesn't exist.
 */
export function resolveExisting(tree: FileTree, path: string): string | null {
  if (path === '') return '';
  let found = '';
  for (const segment of path.split('/')) {
    if (!tree.isDir(found)) return null;
    const lower = segment.toLowerCase();
    const match = tree.listDir(found).find((entry) => entry.name.toLowerCase() === lower);
    if (match === undefined) return null;
    found = joinPath(found, match.name);
  }
  return found;
}
