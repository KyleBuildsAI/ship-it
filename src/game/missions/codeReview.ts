import { diffRows, isChangedRow } from './diffRows';
import type { CodeReviewCard, ReviewIssue } from './lessonSchema';

/*
 * Grading a code review card (DESIGN.md section 5, Lessons), as pure functions: which rows
 * can be flagged, and what a "Check review" makes of the flags. Only the rows flagged and
 * the problem named on each count, so it plays the same with or without Sage.
 */

/** A flagged row (counted from 1) and the problem named on it, or null before one is picked. */
export interface ReviewFlag {
  readonly row: number;
  readonly issue: ReviewIssue | null;
}

/**
 * What a check says of one flag: the bug's row with one of its problems (`found`), the
 * bug's row with another problem (`wrong-issue`), or a row that is fine (`fine`).
 */
export type FlagVerdict = 'found' | 'wrong-issue' | 'fine';

export interface RowVerdict {
  readonly row: number;
  readonly verdict: FlagVerdict;
}

/** The result of one "Check review". */
export interface FlagCheck {
  /** One per flag, in row order. */
  readonly verdicts: readonly RowVerdict[];
  /** The bugs no flag found, in the card's order. */
  readonly missedBugIds: readonly string[];
  /**
   * The missed bugs with no flag on any of their rows, in the card's order. A bug flagged
   * with another problem is missed but not unflagged: its row's verdict already says so.
   */
  readonly unflaggedBugIds: readonly string[];
  /** Every bug found, and nothing else flagged. */
  readonly right: boolean;
}

/** The rows a player can flag: the diff's added and removed lines, counted from 1. */
export function flaggableRows(card: CodeReviewCard): number[] {
  return diffRows(card.artifact.text).flatMap((line, index) =>
    isChangedRow(line) ? [index + 1] : [],
  );
}

/** The bug on a row, or undefined when the row is fine (or not a changed row at all). */
export function bugAtRow(
  card: CodeReviewCard,
  row: number,
): CodeReviewCard['bugs'][number] | undefined {
  return card.bugs.find((bug) => bug.rows.includes(row));
}

function verdictFor(card: CodeReviewCard, row: number, issue: ReviewIssue): FlagVerdict {
  const bug = bugAtRow(card, row);
  if (bug === undefined) return 'fine';
  return bug.issues.includes(issue) ? 'found' : 'wrong-issue';
}

/**
 * Checks a review's flags. A bug is found when any of its rows is flagged with one of its
 * problems, so several flags on one bug are fine, and their order doesn't matter. Null
 * while any flag has no problem picked: there's nothing to check yet.
 */
export function checkFlags(card: CodeReviewCard, flags: readonly ReviewFlag[]): FlagCheck | null {
  const verdicts: RowVerdict[] = [];
  for (const { row, issue } of [...flags].sort((a, b) => a.row - b.row)) {
    if (issue === null) return null;
    verdicts.push({ row, verdict: verdictFor(card, row, issue) });
  }
  const found = new Set(
    verdicts
      .filter((entry) => entry.verdict === 'found')
      .map((entry) => bugAtRow(card, entry.row)?.id),
  );
  const flagged = new Set(verdicts.map((entry) => bugAtRow(card, entry.row)?.id));
  const missed = card.bugs.filter((bug) => !found.has(bug.id));
  const missedBugIds = missed.map((bug) => bug.id);
  const unflaggedBugIds = missed.filter((bug) => !flagged.has(bug.id)).map((bug) => bug.id);
  const right = missedBugIds.length === 0 && verdicts.every((entry) => entry.verdict === 'found');
  return { verdicts, missedBugIds, unflaggedBugIds, right };
}

/** The flags a perfect review would set: each bug's first row with its first problem. */
export function answerFlags(card: CodeReviewCard): ReviewFlag[] {
  return card.bugs
    .flatMap((bug) => {
      const [row] = bug.rows;
      const [issue] = bug.issues;
      return row === undefined || issue === undefined ? [] : [{ row, issue }];
    })
    .sort((a, b) => a.row - b.row);
}
