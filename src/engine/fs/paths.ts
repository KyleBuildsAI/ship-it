/**
 * Paths inside the sandbox are POSIX strings relative to the project root, like
 * 'src/app.ts'. The root itself is ''. Keeping one canonical form means the shell,
 * git, and the 3D world always agree on which file a path means.
 */

/**
 * Resolves what the player typed against the current directory. Backslashes are
 * accepted because the game teaches PowerShell habits (`cd src\lib`). A leading
 * slash means the project root. Returns null if the path climbs above the root.
 */
export function resolvePath(cwd: string, input: string): string | null {
  const unified = input.replace(/\\/g, '/');
  const startsAtRoot = unified.startsWith('/');
  const segments = startsAtRoot || cwd === '' ? [] : cwd.split('/');

  for (const segment of unified.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}

/** The directory that contains `path`; '' for top-level entries and for the root. */
export function parentDir(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function joinPath(dir: string, name: string): string {
  return dir === '' ? name : `${dir}/${name}`;
}

/** True when `path` is `dir` itself or anywhere below it. The root contains everything. */
export function isWithin(path: string, dir: string): boolean {
  return dir === '' || path === dir || path.startsWith(`${dir}/`);
}

/**
 * How `path` looks from `fromDir`, the way git prints paths relative to where you
 * ran the command: from 'src', 'README.md' becomes '../README.md'.
 */
export function relativePath(fromDir: string, path: string): string {
  const from = fromDir === '' ? [] : fromDir.split('/');
  const to = path === '' ? [] : path.split('/');
  let shared = 0;
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared++;
  const ups = from.slice(shared).map(() => '..');
  const result = [...ups, ...to.slice(shared)].join('/');
  return result === '' ? '.' : result;
}
