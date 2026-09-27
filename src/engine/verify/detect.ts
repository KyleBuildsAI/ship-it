import { parseOnelineLine } from './logOneline';
import { normalizePaste } from './normalize';
import { isStatusLongLine } from './statusLong';
import { isShortStatusCommand, parseShortBranch, parseShortEntry } from './statusShort';

export type PasteKind = 'status-short' | 'status-long' | 'log-oneline' | 'unknown';

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
 * tell Kyle when he pasted the wrong thing). One line that only the long status prints
 * is enough to call a paste long status, because it can also hold lines we don't know,
 * like rebase progress. The short status and log formats are stricter: every line has
 * to fit.
 */
export function detectPasteKind(text: string): PasteKind {
  const { lines, command } = normalizePaste(text);
  const content = lines.filter((line) => line !== '');

  // A clean `git status --short` prints nothing, so only the copied command can say what ran.
  if (content.length === 0) {
    return command !== null && isShortStatusCommand(command) ? 'status-short' : 'unknown';
  }
  if (content.some(isStatusLongLine)) return 'status-long';
  if (looksLikeStatusShort(content)) return 'status-short';
  if (looksLikeLogOneline(content)) return 'log-oneline';
  return 'unknown';
}
