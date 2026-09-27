import type { Tone } from '../../engine/git/cli/output';

/**
 * ANSI color codes for each output tone, following git's own color choices so the
 * terminal looks like real git: staged in green, unstaged and untracked in red, hunk
 * headers in cyan, commit ids in yellow.
 */
const ANSI: Record<Tone, string> = {
  plain: '',
  error: '\x1b[31m',
  hint: '\x1b[33m',
  staged: '\x1b[32m',
  unstaged: '\x1b[31m',
  untracked: '\x1b[31m',
  added: '\x1b[32m',
  removed: '\x1b[31m',
  hunk: '\x1b[36m',
  meta: '\x1b[1m',
  commit: '\x1b[33m',
};

const RESET = '\x1b[0m';

/** One output line, colored and ready for xterm (which needs \r\n, not just \n). */
export function colorize(text: string, tone: Tone): string {
  const code = ANSI[tone];
  const body = text.replace(/\n/g, '\r\n');
  return code === '' ? body : `${code}${body}${RESET}`;
}
