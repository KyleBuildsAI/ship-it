import type { Workspace } from '../../../workspace';
import { shortId } from '../../hash';
import type { FileSnapshot } from '../../types';
import { parseArgs } from '../args';
import { subjectOf } from '../logFormat';
import { fatal, line, ok, type CommandResult, type OutputLine } from '../output';
import { matchPathspec, type CommandContext } from '../pathspec';
import { resolveOrExplain } from '../revisions';
import { resetIndexPaths, resetWorkingPaths } from '../staging';

/** "Unstaged changes after reset:" plus git's M/D list of edits still on the Workbench. */
function unstagedSummary(ws: Workspace): OutputLine[] {
  const { unstaged } = ws.status();
  if (unstaged.length === 0) return [];
  return [
    line('Unstaged changes after reset:'),
    ...unstaged.map((change) =>
      line(`${change.kind === 'deleted' ? 'D' : 'M'}\t${change.path}`, 'unstaged'),
    ),
  ];
}

/**
 * `git reset` moves the current branch (and HEAD with it) to another commit. The mode
 * decides how much else follows:
 * - `--soft`: only the branch moves; the Loading Dock and Workbench keep your changes.
 * - `--mixed` (default): the Loading Dock is reset too, so changes become unstaged.
 * - `--hard`: the Workbench is reset as well. Uncommitted work is gone (the reflog
 *   still remembers the commits).
 * With paths instead of a commit, `git reset <file>` just unstages those files.
 */
export function resetCommand(
  ws: Workspace,
  ctx: CommandContext,
  argv: readonly string[],
): CommandResult {
  const args = parseArgs(argv, [
    { names: ['soft'] },
    { names: ['mixed'] },
    { names: ['hard'] },
    { names: ['q', 'quiet'] },
  ]);
  if (args.unknown.length > 0) return fatal(`unknown option '${args.unknown[0] ?? ''}'`);
  const modes = ['soft', 'mixed', 'hard'].filter((mode) => args.flags.has(mode));
  if (modes.length > 1) return fatal('--soft, --mixed, and --hard cannot be used together');
  const mode = (modes[0] ?? 'mixed') as 'soft' | 'mixed' | 'hard';
  const repo = ws.requireRepo();

  // The first word is a commit if it resolves to one; everything else is a path.
  const words = [...args.positional];
  let revision: string | null = null;
  if (words[0] !== undefined && typeof resolveOrExplain(repo, words[0]) === 'string')
    revision = words.shift() ?? null;
  const pathspecs = [...words, ...(args.afterDoubleDash ?? [])];

  if (pathspecs.length > 0) {
    if (mode !== 'mixed') return fatal(`Cannot do ${mode} reset with paths.`);
    let source: FileSnapshot = new Map();
    if (revision !== null || repo.headCommitId() !== null) {
      const id = resolveOrExplain(repo, revision ?? 'HEAD');
      if (typeof id !== 'string') return id;
      source = repo.getCommit(id)?.files ?? new Map();
    }
    const candidates = [...repo.indexEntries().keys(), ...source.keys()];
    const paths = new Set<string>();
    for (const spec of pathspecs) {
      const matched = matchPathspec(ctx, spec, candidates);
      if (matched === null) return fatal(`'${spec}' is outside repository`);
      if (matched.length === 0) {
        // Neither a file git knows nor a commit: git's "ambiguous argument" message.
        const explained = resolveOrExplain(repo, spec);
        return typeof explained === 'string'
          ? fatal(`pathspec '${spec}' did not match any files`)
          : explained;
      }
      matched.forEach((path) => paths.add(path));
    }
    resetIndexPaths(ws, [...paths], source);
    return ok(args.flags.has('q') ? [] : unstagedSummary(ws));
  }

  if (repo.headCommitId() === null && revision === null) {
    // Before the first commit there is no commit to move to; a plain reset unstages everything.
    if (mode !== 'mixed')
      return fatal("ambiguous argument 'HEAD': unknown revision or path not in the working tree.");
    resetIndexPaths(ws, [...repo.indexEntries().keys()], new Map());
    return ok();
  }

  const target = resolveOrExplain(repo, revision ?? 'HEAD');
  if (typeof target !== 'string') return target;
  const targetFiles = repo.getCommit(target)?.files ?? new Map<string, string>();
  const trackedBefore = [...repo.indexEntries().keys()];
  const from = repo.headCommitId();
  const branch = repo.currentBranch();

  repo.moveHead(target, `reset: moving to ${revision ?? 'HEAD'}`);
  if (branch !== null) ws.events.emit({ type: 'branchMoved', branch, from, to: target });
  ws.events.emit({ type: 'headMoved', from, to: target, reason: `reset --${mode}` });

  const affected = [...new Set([...trackedBefore, ...targetFiles.keys()])].sort();
  if (mode !== 'soft') resetIndexPaths(ws, affected, targetFiles);
  if (mode === 'hard') resetWorkingPaths(ws, affected, targetFiles);

  if (args.flags.has('q')) return ok();
  if (mode === 'hard') {
    const commit = repo.getCommit(target);
    return ok([line(`HEAD is now at ${shortId(target)} ${commit ? subjectOf(commit) : ''}`)]);
  }
  return ok(mode === 'mixed' ? unstagedSummary(ws) : []);
}
