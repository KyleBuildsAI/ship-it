import { baseName, joinPath, parentDir } from '../../../fs/paths';
import { line, type OutputLine } from '../../../git/cli/output';
import { display, resolveExisting, toCanonical } from '../../../machine/winPath';
import type { ShellResult } from '../../shell';
import type { Choice } from '../confirm';
import { hasWildcard, wildcard } from '../wildcard';
import type { Cmdlet, CommandContext } from '../registry';

interface Options {
  readonly recurse: boolean;
  readonly force: boolean;
  /** Set by answering A or L: the rest of the questions answer themselves. */
  readonly remembered: Choice | null;
}

/**
 * Remove-Item (rm, del, erase, rd, rmdir, ri): deletes files and folders, and with Env:
 * a variable in this tab. A folder with things in it asks first, as PowerShell does,
 * unless -Recurse says so up front. Wildcards pick every match; no match is no error.
 */
export const REMOVE_ITEM: Cmdlet = {
  spec: {
    name: 'Remove-Item',
    parameters: [
      { name: 'Path', type: 'string[]', position: 0 },
      { name: 'Recurse', type: 'switch' },
      { name: 'Force', type: 'switch' },
    ],
  },
  run: (context, bound) => {
    const { machine, session } = context;
    const errors: OutputLine[] = [];
    const queue: string[] = [];
    const force = bound.flag('Force');
    for (const typed of bound.texts('Path') ?? []) {
      const env = /^env:\\?(.+)$/i.exec(typed);
      if (env) {
        const name = env[1] ?? '';
        if (session.env.get(name) === null)
          errors.push(failure(`Cannot find path 'Env:\\${name}' because it does not exist.`));
        else machine.setEnv('session', name, null, { session: session.id });
        continue;
      }
      const found = resolve(context, typed, force);
      if ('refused' in found) errors.push(failure(found.refused));
      else queue.push(...found.paths);
    }
    return removeAll(
      context,
      queue,
      { recurse: bound.flag('Recurse'), force, remembered: null },
      errors,
    );
  },
};

/** The items a typed path names: one, or every visible match of a wildcard. */
function resolve(
  { machine, session }: CommandContext,
  typed: string,
  force: boolean,
): { paths: string[] } | { refused: string } {
  const target = toCanonical(typed, { cwd: session.cwd, home: machine.home });
  if (!target.ok)
    return {
      refused:
        'drive' in target
          ? `Cannot find drive. A drive with the name '${target.drive}' does not exist.`
          : `Cannot find path '${target.network}' because it does not exist.`,
    };
  const last = baseName(target.path);
  if (!hasWildcard(last)) {
    const found = resolveExisting(machine.drive, target.path);
    return found === null
      ? { refused: `Cannot find path '${display(target.path)}' because it does not exist.` }
      : { paths: [found] };
  }
  const folder = resolveExisting(machine.drive, parentDir(target.path));
  if (folder === null || !machine.drive.isDir(folder)) return { paths: [] };
  const pattern = wildcard(last);
  const paths = machine.drive
    .listDir(folder)
    .map((entry) => joinPath(folder, entry.name))
    .filter((path) => pattern.test(baseName(path)) && (force || !machine.drive.isHidden(path)));
  return { paths };
}

/** Deletes each item in turn, stopping to ask at a folder with children. */
function removeAll(
  context: CommandContext,
  queue: readonly string[],
  options: Options,
  lines: OutputLine[],
): ShellResult {
  const { machine } = context;
  for (const [index, path] of queue.entries()) {
    const refusal = refuse(context, path, options.force);
    if (refusal !== null) {
      lines.push(failure(refusal));
      continue;
    }
    const hasChildren = machine.drive.isDir(path) && machine.drive.listDir(path).length > 0;
    if (!hasChildren || options.recurse || options.remembered === 'yesToAll') {
      remove(context, path);
      continue;
    }
    if (options.remembered === 'noToAll') continue;
    const rest = queue.slice(index + 1);
    context.confirm({
      message: `The item at ${display(path)} has children and the Recurse parameter was not specified. If you continue, all children will be removed with the item. Are you sure you want to continue?`,
      answer: (choice) => {
        if (choice === 'yes' || choice === 'yesToAll') remove(context, path);
        const remembered = choice === 'yesToAll' || choice === 'noToAll' ? choice : null;
        return removeAll(context, rest, { ...options, remembered }, []);
      },
    });
    break;
  }
  return { lines, exitCode: lines.length > 0 ? 1 : 0 };
}

/** Why an item can't go, or null. A folder a terminal stands in is in use, as on Windows. */
function refuse({ machine }: CommandContext, path: string, force: boolean): string | null {
  const inUse = machine
    .sessions()
    .some((tab) => tab.cwd === path || tab.cwd.startsWith(`${path}/`) || path === '');
  if (inUse) return `Cannot remove the item at '${display(path)}' because it is in use.`;
  if (machine.drive.isHidden(path) && !force)
    return 'You do not have sufficient access rights to perform this operation or the item is hidden, system, or read only.';
  return null;
}

function remove({ ws, machine }: CommandContext, path: string): void {
  if (machine.drive.isFile(path)) {
    machine.drive.deleteFile(path);
    ws.events.emit({ type: 'fileChanged', path, change: 'deleted' });
    return;
  }
  for (const file of machine.drive.allFiles(path))
    ws.events.emit({ type: 'fileChanged', path: file, change: 'deleted' });
  machine.drive.removeDir(path, { recursive: true });
}

function failure(message: string): OutputLine {
  return line(`Remove-Item: ${message}`, 'error');
}
