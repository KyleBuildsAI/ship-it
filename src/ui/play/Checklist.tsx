import type { CheckRow } from '../../game/missions/predicates';

/** How a row that doesn't hold reads: still to do while Kyle works, broken at a result. */
const OPEN_ROW = { mark: '○', hidden: ' (not yet)', className: '' } as const;
const FAILED_ROW = { mark: '✗', hidden: ' (not met)', className: 'checklist__failed' } as const;

/**
 * The objective checklist: each row ticks itself the moment the sandbox satisfies it. Rows
 * are the mission's objectives; the parts inside an "any of these" row stay hidden, because
 * listing every accepted path would read like a list of things still to do.
 *
 * `result`: the list is a verdict, not a to-do list (a directed step's result card). A row
 * that doesn't hold then is damage or a miss, so it is drawn red with a ✗ instead of an
 * open circle that reads as unfinished work.
 */
export function Checklist({
  rows,
  result = false,
}: {
  rows: readonly CheckRow[];
  result?: boolean;
}) {
  if (rows.length === 0) return null;
  const unmet = result ? FAILED_ROW : OPEN_ROW;
  return (
    <ul className="checklist" aria-label="Objectives">
      {rows.map((row, index) => (
        <li
          key={`${String(index)}-${row.label}`}
          className={row.passed ? 'checklist__done' : unmet.className}
        >
          <span className="checklist__mark" aria-hidden="true">
            {row.passed ? '✓' : unmet.mark}
          </span>
          <span>
            {row.label}
            <span className="visually-hidden">{row.passed ? ' (done)' : unmet.hidden}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
