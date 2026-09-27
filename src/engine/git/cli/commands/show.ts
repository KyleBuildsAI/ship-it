import type { Workspace } from '../../../workspace';
import { splitLines } from '../../diff';
import { parseArgs } from '../args';
import { compareSides, formatFileChange, formatStat } from '../diffFormat';
import { fullHeader, onelineHeader } from '../logFormat';
import { fatal, line, ok, type CommandResult } from '../output';
import type { CommandContext } from '../pathspec';
import { resolveOrExplain, snapshotSides } from '../revisions';

/**
 * `git show`: one commit's message and the changes it introduced, or with
 * `git show HEAD~2:app.ts` the exact content of a file at that commit.
 */
export function showCommand(
  ws: Workspace,
  _ctx: CommandContext,
  argv: readonly string[],
): CommandResult {
  const args = parseArgs(argv, [{ names: ['oneline'] }, { names: ['stat'] }]);
  if (args.unknown.length > 0) return fatal(`unrecognized argument: ${args.unknown[0] ?? ''}`);
  const repo = ws.requireRepo();
  const target = args.positional[0] ?? 'HEAD';

  const colon = target.indexOf(':');
  if (colon !== -1) {
    // `rev:path` paths are relative to the project root, like in real git.
    const revision = target.slice(0, colon) || 'HEAD';
    const path = target.slice(colon + 1).replace(/\\/g, '/');
    const id = resolveOrExplain(repo, revision);
    if (typeof id !== 'string') return id;
    const blob = repo.getCommit(id)?.files.get(path);
    if (blob === undefined) return fatal(`path '${path}' does not exist in '${revision}'`);
    return ok(splitLines(repo.readBlob(blob)).map((text) => line(text.replace(/\n$/, ''))));
  }

  const id = resolveOrExplain(repo, target);
  if (typeof id !== 'string') return id;
  const commit = repo.getCommit(id);
  if (!commit) return fatal(`bad object ${target}`);
  const parentId = commit.parents[0];
  const parentFiles =
    parentId === undefined ? new Map() : (repo.getCommit(parentId)?.files ?? new Map());
  const changes = compareSides(
    snapshotSides(repo, parentFiles),
    snapshotSides(repo, commit.files),
    true,
  );

  const header = args.flags.has('oneline')
    ? [onelineHeader(repo, commit)]
    : [...fullHeader(repo, commit), line('')];
  const body = args.flags.has('stat') ? formatStat(changes) : changes.flatMap(formatFileChange);
  return ok([...header, ...body]);
}
