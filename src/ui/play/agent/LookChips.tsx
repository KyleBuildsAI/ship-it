import type { AgentTask } from '../../../game/missions/agentSchema';
import { ottoRun, runLook } from '../../../game/play/agentPlay';
import { useStore } from '../../useStore';
import { TerminalEvidence } from './TerminalEvidence';

/**
 * Kyle's look chips (docs/act1-directed.md section 1.5): read-only lines like Get-Location
 * that gather evidence before he answers. Each runs at once in the terminal, without
 * Otto's marker, because it's Kyle checking, not Otto working. The terminal is usually
 * put away, so each look's line and output also show here, under the chips. A step can
 * have none.
 */
export function LookChips({ looks }: { looks: AgentTask['looks'] }) {
  const { looks: seen } = useStore(ottoRun);
  if (looks.length === 0) return null;
  return (
    <div className="looks">
      <p className="play-panel__muted">Look before you answer:</p>
      <ul className="looks__chips" aria-label="Looks">
        {looks.map((look) => (
          <li key={look.id}>
            <button
              type="button"
              className="look-chip"
              title={look.line}
              onClick={() => {
                runLook(look.id);
              }}
            >
              {look.label}
            </button>
          </li>
        ))}
      </ul>
      <TerminalEvidence entries={seen} caption="What your looks printed" by="kyle" />
    </div>
  );
}
