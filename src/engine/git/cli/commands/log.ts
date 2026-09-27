import type { Workspace } from '../../../workspace';
import type { Repository } from '../../repository';
import type { Commit, ObjectId } from '../../types';
import { parseArgs } from '../args';
import { fullHeader, onelineHeader } from '../logFormat';
import { fatal, line, ok, type CommandResult, type OutputLine } from '../output';
import { matchPathspec, type CommandContext } from '../pathspec';
import { resolveOrExplain } from '../revisions';

/** Every commit reachable from `start`, newest first, the order `git log` shows. */
function history(repo: Repository, start: ObjectId): Commit[] {
  const seen = new Map<ObjectId, Commit>();
  const queue = [start];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    const commit = repo.getCommit(id);
    if (!commit || seen.has(id)) continue;
    seen.set(id, commit);
    queue.push(...commit.parents);
  }
  return [...seen.values()].sort((a, b) => b.timestamp - a.timestamp);
}

/** True when the commit changed one of `paths` compared with its first parent. */
function touches(repo: Repository, commit: Commit, paths: ReadonlySet<string>): boolean {
  const parentId = commit.parents[0];
  const parent =
    parentId === undefined
      ? new Map<string, string>()
      : (repo.getCommit(parentId)?.files ?? new Map());
  return [...paths].some((path) => commit.files.get(path) !== parent.get(path));
}

/**
 * `git log`: walk back through history from HEAD (or any revision). `--oneline` for one
 * line per commit, `--graph` to draw the path, `-n 3` or `-3` to limit, `-- path` to see
 * only commits that changed a file.
 */
export function logCommand(
  ws: Workspace,
  ctx: CommandContext,
  argv: readonly string[],
): CommandResult {
  const args = parseArgs(argv, [
    { names: ['oneline'] },
    { names: ['graph'] },
    { names: ['n', 'max-count'], takesValue: true },
  ]);
  if (args.unknown.length > 0) return fatal(`unrecognized argument: ${args.unknown[0] ?? ''}`);
  const repo = ws.requireRepo();

  const revision = args.positional[0] ?? 'HEAD';
  const start = resolveOrExplain(repo, revision);
  if (typeof start !== 'string') return start;

  let commits = history(repo, start);
  const pathspecs = [...args.positional.slice(1), ...(args.afterDoubleDash ?? [])];
  if (pathspecs.length > 0) {
    const allPaths = commits.flatMap((commit) => [...commit.files.keys()]);
    const paths = new Set(pathspecs.flatMap((spec) => matchPathspec(ctx, spec, allPaths) ?? []));
    commits = commits.filter((commit) => touches(repo, commit, paths));
  }
  const limit = Number(args.values.get('n')?.at(-1) ?? Infinity);
  if (Number.isNaN(limit)) return fatal(`'${args.values.get('n')?.at(-1) ?? ''}': not an integer`);
  commits = commits.slice(0, limit);

  const graph = args.flags.has('graph');
  const out: OutputLine[] = [];
  commits.forEach((commit, index) => {
    const block = args.flags.has('oneline')
      ? [onelineHeader(repo, commit)]
      : fullHeader(repo, commit);
    const isLast = index === commits.length - 1;
    if (!args.flags.has('oneline') && !isLast) block.push(line(''));
    block.forEach((output, row) => {
      // A straight line of history: `*` marks each commit, `|` joins it to the next one.
      const rail = row === 0 ? '* ' : isLast ? '  ' : '| ';
      out.push(graph ? line(`${rail}${output.text}`.trimEnd(), output.tone) : output);
    });
  });
  return ok(out);
}
