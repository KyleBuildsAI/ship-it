import { resolvePath } from '../../../fs/paths';
import type { Workspace } from '../../../workspace';
import { parseArgs } from '../args';
import { failure, fatal, line, ok, type CommandResult, type OutputLine } from '../output';
import { matchPathspec, type CommandContext } from '../pathspec';

type Risk = 'both' | 'staged' | 'local';

const RISK_TEXT: Record<Risk, [singular: string, plural: string, hint: string]> = {
  both: [
    'the following file has staged content different from both the\nfile and the HEAD:',
    'the following files have staged content different from both the\nfile and the HEAD:',
    '(use -f to force removal)',
  ],
  staged: [
    'the following file has changes staged in the index:',
    'the following files have changes staged in the index:',
    '(use --cached to keep the file, or -f to force removal)',
  ],
  local: [
    'the following file has local modifications:',
    'the following files have local modifications:',
    '(use --cached to keep the file, or -f to force removal)',
  ],
};

/**
 * `git rm`: stop tracking files. Without `--cached` the files are deleted from disk too.
 * `git rm --cached .env` is how you untrack a secret you committed by mistake while
 * keeping the file on your machine. Refuses to throw away work unless forced.
 */
export function rmCommand(
  ws: Workspace,
  ctx: CommandContext,
  argv: readonly string[],
): CommandResult {
  const args = parseArgs(argv, [
    { names: ['cached'] },
    { names: ['r'] },
    { names: ['f', 'force'] },
    { names: ['q', 'quiet'] },
  ]);
  if (args.unknown.length > 0) return fatal(`unknown option '${args.unknown[0] ?? ''}'`);

  const repo = ws.requireRepo();
  const specs = [...args.positional, ...(args.afterDoubleDash ?? [])];
  if (specs.length === 0) return fatal('No pathspec was given. Which files should I remove?');

  const tracked = [...repo.indexEntries().keys()];
  const targets = new Set<string>();
  for (const spec of specs) {
    const matched = matchPathspec(ctx, spec, tracked);
    if (matched === null) return fatal(`'${spec}' is outside repository at '${ctx.displayRoot}'`);
    if (matched.length === 0) return fatal(`pathspec '${spec}' did not match any files`);
    const isFolder = !matched.includes(resolvePath(ctx.cwd, spec) ?? '');
    if (isFolder && !/[*?[]/.test(spec) && !args.flags.has('r')) {
      return fatal(`not removing '${spec}' recursively without -r`);
    }
    matched.forEach((path) => targets.add(path));
  }

  const cached = args.flags.has('cached');
  const head = repo.headFiles();
  const risks = new Map<Risk, string[]>();
  if (!args.flags.has('f')) {
    for (const path of targets) {
      const staged = repo.indexEntries().get(path);
      const stagedDiffers = staged !== head.get(path);
      const fileDiffers = ws.fs.isFile(path) && repo.idFor(ws.fs.readFile(path)) !== staged;
      let risk: Risk | null = null;
      if (stagedDiffers && fileDiffers) risk = 'both';
      else if (!cached && stagedDiffers) risk = 'staged';
      else if (!cached && fileDiffers) risk = 'local';
      if (risk) risks.set(risk, [...(risks.get(risk) ?? []), path]);
    }
  }
  if (risks.size > 0) {
    const lines: OutputLine[] = [];
    for (const [risk, paths] of risks) {
      const [singular, plural, hint] = RISK_TEXT[risk];
      lines.push(line(`error: ${paths.length === 1 ? singular : plural}`, 'error'));
      paths.forEach((path) => lines.push(line(`    ${path}`)));
      lines.push(line(hint, 'hint'));
    }
    return failure(lines);
  }

  const removed = [...targets].sort();
  for (const path of removed) {
    repo.removeFromIndex(path);
    if (!cached && ws.fs.isFile(path)) ws.deleteFile(path);
  }
  ws.events.emit({ type: 'staged', paths: removed });
  return ok(args.flags.has('q') ? [] : removed.map((path) => line(`rm '${path}'`)));
}
