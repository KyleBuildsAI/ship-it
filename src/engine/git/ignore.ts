interface IgnoreRule {
  regex: RegExp;
  negate: boolean;
  directoryOnly: boolean;
}

/** Converts one glob to a regex body: `*` and `?` stay inside a folder, `**` crosses folders. */
function globToRegex(glob: string): string {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob.charAt(i);
    if (char === '*') {
      if (glob[i + 1] === '*') {
        const followedBySlash = glob[i + 2] === '/';
        out += followedBySlash ? '(?:.*/)?' : '.*';
        i += followedBySlash ? 2 : 1;
      } else {
        out += '[^/]*';
      }
    } else if (char === '?') {
      out += '[^/]';
    } else if (char === '[') {
      const close = glob.indexOf(']', i + 1);
      if (close === -1) {
        out += '\\[';
      } else {
        out += glob.slice(i, close + 1).replace('[!', '[^');
        i = close;
      }
    } else {
      out += char.replace(/[.+^${}()|\\]/g, '\\$&');
    }
  }
  return out;
}

function parseRule(line: string): IgnoreRule | null {
  let pattern = line.trim();
  if (pattern === '' || pattern.startsWith('#')) return null;

  const negate = pattern.startsWith('!');
  if (negate) pattern = pattern.slice(1);
  const directoryOnly = pattern.endsWith('/');
  if (directoryOnly) pattern = pattern.slice(0, -1);
  // A slash at the start or in the middle ties the pattern to the project root.
  const anchored = pattern.includes('/');
  if (pattern.startsWith('/')) pattern = pattern.slice(1);
  if (pattern === '') return null;

  const body = globToRegex(pattern);
  return {
    regex: new RegExp(anchored ? `^${body}$` : `^(?:.*/)?${body}$`),
    negate,
    directoryOnly,
  };
}

/**
 * The `.gitignore` rules the curriculum teaches: comments, `*`, `?`, `**`, `[abc]`,
 * trailing `/` for folders only, leading `/` to anchor at the root, and `!` to re-include.
 */
export class IgnoreRules {
  private readonly rules: IgnoreRule[];

  constructor(gitignoreContent: string) {
    this.rules = gitignoreContent
      .split(/\r?\n/)
      .map(parseRule)
      .filter((rule): rule is IgnoreRule => rule !== null);
  }

  /**
   * True if git would ignore this file. Like git, once a folder is ignored everything
   * inside it stays ignored: a `!` rule can't bring back a file whose folder is excluded.
   */
  isIgnored(path: string): boolean {
    const parts = path.split('/');
    for (let depth = 1; depth < parts.length; depth++) {
      if (this.matches(parts.slice(0, depth).join('/'), true)) return true;
    }
    return this.matches(path, false);
  }

  private matches(candidate: string, isDirectory: boolean): boolean {
    let ignored = false;
    for (const rule of this.rules) {
      if (rule.directoryOnly && !isDirectory) continue;
      // The last rule that matches wins, which is how a later `!` re-includes a file.
      if (rule.regex.test(candidate)) ignored = !rule.negate;
    }
    return ignored;
  }
}
