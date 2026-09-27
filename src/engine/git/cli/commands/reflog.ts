import type { Workspace } from '../../../workspace';
import { shortId } from '../../hash';
import { parseArgs } from '../args';
import { decorations } from '../logFormat';
import { fatal, line, ok, type CommandResult } from '../output';
import type { CommandContext } from '../pathspec';

/**
 * `git reflog`: every place HEAD has been, newest first, even commits no branch points
 * to anymore. `git reset --hard HEAD@{1}` walks back along these footprints.
 */
export function reflogCommand(
  ws: Workspace,
  _ctx: CommandContext,
  argv: readonly string[],
): CommandResult {
  const args = parseArgs(argv, [{ names: ['n', 'max-count'], takesValue: true }]);
  if (args.unknown.length > 0) return fatal(`unknown option '${args.unknown[0] ?? ''}'`);
  const words = args.positional[0] === 'show' ? args.positional.slice(1) : args.positional;
  if (words.some((word) => word !== 'HEAD')) {
    return fatal('the sandbox keeps a reflog for HEAD only');
  }

  const repo = ws.requireRepo();
  const entries = repo.reflog();
  if (entries.length === 0) {
    return fatal(
      `your current branch '${repo.currentBranch() ?? 'HEAD'}' does not have any commits yet`,
    );
  }
  const limit = Number(args.values.get('n')?.at(-1) ?? Infinity);
  return ok(
    entries.slice(0, limit).map((entry, index) => {
      const labels = decorations(repo, entry.to);
      const decoration = labels.length > 0 ? `(${labels.join(', ')}) ` : '';
      return line(
        `${shortId(entry.to)} ${decoration}HEAD@{${String(index)}}: ${entry.message}`,
        'commit',
      );
    }),
  );
}
