import type { Workspace } from '../../../workspace';
import { parseArgs } from '../args';
import { fatal, line, ok, type CommandResult } from '../output';
import type { CommandContext } from '../pathspec';

export function initCommand(
  ws: Workspace,
  ctx: CommandContext,
  argv: readonly string[],
): CommandResult {
  const args = parseArgs(argv, [{ names: ['q', 'quiet'] }]);
  if (args.unknown.length > 0) return fatal(`unknown option '${args.unknown[0] ?? ''}'`);
  if (args.positional.length > 0 || ctx.cwd !== '') {
    // Real git would quietly create a second repository nested inside this one, a classic
    // mistake. The sandbox keeps exactly one repository, at the project root.
    return fatal(
      'this sandbox keeps one repository, at the project root',
      "run 'cd /' to go to the project root, then 'git init'",
    );
  }
  const { reinitialized } = ws.initRepo();
  if (args.flags.has('q')) return ok();
  const verb = reinitialized ? 'Reinitialized existing' : 'Initialized empty';
  return ok([line(`${verb} Git repository in ${ctx.displayRoot}/.git/`)]);
}
