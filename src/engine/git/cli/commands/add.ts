import { relativePath, resolvePath } from '../../../fs/paths';
import type { Workspace } from '../../../workspace';
import { parseArgs } from '../args';
import { failure, fatal, line, ok, type CommandResult } from '../output';
import { matchPathspec, type CommandContext } from '../pathspec';
import { stagePaths } from '../staging';

/**
 * `git add`: move changes from the Workbench to the Loading Dock. Supports paths,
 * folders, `.`, globs, `-A` (everything, including deletions), `-u` (tracked files
 * only), and `-f` (add a file even though .gitignore excludes it).
 */
export function addCommand(
  ws: Workspace,
  ctx: CommandContext,
  argv: readonly string[],
): CommandResult {
  const args = parseArgs(argv, [
    { names: ['A', 'all'] },
    { names: ['u', 'update'] },
    { names: ['f', 'force'] },
  ]);
  if (args.unknown.length > 0) return fatal(`unknown option '${args.unknown[0] ?? ''}'`);

  const repo = ws.requireRepo();
  const specs = [...args.positional, ...(args.afterDoubleDash ?? [])];
  const all = args.flags.has('A');
  const updateOnly = args.flags.has('u');
  if (specs.length === 0 && !all && !updateOnly) {
    return ok([
      line('Nothing specified, nothing added.'),
      line("hint: Maybe you wanted to say 'git add .'?", 'hint'),
      line(
        'hint: Disable this message with "git config set advice.addEmptyPathspec false"',
        'hint',
      ),
    ]);
  }

  const candidates = [...ws.fs.allFiles(), ...repo.indexEntries().keys()];
  const ignore = ws.ignoreRules();
  const force = args.flags.has('f');
  const skipped = (path: string) =>
    !force && !repo.indexEntries().has(path) && ignore.isIgnored(path);

  // -A and -u with no paths cover the whole project, wherever you stand.
  const targets = new Set(specs.length === 0 ? candidates : []);
  const refusedIgnored: string[] = [];
  for (const spec of specs) {
    const matched = matchPathspec(ctx, spec, candidates);
    if (matched === null) return fatal(`'${spec}' is outside repository at '${ctx.displayRoot}'`);
    if (matched.length === 0) return fatal(`pathspec '${spec}' did not match any files`);
    matched.forEach((path) => targets.add(path));
    // Naming something that is entirely ignored is an error; sweeping past an ignored
    // file with `.` or a folder that also holds other files is not.
    const resolved = resolvePath(ctx.cwd, spec) ?? spec;
    if (resolved !== ctx.cwd && matched.every(skipped)) refusedIgnored.push(resolved);
  }

  const toStage = [...targets].filter(
    (path) => !skipped(path) && (!updateOnly || repo.indexEntries().has(path)),
  );

  stagePaths(ws, toStage.sort());

  if (refusedIgnored.length > 0) {
    return failure([
      line('The following paths are ignored by one of your .gitignore files:'),
      ...refusedIgnored.map((path) => line(relativePath(ctx.cwd, path))),
      line('hint: Use -f if you really want to add them.', 'hint'),
      line('hint: Disable this message with "git config set advice.addIgnoredFile false"', 'hint'),
    ]);
  }
  return ok();
}
