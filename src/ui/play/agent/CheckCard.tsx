import { useEffect, useRef } from 'react';
import type { AgentTask } from '../../../game/missions/agentSchema';
import { checkClaim, doPart, ottoRun } from '../../../game/play/agentPlay';
import { useStore } from '../../useStore';
import { LookChips } from './LookChips';
import { useArmed } from './useArmed';

/**
 * Checking Otto's claim (docs/act1-directed.md section 1.3, stage 3). His claim is in his
 * bubble above; here Kyle answers one question about what really happened. No option is
 * marked right: the engine decides from the laptop once he answers. The answers wait a
 * moment before they take a click (useArmed), so a click meant for Otto's last card
 * can't answer the check too.
 *
 * A step with a part for Kyle (`yourPart`, like pasting a key Otto must never see) asks
 * for it first: the answers stay shut until it's done, because the check is about the
 * finished work.
 *
 * What a look printed shows between the chips and the answers. On a short screen that can
 * push the answers below the panel's edge, so each look scrolls the panel just enough to
 * bring them back into view.
 */
export function CheckCard({ task, partDone }: { task: AgentTask; partDone: boolean }) {
  const armed = useArmed();
  const partPending = task.yourPart !== undefined && !partDone;
  const { looks: seen } = useStore(ottoRun);
  const answers = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (seen.length > 0) answers.current?.scrollIntoView({ block: 'nearest' });
  }, [seen]);
  return (
    <div className="check-card" role="group" aria-label="Check Otto's claim">
      {task.yourPart === undefined || partDone ? null : (
        <div className="your-part">
          <p className="play-panel__eyebrow">Your part</p>
          <button
            type="button"
            className="plan-card"
            disabled={!armed}
            onClick={() => {
              doPart();
            }}
          >
            {task.yourPart.label}
          </button>
        </div>
      )}
      <p className="play-panel__eyebrow">Check Otto's claim</p>
      <p className="play-panel__instruction">{task.check.question}</p>
      <LookChips looks={task.looks} />
      <ul ref={answers} className="plan-cards" aria-label="Your answer">
        {task.check.options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              className="plan-card"
              disabled={!armed || partPending}
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
