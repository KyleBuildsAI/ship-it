import { isWithin, relativePath } from '../../../fs/paths';
import type { Workspace } from '../../../workspace';
import { shortId } from '../../hash';
import type { RepoStatus, StagedChange } from '../../status';
import { parseArgs } from '../args';
import { fatal, line, ok, type CommandResult, type OutputLine } from '../output';
import type { CommandContext } from '../pathspec';

const LABELS = {
  added: 'new file:',
  modified: 'modified:',
  deleted: 'deleted:',
  renamed: 'renamed:',
} as const;

/** `\tmodified:   app.ts` with git's column alignment. */
function entry(label: string, path: string, tone: OutputLine['tone']): OutputLine {
  return line(`\t${label.padEnd(12)}${path}`, tone);
}

/**
 * Git shows a brand-new folder as `src/` instead of listing every file in it. A folder
 * collapses when git tracks nothing inside it.
 */
function collapseUntracked(
  ctx: CommandContext,
  untracked: readonly string[],
  tracked: ReadonlySet<string>,
): string[] {
  const shown = new Set<string>();
  for (const path of untracked) {
    const parts = path.split('/');
    let display = relativePath(ctx.cwd, path);
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = parts.slice(0, depth).join('/');
      // Folders above the current directory can't collapse: git lists from where you stand.
      if (isWithin(ctx.cwd, dir) && ctx.cwd !== dir) continue;
      if (![...tracked].some((trackedPath) => isWithin(trackedPath, dir))) {
        display = `${relativePath(ctx.cwd, dir)}/`;
        break;
      }
    }
    shown.add(display);
  }
  return [...shown].sort();
}

function stagedLine(ctx: CommandContext, change: StagedChange): OutputLine {
  const path = relativePath(ctx.cwd, change.path);
  if (change.kind === 'renamed') {
    return entry(LABELS.renamed, `${relativePath(ctx.cwd, change.from)} -> ${path}`, 'staged');
  }
  return entry(LABELS[change.kind], path, 'staged');
}

function longFormat(ws: Workspace, ctx: CommandContext, status: RepoStatus): OutputLine[] {
  const repo = ws.requireRepo();
  const head = repo.getHead();
  const unborn = repo.headCommitId() === null;
  const tracked = new Set(repo.indexEntries().keys());
  const out: OutputLine[] = [
    head.kind === 'branch'
      ? line(`On branch ${head.name}`)
      : line(`HEAD detached at ${shortId(head.commit)}`, 'error'),
  ];
  if (unborn) out.push(line(''), line('No commits yet'));

  const sections: OutputLine[][] = [];
  if (status.staged.length > 0) {
    sections.push([
      line('Changes to be committed:'),
      line(
        unborn
          ? '  (use "git rm --cached <file>..." to unstage)'
          : '  (use "git restore --staged <file>..." to unstage)',
      ),
      ...status.staged.map((change) => stagedLine(ctx, change)),
    ]);
  }
  if (status.unstaged.length > 0) {
    const anyDeleted = status.unstaged.some((change) => change.kind === 'deleted');
    sections.push([
      line('Changes not staged for commit:'),
      line(
        `  (use "git ${anyDeleted ? 'add/rm' : 'add'} <file>..." to update what will be committed)`,
      ),
      line('  (use "git restore <file>..." to discard changes in working directory)'),
      ...status.unstaged.map((change) =>
        entry(LABELS[change.kind], relativePath(ctx.cwd, change.path), 'unstaged'),
      ),
    ]);
  }
  if (status.untracked.length > 0) {
    sections.push([
      line('Untracked files:'),
      line('  (use "git add <file>..." to include in what will be committed)'),
      ...collapseUntracked(ctx, status.untracked, tracked).map((path) =>
        line(`\t${path}`, 'untracked'),
      ),
    ]);
  }

  for (const section of sections) {
    // After "On branch" git goes straight into the first section, unless "No commits yet" came first.
    if (unborn || section !== sections[0]) out.push(line(''));
    out.push(...section);
  }

  if (status.staged.length > 0) {
    out.push(line(''));
  } else if (status.unstaged.length > 0) {
    out.push(line(''), line('no changes added to commit (use "git add" and/or "git commit -a")'));
  } else if (status.untracked.length > 0) {
    out.push(
      line(''),
      line('nothing added to commit but untracked files present (use "git add" to track)'),
    );
  } else if (unborn) {
    out.push(line(''), line('nothing to commit (create/copy files and use "git add" to track)'));
  } else {
    out.push(line('nothing to commit, working tree clean'));
  }
  return out;
}

const SHORT_CODES = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R' } as const;

/** `git status --short`: two columns, staged state then unstaged state, then the path. */
function shortFormat(
  ws: Workspace,
  ctx: CommandContext,
  status: RepoStatus,
  branch: boolean,
): OutputLine[] {
  const repo = ws.requireRepo();
  const out: OutputLine[] = [];
  if (branch) {
    const head = repo.getHead();
    const name = head.kind === 'branch' ? head.name : 'HEAD (no branch)';
    out.push(line(repo.headCommitId() === null ? `## No commits yet on ${name}` : `## ${name}`));
  }

  const rows = new Map<string, { x: string; y: string; label: string }>();
  for (const change of status.staged) {
    const label =
      change.kind === 'renamed'
        ? `${relativePath(ctx.cwd, change.from)} -> ${relativePath(ctx.cwd, change.path)}`
        : relativePath(ctx.cwd, change.path);
    rows.set(change.path, { x: SHORT_CODES[change.kind], y: ' ', label });
  }
  for (const change of status.unstaged) {
    const row = rows.get(change.path) ?? {
      x: ' ',
      y: ' ',
      label: relativePath(ctx.cwd, change.path),
    };
    rows.set(change.path, { ...row, y: SHORT_CODES[change.kind] });
  }
  for (const [, row] of [...rows].sort(([a], [b]) => (a < b ? -1 : 1))) {
    out.push(line(`${row.x}${row.y} ${row.label}`, row.x === ' ' ? 'unstaged' : 'staged'));
  }
  const tracked = new Set(repo.indexEntries().keys());
  for (const path of collapseUntracked(ctx, status.untracked, tracked)) {
    out.push(line(`?? ${path}`, 'untracked'));
  }
  return out;
}

export function statusCommand(
  ws: Workspace,
  ctx: CommandContext,
  argv: readonly string[],
): CommandResult {
  const args = parseArgs(argv, [
    { names: ['s', 'short'] },
    { names: ['b', 'branch'] },
    { names: ['porcelain'] },
  ]);
  if (args.unknown.length > 0) return fatal(`unknown option '${args.unknown[0] ?? ''}'`);
  const status = ws.status();
  const short = args.flags.has('s') || args.flags.has('porcelain');
  return ok(
    short ? shortFormat(ws, ctx, status, args.flags.has('b')) : longFormat(ws, ctx, status),
  );
}
