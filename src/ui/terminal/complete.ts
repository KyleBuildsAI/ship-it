import { joinPath, resolvePath } from '../../engine/fs/paths';
import type { Shell } from '../../engine/shell/shell';

export const SHELL_COMMANDS = [
  'cat',
  'cd',
  'clear',
  'code',
  'echo',
  'git',
  'help',
  'history',
  'ls',
  'mkdir',
  'pwd',
  'rm',
];

export const GIT_COMMANDS = [
  'add',
  'commit',
  'diff',
  'init',
  'log',
  'mv',
  'reflog',
  'reset',
  'restore',
  'revert',
  'rm',
  'show',
  'status',
];

function commonPrefix(options: readonly string[]): string {
  return options.reduce((prefix, option) => {
    let length = 0;
    while (length < prefix.length && prefix[length] === option[length]) length++;
    return prefix.slice(0, length);
  });
}

/** Picks the completion for `word` from `options`: the only match, or what all matches share. */
function completeFrom(word: string, options: readonly string[]): string | null {
  const matches = options.filter((option) => option.startsWith(word));
  if (matches.length === 0) return null;
  const completed = commonPrefix(matches);
  return completed === word && matches.length > 1 ? null : completed;
}

/**
 * Tab completion: the first word completes to a command, `git`'s second word to a git
 * command, and anything else to a file or folder name (folders get a trailing slash).
 */
export function completeLine(shell: Shell, beforeCursor: string): string | null {
  const words = beforeCursor.split(' ');
  const word = words.at(-1) ?? '';
  if (words.length === 1) return completeFrom(word, SHELL_COMMANDS);
  if (words.length === 2 && words[0] === 'git') return completeFrom(word, GIT_COMMANDS);

  const unified = word.replace(/\\/g, '/');
  const slash = unified.lastIndexOf('/');
  const typedDir = slash === -1 ? '' : unified.slice(0, slash + 1);
  const dir = resolvePath(shell.cwd, typedDir === '' ? '.' : typedDir);
  if (dir === null || !shell.ws.fs.isDir(dir)) return null;

  const names = shell.ws.fs
    .listDir(dir)
    .map((entry) => (entry.kind === 'dir' ? `${entry.name}/` : entry.name));
  const completed = completeFrom(unified.slice(slash + 1), names);
  return completed === null ? null : joinPath(typedDir.replace(/\/$/, ''), completed);
}
