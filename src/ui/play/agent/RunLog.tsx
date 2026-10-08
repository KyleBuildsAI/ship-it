import type { RowStatus, RunRow } from '../../../game/agent/runLog';
import { stopOtto } from '../../../game/play/agentPlay';

/** Each row's mark and the words a screen reader hears instead of it. */
const STATUS: Readonly<Record<RowStatus, { mark: string; words: string }>> = {
  ok: { mark: '✓', words: 'ran' },
  failed: { mark: '✗', words: 'failed' },
  asked: { mark: '?', words: 'PowerShell asked to confirm' },
  denied: { mark: '⊘', words: 'denied, never ran' },
};

/** A typed line shows as code; an action that typed nothing reads as words. */
function RowText({ row }: { row: RunRow }) {
  if (!row.typed) return <span className="run-log__words">{row.text}</span>;
  return <code>{row.answer ? `Answered ${row.text}` : row.text}</code>;
}

/**
 * Otto's run log: one row per action and how it ended, so Kyle can see at a glance that
 * a line failed even after its output has scrolled away. Stop shows while Otto works;
 * he finishes the line he is on first, as a real agent would.
 */
export function RunLog({ rows, running }: { rows: readonly RunRow[]; running: boolean }) {
  if (rows.length === 0 && !running) return null;
  return (
    <div className="run-log">
      {rows.length > 0 ? (
        <ol className="run-log__rows" aria-label="Otto's run log">
          {rows.map((row, index) => (
            <li key={String(index)} className={`run-log__row run-log__row--${row.status}`}>
              <span className="run-log__mark" aria-hidden="true">
                {STATUS[row.status].mark}
              </span>
              <RowText row={row} />
              <span className="visually-hidden"> ({STATUS[row.status].words})</span>
            </li>
          ))}
        </ol>
      ) : null}
      {running ? (
        <div className="play-panel__actions">
          <button type="button" className="play-button" onClick={stopOtto}>
            Stop
          </button>
          <span className="play-panel__muted">Otto finishes his current line first.</span>
        </div>
      ) : null}
    </div>
  );
}
