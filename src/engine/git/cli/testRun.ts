import type { Workspace } from '../../workspace';
import { toText, type CommandResult } from './output';
import { runGit } from './runGit';

export const DISPLAY_ROOT = 'C:/Users/kyle/quillwork/app';

/** Runs a git command in tests. Arguments are passed pre-split, the way the shell will. */
export function git(ws: Workspace, args: string[], cwd = ''): CommandResult {
  return runGit(ws, { cwd, displayRoot: DISPLAY_ROOT }, args);
}

/** Runs a git command and returns its output as plain text. */
export function gitText(ws: Workspace, args: string[], cwd = ''): string {
  return toText(git(ws, args, cwd));
}
