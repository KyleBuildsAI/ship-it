import { describe, expect, it } from 'vitest';
import { REVIEW_ISSUES } from '../../game/missions/lessonSchema';
import { flagStatusText, foundAllText, ISSUE_LABELS, rowLabel, unflaggedText } from './reviewText';

describe('the words on a code review card', () => {
  it('names each problem chip once', () => {
    const labels = REVIEW_ISSUES.map((issue) => ISSUE_LABELS[issue]);
    expect(labels).toEqual([
      'Wrong behaviour',
      'Security hole',
      'Hides errors',
      'Weakens tests',
      'Not asked for',
      'Made-up API',
    ]);
  });

  it('reads a row out with its number, its change and its code', () => {
    expect(rowLabel(3, '-  if (!canEdit(user, doc)) throw new Forbidden();')).toBe(
      'Line 3, removed: if (!canEdit(user, doc)) throw new Forbidden();',
    );
    expect(rowLabel(6, '+  try {')).toBe('Line 6, added: try {');
  });

  it('says how many lines are flagged, or which one still needs its problem', () => {
    expect(flagStatusText([])).toBe('No lines flagged yet.');
    expect(flagStatusText([{ row: 3, issue: 'security' }])).toBe('1 line flagged.');
    expect(
      flagStatusText([
        { row: 3, issue: 'security' },
        { row: 9, issue: 'error-handling' },
      ]),
    ).toBe('2 lines flagged.');
    expect(
      flagStatusText([
        { row: 9, issue: null },
        { row: 3, issue: 'security' },
        { row: 6, issue: null },
      ]),
    ).toBe('Pick a problem for line 6.');
  });

  it('counts the problems still unflagged, and the ones found', () => {
    expect(unflaggedText(1)).toBe('1 problem still unflagged.');
    expect(unflaggedText(2)).toBe('2 problems still unflagged.');
    // Every bug has a flag, but some flag is wrong (a false flag, or the wrong problem on a
    // bug's row): the rows say which.
    expect(unflaggedText(0)).toBe('Every problem is flagged. Fix or remove the wrong flags above.');
    expect(foundAllText(1)).toBe('Found it.');
    expect(foundAllText(2)).toBe('Both problems found.');
    expect(foundAllText(3)).toBe('All 3 problems found.');
  });
});
