import { baseName, joinPath, parentDir } from '../../../fs/paths';
import { line, type OutputLine } from '../../../git/cli/output';
import { display, resolveExisting, toCanonical } from '../../../machine/winPath';
import type { ShellResult } from '../../shell';
import type { Choice } from '../confirm';
import type { Cmdlet, CommandContext } from '../registry';
import { hasWildcard, wildcard } from '../wildcard';

interface Options {
  readonly recurse: boolean;
  readonly force: boolean;
  /** Set by answering A or L: the rest of the questions answer themselves. */
  readonly remembered: Choice | null;
}

/** What's left to do: a path as typed (resolved when its turn comes), or a found item. */
type Step = { readonly typed: string; readonly literal: boolean } | { readonly path: string };

const ACCESS =
  'You do not have sufficient access rights to perform this operation or the item is hidden, system, or read only.';

/** Parameters PowerShell has that this sandbox refuses rather than quietly ignores. */
const NOT_YET = ['Filter', 'Include', 'Exclude', 'Credential', 'Stream'];

/**
 * Remove-Item (rm, del, erase, rd, rmdir, ri): deletes files and folders, and with Env:
 * a variable in this tab. A folder with things in it asks first, as PowerShell does,
 * unless -Recurse says so up front. Wildcards pick every match; no match is no error.
 * Paths are dealt with in the order typed, so errors come out in that order too.
 */
export const REMOVE_ITEM: Cmdlet = {
  spec: {
    name: 'Remove-Item',
    // All of PowerShell's parameters, in its order, so -f is ambiguous as it is there.
    parameters: [
      { name: 'Path', type: 'string[]', position: 0 },
      { name: 'LiteralPath', type: 'string[]', aliases: ['PSPath', 'LP'] },
      { name: 'Filter', type: 'string' },
      { name: 'Include', type: 'string[]' },
      { name: 'Exclude', type: 'string[]' },
      { name: 'Recurse', type: 'switch' },
      { name: 'Force', type: 'switch' },
      { name: 'Credential', type: 'string' },
      { name: 'Stream', type: 'string[]', provider: true },
    ],
  },
  run: (context, bound) => {
    const missing = NOT_YET.find((name) => bound.has(name));
    if (missing !== undefined)
      return {
        lines: [line(`This sandbox doesn't run Remove-Item -${missing} yet.`, 'error')],
        exitCode: 1,
      };
    const steps: Step[] = [
      ...(bound.texts('Path') ?? []).map((typed) => ({ typed, literal: false })),
      ...(bound.texts('LiteralPath') ?? []).map((typed) => ({ typed, literal: true })),
    ];
    if (steps.length === 0)
      return {
        lines: [
          failure(
            'Cannot process command because of one or more missing mandatory parameters: Path.',
          ),
        ],
        exitCode: 1,
      };
    const options = {
      recurse: bound.flag('Recurse'),
      force: bound.flag('Force'),
      remembered: null,
    };
    return removeAll(context, steps, options, []);
  },
};

/** Works through the steps, stopping to ask at a folder with children. */
function removeAll(
  context: CommandContext,
  steps: readonly Step[],
  options: Options,
  lines: OutputLine[],
): ShellResult {
  const { machine } = context;
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if (step === undefined) break;
    if ('typed' in step) {
      const found = expand(context, step, options.force, lines);
      // Its items go next, ahead of the paths typed after it.
      if (found.length > 0)
        return removeAll(context, [...found, ...steps.slice(index + 1)], options, lines);
      continue;
    }
    const { path } = step;
    if (inUse(context, path)) {
      lines.push(failure(`Cannot remove the item at '${display(path)}' because it is in use.`));
      continue;
    }
    const hasChildren = machine.drive.isDir(path) && machine.drive.listDir(path).length > 0;
    if (!hasChildren || options.recurse || options.remembered === 'yesToAll') {
      lines.push(...removeTree(context, path, options.force));
      continue;
    }
    if (options.remembered === 'noToAll') continue;
    const rest = steps.slice(index + 1);
    context.confirm({
      message: `The item at ${display(path)} has children and the Recurse parameter was not specified. If you continue, all children will be removed with the item. Are you sure you want to continue?`,
      answer: (choice) => {
        const removed = choice === 'yes' || choice === 'yesToAll';
        const remembered = choice === 'yesToAll' || choice === 'noToAll' ? choice : null;
        const after = removed ? removeTree(context, path, options.force) : [];
        return removeAll(context, rest, { ...options, remembered }, after);
      },
    });
    break;
  }
  return { lines, exitCode: lines.length > 0 ? 1 : 0 };
}

/** A typed path's items, or an Env: variable removed; errors go straight onto `lines`. */
function expand(
  context: CommandContext,
  step: { readonly typed: string; readonly literal: boolean },
  force: boolean,
  lines: OutputLine[],
): Step[] {
  const { machine, session } = context;
  const env = /^env:\\?(.+)$/i.exec(step.typed);
  if (env) {
    const name = env[1] ?? '';
    if (session.env.get(name) === null)
      lines.push(failure(`Cannot find path 'Env:\\${name}' because it does not exist.`));
    else machine.setEnv('session', name, null, { session: session.id });
    return [];
  }
  const target = toCanonical(step.typed, { cwd: session.cwd, home: machine.home });
  if (!target.ok) {
    lines.push(
      failure(
        'drive' in target
          ? `Cannot find drive. A drive with the name '${target.drive}' does not exist.`
          : `Cannot find path '${target.network}' because it does not exist.`,
      ),
    );
    return [];
  }
  const last = baseName(target.path);
  if (step.literal || !hasWildcard(last)) {
    const found = resolveExisting(machine.drive, target.path);
    if (found !== null) return [{ path: found }];
    lines.push(failure(`Cannot find path '${display(target.path)}' because it does not exist.`));
    return [];
  }
  const folder = resolveExisting(machine.drive, parentDir(target.path));
  // A missing folder is an error, but a file standing in for one just matches nothing
  // (checked in 7.6.6 with nope\*.txt and a.txt\*.txt).
  if (folder === null) {
    lines.push(
      failure(`Cannot find path '${display(parentDir(target.path))}' because it does not exist.`),
    );
    return [];
  }
  if (!machine.drive.isDir(folder)) return [];
  const pattern = wildcard(last);
  return machine.drive
    .listDir(folder)
    .map((entry) => joinPath(folder, entry.name))
    .filter((path) => pattern.test(baseName(path)) && (force || !machine.drive.isHidden(path)))
    .map((path) => ({ path }));
}

/**
 * PowerShell won't delete the folder it stands in, or one above it, or your home folder
 * (Windows keeps files open in it). Another tab's folder doesn't count: Set-Location
 * doesn't move the pwsh process, so nothing holds the folder (checked in 7.6).
 */
function inUse({ machine, session }: CommandContext, path: string): boolean {
  const holds = (folder: string) => folder === path || folder.startsWith(`${path}/`);
  return path === '' || holds(session.cwd) || holds(machine.home);
}

/**
 * Deletes an item and everything in it, children first. Without -Force, a hidden or
 * read-only item stays, with PowerShell's access error, and so does any folder it leaves
 * behind non-empty (checked in 7.6).
 */
function removeTree(
  context: Pick<CommandContext, 'ws' | 'machine'>,
  path: string,
  force: boolean,
): OutputLine[] {
  const { ws, machine } = context;
  const { drive } = machine;
  const blocked = !force && (drive.isHidden(path) || drive.isReadOnly(path));
  if (drive.isFile(path)) {
    if (blocked) return [failure(ACCESS)];
    drive.deleteFile(path);
    ws.events.emit({ type: 'fileChanged', path, change: 'deleted' });
    return [];
  }
  const lines: OutputLine[] = [];
  for (const entry of drive.listDir(path))
    lines.push(...removeTree(context, joinPath(path, entry.name), force));
  if (blocked) return [...lines, failure(ACCESS)];
  if (drive.listDir(path).length > 0)
    return [
      ...lines,
      failure(`Directory ${display(path)} cannot be removed because it is not empty.`),
    ];
  drive.removeDir(path, { recursive: false });
  return lines;
}

function failure(message: string): OutputLine {
  return line(`Remove-Item: ${message}`, 'error');
}
