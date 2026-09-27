import type { Workspace } from '../../../workspace';
import { shortId } from '../../hash';
import { parseArgs } from '../args';
import { changeSummary, compareSides, lineCounts } from '../diffFormat';
import { subjectOf } from '../logFormat';
import { failure, fatal, line, ok, type CommandResult, type OutputLine } from '../output';
import type { CommandContext } from '../pathspec';
import { resolveOrExplain, snapshotSides } from '../revisions';
import { recordCommit, stagePaths } from '../staging';

/**
 * `git revert <commit>` undoes a commit by adding a *new* commit with the opposite
 * changes. History is never rewritten, which is why it's the safe undo for shared
 * branches. If a file changed again after that commit, the undo would clash; the
 * sandbox stops there (conflict resolution is taught in Act 3).
 */
export function revertCommand(
  ws: Workspace,
  _ctx: CommandContext,
  argv: readonly string[],
): CommandResult {
  const args = parseArgs(argv, [{ names: ['no-edit'] }, { names: ['n', 'no-commit'] }]);
  if (args.unknown.length > 0) return fatal(`unknown option '${args.unknown[0] ?? ''}'`);
  const repo = ws.requireRepo();
  const revision = args.positional[0];
  if (revision === undefined) return fatal('empty commit set passed');

  const id = resolveOrExplain(repo, revision);
  if (typeof id !== 'string') return id;
  const target = repo.getCommit(id);
  if (!target) return fatal(`bad revision '${revision}'`);
  if (target.parents.length > 1) {
    return fatal(
      `commit ${id} is a merge but no -m option was given.`,
      'merge reverts arrive with branching in Act 3',
    );
  }

  const parentFiles =
    target.parents[0] === undefined
      ? new Map<string, string>()
      : (repo.getCommit(target.parents[0])?.files ?? new Map<string, string>());
  const headFiles = repo.headFiles();
  const changed = [...new Set([...parentFiles.keys(), ...target.files.keys()])].filter(
    (path) => parentFiles.get(path) !== target.files.get(path),
  );

  // Refuse to mix the undo with uncommitted work, like git.
  const status = ws.status();
  const dirty = new Set([
    ...status.staged.map((change) => change.path),
    ...status.unstaged.map((change) => change.path),
  ]);
  if (status.staged.length > 0 || changed.some((path) => dirty.has(path))) {
    return {
      lines: [
        line('error: your local changes would be overwritten by revert.', 'error'),
        line('hint: commit your changes or stash them to proceed.', 'hint'),
        line('fatal: revert failed', 'error'),
      ],
      exitCode: 128,
    };
  }

  const clashing = changed.filter((path) => headFiles.get(path) !== target.files.get(path));
  if (clashing.length > 0) {
    const out: OutputLine[] = [
      line(`error: could not revert ${shortId(id)}... ${subjectOf(target)}`, 'error'),
      ...clashing.map((path) =>
        line(
          `hint: ${path} changed again after that commit, so undoing it would conflict.`,
          'hint',
        ),
      ),
      line(
        'hint: revert the later commits first, or wait for conflict resolution in Act 3.',
        'hint',
      ),
    ];
    return failure(out);
  }

  // Put each changed file back to how it was before the commit, then stage it.
  for (const path of changed) {
    const previous = parentFiles.get(path);
    if (previous !== undefined) ws.writeFile(path, repo.readBlob(previous));
    else if (ws.fs.isFile(path)) ws.deleteFile(path);
  }
  stagePaths(ws, changed);
  if (args.flags.has('n')) return ok();

  const message = `Revert "${subjectOf(target)}"\n\nThis reverts commit ${id}.`;
  const { commit, branch } = recordCommit(ws, message);
  const changes = compareSides(
    snapshotSides(repo, headFiles),
    snapshotSides(repo, commit.files),
    true,
  );
  const counts = changes.map(lineCounts);
  return ok([
    line(`[${branch ?? 'detached HEAD'} ${shortId(commit.id)}] ${subjectOf(commit)}`),
    line(
      changeSummary(
        changes.length,
        counts.reduce((sum, count) => sum + count.insertions, 0),
        counts.reduce((sum, count) => sum + count.deletions, 0),
      ),
    ),
  ]);
}
