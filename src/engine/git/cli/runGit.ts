import type { Workspace } from '../../workspace';
import { addCommand } from './commands/add';
import { diffCommand } from './commands/diff';
import { initCommand } from './commands/init';
import { mvCommand } from './commands/mv';
import { restoreCommand } from './commands/restore';
import { rmCommand } from './commands/rm';
import { statusCommand } from './commands/status';
import { fatal, line, ok, type CommandResult } from './output';
import type { CommandContext } from './pathspec';

type Command = (ws: Workspace, ctx: CommandContext, argv: readonly string[]) => CommandResult;

/** Commands that work before `git init`. Everything else needs a repository. */
const NO_REPO_NEEDED = new Set(['init']);

const COMMANDS: Record<string, Command> = {
  add: addCommand,
  diff: diffCommand,
  init: initCommand,
  mv: mvCommand,
  restore: restoreCommand,
  rm: rmCommand,
  status: statusCommand,
};

/** Real git commands this sandbox teaches in later Acts, so the reply can say so. */
const LATER = new Set([
  'branch',
  'switch',
  'checkout',
  'merge',
  'rebase',
  'cherry-pick',
  'stash',
  'tag',
  'bisect',
  'remote',
  'fetch',
  'pull',
  'push',
  'clone',
]);

export const GIT_VERSION = 'git version 2.47.0 (SHIP IT sandbox)';

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(above + 1, (row[j - 1] ?? 0) + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return row[b.length] ?? 0;
}

function helpText(): CommandResult {
  const names = Object.keys(COMMANDS).sort().join(', ');
  return ok([
    line('usage: git <command> [<args>]'),
    line(''),
    line(`Commands in this sandbox: ${names}`),
    line('Each mission introduces the commands it needs.', 'hint'),
  ]);
}

function unknownCommand(name: string): CommandResult {
  if (LATER.has(name)) {
    return {
      lines: [
        line(`git: '${name}' is a real git command, but you'll unlock it in a later Act.`, 'error'),
      ],
      exitCode: 1,
    };
  }
  const similar = Object.keys(COMMANDS).filter((command) => editDistance(name, command) <= 2);
  const lines = [line(`git: '${name}' is not a git command. See 'git --help'.`, 'error')];
  if (similar.length > 0) {
    lines.push(
      line(''),
      line(similar.length === 1 ? 'The most similar command is' : 'The most similar commands are'),
    );
    similar.forEach((command) => lines.push(line(`\t${command}`)));
  }
  return { lines, exitCode: 1 };
}

/**
 * Runs `git <argv...>` against a workspace. `argv` is everything after the word `git`,
 * already split into words by the shell (so quoted messages arrive as one argument).
 */
export function runGit(ws: Workspace, ctx: CommandContext, argv: readonly string[]): CommandResult {
  const [name, ...rest] = argv;
  if (name === undefined || name === 'help' || name === '--help' || name === '-h')
    return helpText();
  if (name === '--version' || name === 'version') return ok([line(GIT_VERSION)]);

  const command = COMMANDS[name];
  if (!command) return unknownCommand(name);
  if (!NO_REPO_NEEDED.has(name) && ws.repo === null) {
    return fatal('not a git repository (or any of the parent directories): .git');
  }
  return command(ws, ctx, rest);
}
