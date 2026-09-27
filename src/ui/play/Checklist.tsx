import type { CheckRow } from '../../game/missions/predicates';

/**
 * The objective checklist: each row ticks itself the moment the sandbox satisfies it. Rows
 * are the mission's objectives; the parts inside an "any of these" row stay hidden, because
 * listing every accepted path would read like a list of things still to do.
 */
export function Checklist({ rows }: { rows: readonly CheckRow[] }) {
  if (rows.length === 0) return null;
  return (
    <ul className="checklist" aria-label="Objectives">
      {rows.map((row, index) => (
        <li key={`${String(index)}-${row.label}`} className={row.passed ? 'checklist__done' : ''}>
          <span className="checklist__mark" aria-hidden="true">
            {row.passed ? '✓' : '○'}
          </span>
          <span>
            {row.label}
            <span className="visually-hidden">{row.passed ? ' (done)' : ' (not yet)'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
