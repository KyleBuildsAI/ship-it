import { baseName, isWithin, joinPath, resolvePath } from '../../../fs/paths';
import type { Workspace } from '../../../workspace';
import { parseArgs } from '../args';
import { fatal, ok, type CommandResult } from '../output';
import type { CommandContext } from '../pathspec';

/**
 * `git mv`: rename or move tracked files, on disk and in the index in one step, so
 * `git status` shows a rename instead of a deleted file plus an untracked one.
 */
export function mvCommand(
  ws: Workspace,
  ctx: CommandContext,
  argv: readonly string[],
): CommandResult {
  const args = parseArgs(argv, [{ names: ['f', 'force'] }]);
  if (args.unknown.length > 0) return fatal(`unknown option '${args.unknown[0] ?? ''}'`);

  const repo = ws.requireRepo();
  const words = [...args.positional, ...(args.afterDoubleDash ?? [])];
  const destination = words.at(-1);
  const sources = words.slice(0, -1);
  if (destination === undefined || sources.length === 0) {
    return fatal('usage: git mv [<options>] <source>... <destination>');
  }

  const destinationPath = resolvePath(ctx.cwd, destination);
  if (destinationPath === null) return fatal(`'${destination}' is outside repository`);
  const intoFolder = ws.fs.isDir(destinationPath);
  if (sources.length > 1 && !intoFolder) {
    return fatal(`destination '${destination}' is not a directory`);
  }

  const moves: [from: string, to: string][] = [];
  for (const source of sources) {
    const describe = `source=${source}, destination=${destination}`;
    const sourcePath = resolvePath(ctx.cwd, source);
    if (sourcePath === null || !ws.fs.exists(sourcePath)) return fatal(`bad source, ${describe}`);
    const target = intoFolder ? joinPath(destinationPath, baseName(sourcePath)) : destinationPath;

    if (ws.fs.isDir(sourcePath)) {
      const inside = [...repo.indexEntries().keys()].filter((path) => isWithin(path, sourcePath));
      if (inside.length === 0) return fatal(`source directory is empty, ${describe}`);
      if (ws.fs.exists(target)) return fatal(`destination exists, ${describe}`);
      inside.forEach((path) => moves.push([path, target + path.slice(sourcePath.length)]));
    } else {
      if (!repo.indexEntries().has(sourcePath)) {
        return fatal(`not under version control, ${describe}`);
      }
      if (ws.fs.exists(target) && !args.flags.has('f')) {
        return fatal(`destination exists, ${describe}`);
      }
      moves.push([sourcePath, target]);
    }
  }

  for (const [from, to] of moves) {
    const staged = repo.indexEntries().get(from);
    if (ws.fs.isFile(from)) {
      ws.writeFile(to, ws.fs.readFile(from));
      ws.deleteFile(from);
    }
    repo.removeFromIndex(from);
    if (staged !== undefined) repo.setIndexEntry(to, staged);
  }
  for (const source of sources) {
    const sourcePath = resolvePath(ctx.cwd, source) ?? '';
    if (ws.fs.isDir(sourcePath) && ws.fs.allFiles(sourcePath).length === 0) {
      ws.fs.removeDir(sourcePath, { recursive: true });
    }
  }
  ws.events.emit({ type: 'staged', paths: moves.flat() });
  return ok();
}
