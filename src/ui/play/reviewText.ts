import type { FlagVerdict, ReviewFlag } from '../../game/missions/codeReview';
import type { ReviewIssue } from '../../game/missions/lessonSchema';

/*
 * Words for a code review card (DiffReview.tsx). They live apart from the components so
 * that file only exports components, which React's fast refresh needs.
 */

/** The problem chips, in plain words. */
export const ISSUE_LABELS: Record<ReviewIssue, string> = {
  logic: 'Wrong behaviour',
  security: 'Security hole',
  'error-handling': 'Hides errors',
  tests: 'Weakens tests',
  scope: 'Not asked for',
  'made-up': 'Made-up API',
};

/** A changed row as a screen reader says it: "Line 3, removed: return user;". */
export function rowLabel(row: number, line: string): string {
  const change = line.startsWith('+') ? 'added' : 'removed';
  return `Line ${String(row)}, ${change}: ${line.slice(1).trim()}`;
}

/** The line under the diff: how many rows are flagged, or the first still missing a problem. */
export function flagStatusText(flags: readonly ReviewFlag[]): string {
  const unpicked = flags.filter((flag) => flag.issue === null).map((flag) => flag.row);
  if (unpicked.length > 0) return `Pick a problem for line ${String(Math.min(...unpicked))}.`;
  if (flags.length === 0) return 'No lines flagged yet.';
  return `${String(flags.length)} ${flags.length === 1 ? 'line' : 'lines'} flagged.`;
}

/** What a check says on a flagged row, in bold before the row's note. */
export const VERDICT_TEXT: Record<FlagVerdict, string> = {
  found: 'Found.',
  'wrong-issue': 'Right line, different problem.',
  fine: 'Nothing wrong here.',
};

/** What a wrong check says under the diff. It counts misses and never points at their rows. */
export function unflaggedText(missed: number): string {
  if (missed === 0) return 'Every problem is found. Fix or remove the other flags.';
  return `${String(missed)} ${missed === 1 ? 'problem' : 'problems'} still unflagged.`;
}

/** What a passing check says under the diff. */
export function foundAllText(bugs: number): string {
  if (bugs === 1) return 'Found it.';
  if (bugs === 2) return 'Both problems found.';
  return `All ${String(bugs)} problems found.`;
}

/** The question over the review comments, once the flags pass. */
export const COMMENT_QUESTION = 'Request changes. Which comment do you send Otto?';
