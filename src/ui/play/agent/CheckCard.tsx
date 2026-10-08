import type { AgentTask } from '../../../game/missions/agentSchema';
import { checkClaim } from '../../../game/play/agentPlay';
import { LookChips } from './LookChips';
import { useArmed } from './useArmed';

/**
 * Checking Otto's claim (docs/act1-directed.md section 1.3, stage 3). His claim is in his
 * bubble above; here Kyle answers one question about what really happened. No option is
 * marked right: the engine decides from the laptop once he answers. The answers wait a
 * moment before they take a click (useArmed), so a click meant for Otto's last card
 * can't answer the check too.
 */
export function CheckCard({ task }: { task: AgentTask }) {
  const armed = useArmed();
  return (
    <div className="check-card" role="group" aria-label="Check Otto's claim">
      <p className="play-panel__eyebrow">Check Otto's claim</p>
      <p className="play-panel__instruction">{task.check.question}</p>
      <LookChips looks={task.looks} />
      <ul className="plan-cards" aria-label="Your answer">
        {task.check.options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              className="plan-card"
              disabled={!armed}
              onClick={() => {
                checkClaim(option.id);
              }}
            >
              {option.text}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
