import { describeChanges } from '../../../game/agent/effects';
import type { Gate, QueuedAction } from '../../../game/missions/agentRunner';
import { decide } from '../../../game/play/agentPlay';
import { display } from '../../../engine/machine/winPath';
import type { ConfirmLetter } from '../../../engine/shell/driver';
import { useArmed } from './useArmed';

/** What each of PowerShell's Confirm letters means, so Kyle can read Otto's answer. */
const LETTERS: Readonly<Record<ConfirmLetter, string>> = {
  Y: 'Yes',
  A: 'Yes to All',
  N: 'No',
  L: 'No to All',
};

/** The card's first line: what Otto is about to do, in his own words for each kind. */
function heading(gate: Gate, action: QueuedAction): string {
  if (gate.kind === 'confirm') return 'PowerShell asks before it goes on with:';
  return action.do === 'write' ? 'Otto wants to write the file:' : 'Otto wants to run:';
}

/**
 * An approval gate (docs/act1-directed.md section 1.3). Otto waits while Kyle reads the
 * line and what a dry run says it changes, worked out on a copy of the laptop, never
 * written by an author. Allow and Deny look alike on purpose: the card's colors must not
 * hint which one is right. Both wait a moment before they take a click (useArmed), so a
 * double-click on one gate never decides the next.
 */
export function GateCard({ gate, action }: { gate: Gate; action: QueuedAction }) {
  const armed = useArmed();
  const effects = describeChanges(gate.changes, display);
  return (
    <div className="gate-card" role="group" aria-label="Approve Otto's action">
      <p className="play-panel__eyebrow">Needs your OK</p>
      <p className="play-panel__muted">{heading(gate, action)}</p>
      <p className="gate-card__line">
        <code>{gate.line}</code>
      </p>
      {action.do === 'answer' ? (
        <p>
          Otto will answer <strong>{action.choice}</strong> ({LETTERS[action.choice]}).
        </p>
      ) : null}
      {effects.length > 0 ? (
        <ul className="gate-card__effects" aria-label="What it changes">
          {effects.map((effect) => (
            <li key={effect}>{effect}</li>
          ))}
        </ul>
      ) : (
        <p className="play-panel__muted">The laptop shows no change, but Otto asked first.</p>
      )}
      <div className="play-panel__actions">
        <button
          type="button"
          className="play-button"
          disabled={!armed}
          onClick={() => {
            decide(true);
          }}
        >
          Allow
        </button>
        <button
          type="button"
          className="play-button"
          disabled={!armed}
          onClick={() => {
            decide(false);
          }}
        >
          Deny
        </button>
      </div>
    </div>
  );
}
