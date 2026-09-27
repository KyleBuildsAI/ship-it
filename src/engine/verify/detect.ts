import { parseOnelineLine } from './logOneline';
import { normalizePaste } from './normalize';
import { isStatusLongLine } from './statusLong';
import { parseShortBranch, parseShortEntry } from './statusShort';

export type PasteKind = 'status-short' | 'status-long' | 'log-oneline' | 'unknown';

// Flags that switch `git status` to the two-column format: -s (alone or combined, as in
// -sb), --short, and --porcelain (whose v1 layout is the same).
const SHORT_FLAG = /^(?:-[a-z]*s[a-z]*|--short|--porcelain(?:=v1)?)$/;

/** True for a typed command like `git status -s` or `git status --porcelain`. */
function isShortStatusCommand(command: string): boolean {
  const [program, subcommand, ...flags] = command.split(/\s+/);
  return (
    program === 'git' && subcommand === 'status' && flags.some((flag) => SHORT_FLAG.test(flag))
  );
}

function looksLikeStatusShort(lines: readonly string[]): boolean {
  const [first = '', ...rest] = lines;
  const entries = parseShortBranch(first) === null ? lines : rest;
  return entries.every((line) => parseShortEntry(line) !== null);
}

function looksLikeLogOneline(lines: readonly string[]): boolean {
  const parsed = lines.map(parseOnelineLine);
  return parsed.every((line) => line !== null) && parsed.some((line) => line !== 'graph');
}

/**
 * Works out which command produced a paste, so the game can pick the right parser (and
 * tell Kyle when he pasted the wrong thing). Long status needs just one line only it
 * prints, because it can include lines we don't know, like rebase progress. The short
 * status and log formats are stricter: every line has to fit.
 */
export function detectPasteKind(text: string): PasteKind {
  const { lines, command } = normalizePaste(text);
  const content = lines.filter((line) => line !== '');

  // A clean `git status --short` prints nothing, so only the copied prompt can say what ran.
  if (content.length === 0) {
    return command !== null && isShortStatusCommand(command) ? 'status-short' : 'unknown';
  }
  if (content.some(isStatusLongLine)) return 'status-long';
  if (looksLikeStatusShort(content)) return 'status-short';
  if (looksLikeLogOneline(content)) return 'log-oneline';
  return 'unknown';
}
