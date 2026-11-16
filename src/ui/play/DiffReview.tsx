import {
  bugAtRow,
  type FlagCheck,
  type FlagVerdict,
  type ReviewFlag,
} from '../../game/missions/codeReview';
import { diffRows, isChangedRow } from '../../game/missions/diffRows';
import {
  REVIEW_ISSUES,
  type CodeReviewCard,
  type ReviewIssue,
} from '../../game/missions/lessonSchema';
import { hangingIndent } from './artifactLines';
import { ARTIFACT_LABELS } from './lessonText';
import {
  flagStatusText,
  foundAllText,
  ISSUE_LABELS,
  rowLabel,
  unflaggedText,
  VERDICT_TEXT,
} from './reviewText';

/*
 * A code review card's diff (DESIGN.md section 5, Lessons): numbered rows, the changed
 * ones buttons that flag them, a strip of problem chips under each flag, and "Check
 * review". It only draws what it's given; the lesson's run decides what each click does.
 * Rows and chips are plain buttons reached with Tab, never an arrow-key list: arrow keys
 * walk the avatar.
 */

/** How a changed row looks: unflagged, flagged and not yet checked, or a check's verdict. */
type RowLook = 'open' | 'flagged' | FlagVerdict;

// Every verdict also has its words under the row, so no state relies on colour alone.
const MARKS: Record<RowLook, string> = {
  open: '',
  flagged: '⚑',
  found: '✓',
  'wrong-issue': '⚑',
  fine: '✗',
};

interface RowState {
  readonly look: RowLook;
  /** The flag on the row, while it can still change. */
  readonly flag: ReviewFlag | null;
  /** A found row is locked, and so is every row once the review passes. */
  readonly locked: boolean;
  /** The verdict to show under the row, with its note when it has one. */
  readonly note: { readonly verdict: FlagVerdict; readonly detail: string | null } | null;
}

function verdictDetail(card: CodeReviewCard, row: number, verdict: FlagVerdict): string | null {
  if (verdict === 'found') return bugAtRow(card, row)?.note ?? null;
  if (verdict === 'fine') return card.fine.find((entry) => entry.row === row)?.note ?? null;
  return null;
}

function rowState(
  card: CodeReviewCard,
  row: number,
  { flags, check, passed }: Pick<DiffReviewProps, 'flags' | 'check' | 'passed'>,
): RowState {
  if (passed) {
    // Every row of every bug shows found, and each bug's note sits under its last row.
    const bug = bugAtRow(card, row);
    if (bug === undefined) return { look: 'open', flag: null, locked: true, note: null };
    const last = Math.max(...bug.rows) === row;
    const note = last ? { verdict: 'found' as const, detail: bug.note } : null;
    return { look: 'found', flag: null, locked: true, note };
  }
  const flag = flags.find((entry) => entry.row === row) ?? null;
  if (flag === null) return { look: 'open', flag, locked: false, note: null };
  const verdict = check?.verdicts.find((entry) => entry.row === row)?.verdict;
  if (verdict === undefined) return { look: 'flagged', flag, locked: false, note: null };
  const note = { verdict, detail: verdictDetail(card, row, verdict) };
  if (verdict === 'found') return { look: verdict, flag: null, locked: true, note };
  return { look: verdict, flag, locked: false, note };
}

/** A row's number, its mark, and its code, which wraps hanging in past the + or -. */
function RowText({ row, line, mark }: { row: number; line: string; mark: string }) {
  const hang = hangingIndent('diff', line);
  return (
    <>
      <span className="review-diff__number">{row}</span>
      <span className="review-diff__mark" aria-hidden="true">
        {mark}
      </span>
      <span
        className="review-diff__code"
        style={{ paddingLeft: `${String(hang)}ch`, textIndent: `${String(-hang)}ch` }}
      >
        {line}
      </span>
    </>
  );
}

/** The six problem chips under a flagged row. */
function IssueChips({ flag, onIssue }: { flag: ReviewFlag; onIssue: DiffReviewProps['onIssue'] }) {
  return (
    <div className="review-chips" role="group" aria-label={`Problem on line ${String(flag.row)}`}>
      {REVIEW_ISSUES.map((issue) => (
        <button
          key={issue}
          type="button"
          className="review-chip"
          aria-pressed={flag.issue === issue}
          onClick={() => {
            onIssue(flag.row, issue);
          }}
        >
          {ISSUE_LABELS[issue]}
        </button>
      ))}
    </div>
  );
}

function ChangedRow({
  row,
  line,
  state,
  onToggle,
  onIssue,
}: {
  row: number;
  line: string;
  state: RowState;
  onToggle: DiffReviewProps['onToggle'];
  onIssue: DiffReviewProps['onIssue'];
}) {
  const change = line.startsWith('+') ? 'added' : 'removed';
  const look = state.look === 'open' ? '' : ` review-diff__line--${state.look}`;
  return (
    <>
      <button
        type="button"
        className={`review-diff__line review-diff__line--${change}${look}`}
        aria-pressed={state.look !== 'open'}
        aria-label={rowLabel(row, line)}
        disabled={state.locked}
        onClick={() => {
          onToggle(row);
        }}
      >
        <RowText row={row} line={line} mark={MARKS[state.look]} />
      </button>
      {state.note === null ? null : (
        <p className="review-diff__note">
          <strong>{VERDICT_TEXT[state.note.verdict]}</strong>
          {state.note.detail === null ? null : ` ${state.note.detail}`}
        </p>
      )}
      {state.flag === null ? null : <IssueChips flag={state.flag} onIssue={onIssue} />}
    </>
  );
}

interface DiffReviewProps {
  readonly card: CodeReviewCard;
  /** The rows flagged so far, each with its problem once picked. */
  readonly flags: readonly ReviewFlag[];
  /** The last "Check review", without the rows edited since. */
  readonly check: FlagCheck | null;
  /** True once a check was right: the rows lock and the comments take over. */
  readonly passed: boolean;
  readonly onToggle: (row: number) => void;
  readonly onIssue: (row: number, issue: ReviewIssue) => void;
  readonly onCheck: () => void;
}

/**
 * The diff to review, captioned like an artifact. Until the review passes, a status line
 * and "Check review" sit under it; the button waits while a flag has no problem picked.
 */
export function DiffReview(props: DiffReviewProps) {
  const { card, flags, passed, onToggle, onIssue, onCheck } = props;
  const { artifact } = card;
  return (
    <>
      <figure className="review-diff">
        <figcaption>
          <span className="lesson-artifact__kind">{ARTIFACT_LABELS[artifact.kind]}</span>
          {artifact.label === undefined ? null : <span>{artifact.label}</span>}
        </figcaption>
        <ol className="review-diff__rows">
          {diffRows(artifact.text).map((line, index) => {
            const row = index + 1;
            return (
              <li key={row}>
                {isChangedRow(line) ? (
                  <ChangedRow
                    row={row}
                    line={line}
                    state={rowState(card, row, props)}
                    onToggle={onToggle}
                    onIssue={onIssue}
                  />
                ) : (
                  <div className="review-diff__line review-diff__line--context">
                    <RowText row={row} line={line} mark="" />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </figure>
      {passed ? null : (
        <>
          <p className="play-panel__muted" aria-live="polite">
            {flagStatusText(flags)}
          </p>
          <div className="play-panel__actions">
            <button
              type="button"
              className="play-button play-button--primary"
              disabled={flags.some((flag) => flag.issue === null)}
              onClick={() => {
                onCheck();
              }}
            >
              Check review
            </button>
          </div>
        </>
      )}
    </>
  );
}

/**
 * How the last check went: the problems it missed, with their clues but never their rows
 * (that would hand the answer over), or that every one was found. Nothing before a check.
 */
export function ReviewCheckNote({
  card,
  check,
  passed,
}: {
  card: CodeReviewCard;
  check: FlagCheck | null;
  passed: boolean;
}) {
  if (passed) {
    return (
      <p className="drill-result drill-result--pass" aria-live="polite">
        <strong>{foundAllText(card.bugs.length)}</strong>
      </p>
    );
  }
  if (check === null || check.right) return null;
  const clues = card.bugs
    .filter((bug) => check.missedBugIds.includes(bug.id))
    .map((bug) => ` ${bug.clue}`);
  return (
    <p className="drill-result" aria-live="polite">
      <strong>{unflaggedText(clues.length)}</strong>
      {clues.join('')}
    </p>
  );
}
