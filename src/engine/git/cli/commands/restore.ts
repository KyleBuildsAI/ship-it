import type { Workspace } from '../../../workspace';
import { RevisionError } from '../../revparse';
import type { FileSnapshot } from '../../types';
import { parseArgs } from '../args';
import { failure, fatal, line, ok, type CommandResult } from '../output';
import { matchPathspec, type CommandContext } from '../pathspec';
import { resetIndexPaths, resetWorkingPaths } from '../staging';

/**
 * `git restore`: undo changes. By default it puts working-directory files back to their
 * staged version (discarding edits). `--staged` takes a file off the Loading Dock
 * (unstage). `--source=<rev>` restores from any commit.
 */
export function restoreCommand(
  ws: Workspace,
  ctx: CommandContext,
  argv: readonly string[],
): CommandResult {
  const args = parseArgs(argv, [
    { names: ['staged', 'S'] },
    { names: ['worktree', 'W'] },
    { names: ['source', 's'], takesValue: true },
  ]);
  if (args.unknown.length > 0) return fatal(`unknown option '${args.unknown[0] ?? ''}'`);

  const repo = ws.requireRepo();
  const specs = [...args.positional, ...(args.afterDoubleDash ?? [])];
  if (specs.length === 0) return fatal('you must specify path(s) to restore');

  const staged = args.flags.has('staged');
  const worktree = args.flags.has('worktree') || !staged;
  const sourceRevision = args.values.get('source')?.at(-1);

  // Where the restored content comes from: a named commit, HEAD for --staged, else the index.
  let source: FileSnapshot;
  if (sourceRevision !== undefined || staged) {
    const revision = sourceRevision ?? 'HEAD';
    try {
      const id = repo.resolve(revision);
      source = repo.getCommit(id)?.files ?? new Map();
    } catch (error) {
      if (!(error instanceof RevisionError)) throw error;
      return fatal(
        error.kind === 'unborn' ? 'could not resolve HEAD' : `could not resolve ${revision}`,
      );
    }
  } else {
    source = new Map(repo.indexEntries());
  }

  const candidates = [...repo.indexEntries().keys(), ...source.keys(), ...ws.fs.allFiles()];
  const known = new Set([...repo.indexEntries().keys(), ...source.keys()]);
  const targets = new Set<string>();
  for (const spec of specs) {
    const matched = matchPathspec(ctx, spec, candidates)?.filter((path) => known.has(path)) ?? [];
    if (matched.length === 0) {
      return failure([
        line(`error: pathspec '${spec}' did not match any file(s) known to git`, 'error'),
      ]);
    }
    matched.forEach((path) => targets.add(path));
  }

  const paths = [...targets].sort();
  if (staged) resetIndexPaths(ws, paths, source);
  if (worktree) resetWorkingPaths(ws, paths, source);
  return ok();
}
