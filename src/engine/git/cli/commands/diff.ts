import type { Workspace } from '../../../workspace';
import { parseArgs } from '../args';
import { compareSides, formatFileChange, formatStat, type Side } from '../diffFormat';
import { line, ok, type CommandResult } from '../output';
import { matchPathspec, type CommandContext } from '../pathspec';
import { resolveOrExplain, snapshotSides, workingSides } from '../revisions';

type Area = Map<string, Side>;

interface Comparison {
  before: Area;
  after: Area;
  /** Renames are only detected between snapshots, as `git diff` does by default. */
  detectRenames: boolean;
}

/** Picks the two areas to compare from the revisions typed and the --staged flag. */
function chooseComparison(
  ws: Workspace,
  revisions: readonly string[],
  staged: boolean,
): Comparison | CommandResult {
  const repo = ws.requireRepo();
  const commitArea = (revision: string): Area | CommandResult => {
    const id = resolveOrExplain(repo, revision);
    return typeof id === 'string'
      ? snapshotSides(repo, repo.getCommit(id)?.files ?? new Map())
      : id;
  };
  const index = () => snapshotSides(repo, repo.indexEntries());

  const [first, second] = revisions;
  if (first !== undefined && second !== undefined) {
    const before = commitArea(first);
    if (!(before instanceof Map)) return before;
    const after = commitArea(second);
    if (!(after instanceof Map)) return after;
    return { before, after, detectRenames: true };
  }
  if (first !== undefined || staged) {
    // Before the first commit, --staged compares against an empty snapshot.
    const unborn = first === undefined && repo.headCommitId() === null;
    const before = unborn ? new Map<string, Side>() : commitArea(first ?? 'HEAD');
    if (!(before instanceof Map)) return before;
    const tracked = new Set([...before.keys(), ...repo.indexEntries().keys()]);
    return { before, after: staged ? index() : workingSides(ws, tracked), detectRenames: staged };
  }
  const before = index();
  return { before, after: workingSides(ws, before.keys()), detectRenames: false };
}

/**
 * `git diff` compares two areas line by line:
 * - `git diff`: Loading Dock (index) vs Workbench, i.e. edits not staged yet
 * - `git diff --staged`: last commit vs Loading Dock, i.e. what `git commit` will record
 * - `git diff <rev>`, `git diff <a> <b>`, `git diff a..b`: any commits
 */
export function diffCommand(
  ws: Workspace,
  ctx: CommandContext,
  argv: readonly string[],
): CommandResult {
  const args = parseArgs(argv, [
    { names: ['staged', 'cached'] },
    { names: ['stat'] },
    { names: ['name-only'] },
  ]);
  if (args.unknown.length > 0) {
    return {
      lines: [line(`error: invalid option: ${args.unknown[0] ?? ''}`, 'error')],
      exitCode: 129,
    };
  }
  const repo = ws.requireRepo();

  // Each word is a revision if it resolves, otherwise a path if it names one.
  const knownPaths = [
    ...repo.indexEntries().keys(),
    ...repo.headFiles().keys(),
    ...ws.fs.allFiles(),
  ];
  const revisions: string[] = [];
  const pathspecs = [...(args.afterDoubleDash ?? [])];
  for (const word of args.positional) {
    const range = word.split('..');
    if (range.length === 2 && range.every((part) => part !== '')) {
      revisions.push(...range);
      continue;
    }
    const resolved = resolveOrExplain(repo, word);
    if (typeof resolved === 'string') revisions.push(word);
    else if ((matchPathspec(ctx, word, knownPaths)?.length ?? 0) > 0) pathspecs.push(word);
    else return resolved;
  }

  const comparison = chooseComparison(ws, revisions, args.flags.has('staged'));
  if (!('before' in comparison)) return comparison;
  let changes = compareSides(comparison.before, comparison.after, comparison.detectRenames);

  if (pathspecs.length > 0) {
    const changedPaths = changes.flatMap((change) => [change.oldPath, change.newPath]);
    const wanted = new Set(
      pathspecs.flatMap((spec) => matchPathspec(ctx, spec, changedPaths) ?? []),
    );
    changes = changes.filter((change) => wanted.has(change.oldPath) || wanted.has(change.newPath));
  }

  if (args.flags.has('name-only')) return ok(changes.map((change) => line(change.newPath)));
  if (args.flags.has('stat')) return ok(formatStat(changes));
  return ok(changes.flatMap(formatFileChange));
}
