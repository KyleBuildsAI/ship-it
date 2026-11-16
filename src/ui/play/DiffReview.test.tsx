import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { checkFlags, type FlagCheck, type ReviewFlag } from '../../game/missions/codeReview';
import { sampleReviewCard as card } from '../../game/missions/sample.test-codeReview';
import { DiffReview, ReviewCheckNote } from './DiffReview';

/*
 * The sample card's diff has 11 rows. Rows 3-10 are changed: 3 and 4 removed, 5-10 added.
 * Row 3 is the dropped permission check, rows 6 and 8-10 the swallowed error, and rows
 * 4, 5 and 7 are fine.
 */

const noop = () => undefined;

function review(
  flags: readonly ReviewFlag[] = [],
  check: FlagCheck | null = null,
  passed = false,
): string {
  return renderToStaticMarkup(
    <DiffReview
      card={card}
      flags={flags}
      check={check}
      passed={passed}
      onToggle={noop}
      onIssue={noop}
      onCheck={noop}
    />,
  );
}

/** The opening tag of the button for a diff row. */
function rowButton(markup: string, row: number): string {
  const tag = new RegExp(`<button[^>]*aria-label="Line ${String(row)},[^>]*>`).exec(markup);
  if (tag === null) throw new Error(`No button for row ${String(row)}.`);
  return tag[0];
}

/** The opening tag of the "Check review" button, or null when there is none. */
function checkButton(markup: string): string | null {
  return /<button[^>]*>Check review<\/button>/.exec(markup)?.[0] ?? null;
}

/** The markup's text, tags removed. */
function text(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&#x27;', "'")
    .replace(/\s+/g, ' ')
    .trim();
}

describe('the review diff', () => {
  it('numbers every row, and makes only the changed ones buttons', () => {
    const markup = review();
    const numbers = [...markup.matchAll(/class="review-diff__number">(\d+)</g)].map(([, n]) => n);
    expect(numbers).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
    expect(markup.match(/<button[^>]*aria-pressed="false"/g)).toHaveLength(8);
    expect(markup).not.toContain('aria-label="Line 1,');
    expect(markup).toContain('<span class="lesson-artifact__kind">Diff</span>');
    expect(markup).toContain('<span>PR #204 · src/docs/rename.ts</span>');
  });

  it('marks removed and added rows apart', () => {
    const markup = review();
    expect(rowButton(markup, 3)).toContain('review-diff__line--removed');
    expect(rowButton(markup, 4)).toContain('review-diff__line--removed');
    expect(rowButton(markup, 5)).toContain('review-diff__line--added');
    expect(rowButton(markup, 10)).toContain('review-diff__line--added');
    expect(markup.match(/review-diff__line--context/g)).toHaveLength(3);
  });

  it('opens six problem chips under a flagged row, its pick pressed', () => {
    const markup = review([{ row: 3, issue: 'security' }]);
    expect(rowButton(markup, 3)).toContain('aria-pressed="true"');
    expect(rowButton(markup, 3)).toContain('review-diff__line--flagged');
    const group = /<div[^>]*role="group"[^>]*aria-label="Problem on line 3"[^>]*>(.*?)<\/div>/.exec(
      markup,
    );
    expect(group?.[1]?.match(/<button/g)).toHaveLength(6);
    expect(group?.[1]?.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(group?.[1]).toContain('aria-pressed="true">Security hole</button>');
  });

  it('lets a review be checked once every flag has its problem, even with no flags', () => {
    expect(checkButton(review())).not.toContain('disabled');
    expect(text(review())).toContain('No lines flagged yet.');
    const unpicked = review([{ row: 9, issue: null }]);
    expect(checkButton(unpicked)).toContain('disabled');
    expect(text(unpicked)).toContain('Pick a problem for line 9.');
  });

  it('shows each verdict after a wrong check, and locks the row it found', () => {
    const flags: ReviewFlag[] = [
      { row: 3, issue: 'security' },
      { row: 5, issue: 'scope' },
      { row: 9, issue: 'logic' },
    ];
    const markup = review(flags, checkFlags(card, flags));
    const shown = text(markup);
    expect(shown).toContain(
      'Found. The edit check is gone: anyone who knows an id can rename any document.',
    );
    expect(shown).toContain(
      'Nothing wrong here. Fine: trimming spaces off a title is harmless cleanup.',
    );
    expect(shown).toContain('Right line, different problem.');
    expect(rowButton(markup, 3)).toContain('review-diff__line--found');
    expect(rowButton(markup, 3)).toContain('disabled');
    expect(rowButton(markup, 5)).toContain('review-diff__line--fine');
    expect(rowButton(markup, 5)).not.toContain('disabled');
    expect(rowButton(markup, 9)).toContain('review-diff__line--wrong-issue');
    // The found row's chips close; the wrong ones stay open to change.
    expect(markup).not.toContain('aria-label="Problem on line 3"');
    expect(markup).toContain('aria-label="Problem on line 9"');
  });

  it('shows every bug row found once the review passes, with nothing left to check', () => {
    const flags: ReviewFlag[] = [
      { row: 3, issue: 'security' },
      { row: 9, issue: 'error-handling' },
    ];
    const markup = review(flags, checkFlags(card, flags), true);
    for (const row of [3, 6, 8, 9, 10]) {
      expect(rowButton(markup, row)).toContain('review-diff__line--found');
    }
    for (const row of [4, 5, 7]) {
      expect(rowButton(markup, row)).not.toContain('review-diff__line--found');
      expect(rowButton(markup, row)).toContain('disabled');
    }
    // Each bug's note shows once, under its last row.
    expect(text(markup).match(/Found\./g)).toHaveLength(2);
    expect(checkButton(markup)).toBeNull();
    expect(markup).not.toContain('role="group"');
  });
});

describe('the note under a checked review', () => {
  const note = (check: FlagCheck | null, passed = false) =>
    text(renderToStaticMarkup(<ReviewCheckNote card={card} check={check} passed={passed} />));

  it('says nothing before a check', () => {
    expect(note(null)).toBe('');
  });

  it('counts the problems a check missed, with their clues, never their rows', () => {
    const missedOne = checkFlags(card, [{ row: 3, issue: 'security' }]);
    expect(note(missedOne)).toBe(
      '1 problem still unflagged. What happens now when the database is down?',
    );
  });

  it('says every problem was found once the review passes', () => {
    expect(note(checkFlags(card, []), true)).toBe('Both problems found.');
  });
});
