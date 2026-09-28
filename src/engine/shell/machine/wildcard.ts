/**
 * A PowerShell wildcard (* ? [abc]) as a pattern for a whole name, ignoring case:
 * *.md, notes?.txt, [ab]*.
 */
export function wildcard(pattern: string): RegExp {
  let source = '';
  for (const char of pattern) {
    if (char === '*') source += '.*';
    else if (char === '?') source += '.';
    else if (char === '[' || char === ']') source += char;
    else source += char.replace(/[.+^${}()|\\/-]/g, '\\$&');
  }
  return new RegExp(`^${source}$`, 'i');
}

/** Whether a name has a wildcard in it, so it picks items rather than naming one. */
export const hasWildcard = (name: string): boolean => /[*?[]/.test(name);
