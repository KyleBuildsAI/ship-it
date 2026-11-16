import { describe, expect, it } from 'vitest';
import { answerFlags, bugAtRow, checkFlags, flaggableRows, type ReviewFlag } from './codeReview';
import { sampleReviewCard as card } from './sample.test-codeReview';

/*
 * The sample card's diff: row 3 drops the permission check (security), rows 6 and 8-10
 * wrap the save in a catch that swallows its error (error-handling), and rows 4, 5 and 7
 * are fine.
 */

describe('the rows a review can flag', () => {
  it('are exactly the changed rows, counted from 1 as the gutter shows them', () => {
    expect(flaggableRows(card)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('belong to a bug, or to none when the row is fine', () => {
    expect(bugAtRow(card, 3)?.id).toBe('dropped-check');
    expect(bugAtRow(card, 9)?.id).toBe('quiet-failure');
    expect(bugAtRow(card, 4)).toBeUndefined();
  });
});

describe('checking a review', () => {
  it('is right when every bug is found with one of its problems', () => {
    const check = checkFlags(card, [
      { row: 3, issue: 'security' },
      { row: 9, issue: 'error-handling' },
    ]);
    expect(check).toEqual({
      verdicts: [
        { row: 3, verdict: 'found' },
        { row: 9, verdict: 'found' },
      ],
      missedBugIds: [],
      right: true,
    });
  });

  it('names a bug left unflagged', () => {
    const check = checkFlags(card, [{ row: 3, issue: 'security' }]);
    expect(check?.missedBugIds).toEqual(['quiet-failure']);
    expect(check?.right).toBe(false);
  });

  it('calls a flag on a fine row a false flag, and the right row with another problem wrong', () => {
    const check = checkFlags(card, [
      { row: 3, issue: 'logic' },
      { row: 5, issue: 'scope' },
      { row: 9, issue: 'error-handling' },
    ]);
    expect(check?.verdicts).toEqual([
      { row: 3, verdict: 'wrong-issue' },
      { row: 5, verdict: 'fine' },
      { row: 9, verdict: 'found' },
    ]);
    // A bug flagged with the wrong problem isn't found yet.
    expect(check?.missedBugIds).toEqual(['dropped-check']);
    expect(check?.right).toBe(false);
  });

  it('is still wrong when every bug is found but a fine row is flagged too', () => {
    const check = checkFlags(card, [
      { row: 3, issue: 'security' },
      { row: 7, issue: 'error-handling' },
      { row: 9, issue: 'error-handling' },
    ]);
    expect(check?.missedBugIds).toEqual([]);
    expect(check?.right).toBe(false);
  });

  it('takes several flags on one bug, in any order', () => {
    const flags: ReviewFlag[] = [
      { row: 10, issue: 'error-handling' },
      { row: 3, issue: 'security' },
      { row: 6, issue: 'error-handling' },
    ];
    const check = checkFlags(card, flags);
    expect(check?.right).toBe(true);
    expect(check?.verdicts.map((verdict) => verdict.row)).toEqual([3, 6, 10]);
    expect(checkFlags(card, [...flags].reverse())).toEqual(check);
  });

  it('has nothing to check while a flag has no problem picked', () => {
    expect(
      checkFlags(card, [
        { row: 3, issue: 'security' },
        { row: 9, issue: null },
      ]),
    ).toBeNull();
  });

  it('can check no flags at all, and then every bug is missed', () => {
    expect(checkFlags(card, [])).toEqual({
      verdicts: [],
      missedBugIds: ['dropped-check', 'quiet-failure'],
      right: false,
    });
  });
});

describe('the answer flags', () => {
  it("are each bug's first row with its first problem, and they pass", () => {
    const flags = answerFlags(card);
    expect(flags).toEqual([
      { row: 3, issue: 'security' },
      { row: 6, issue: 'error-handling' },
    ]);
    expect(checkFlags(card, flags)?.right).toBe(true);
  });
});
