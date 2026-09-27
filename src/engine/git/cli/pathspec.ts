import { isWithin, resolvePath } from '../../fs/paths';

/** The directory the command runs in (repo-relative) and how the project root is displayed. */
export interface CommandContext {
  readonly cwd: string;
  /** Shown in messages like "Initialized empty Git repository in <root>/.git/". */
  readonly displayRoot: string;
}

const GLOB_CHARS = /[*?[]/;

function globRegex(glob: string): RegExp {
  let body = '';
  for (const char of glob) {
    // In git pathspecs `*` also crosses folders: `git add "*.ts"` finds src/app.ts too.
    if (char === '*') body += '.*';
    else if (char === '?') body += '.';
    else if (char === '[' || char === ']') body += char;
    else body += char.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  return new RegExp(`^${body}$`);
}

/**
 * Expands what the player typed after `git add`/`git rm`/`git restore` into repo paths,
 * the way git does: a file, everything under a folder (`.` is the current folder), or a
 * glob. Returns null for input that climbs outside the project.
 */
export function matchPathspec(
  ctx: CommandContext,
  spec: string,
  candidates: Iterable<string>,
): string[] | null {
  const resolved = resolvePath(ctx.cwd, spec);
  if (resolved === null) return null;
  const all = [...new Set(candidates)];

  if (GLOB_CHARS.test(resolved)) {
    const regex = globRegex(resolved);
    return all.filter((path) => regex.test(path)).sort();
  }
  return all.filter((path) => isWithin(path, resolved)).sort();
}
