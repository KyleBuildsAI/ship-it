import type { Plan } from '../../../game/missions/agentSchema';
import { pickCard, pickInstead } from '../../../game/play/agentPlay';

/**
 * The request cards Kyle can give Otto. Each card is a whole button, so one click directs
 * him. `hinted` is the card the last hint names, marked so Kyle can find it.
 */
export function PlanCards({ plans, hinted }: { plans: readonly Plan[]; hinted: string | null }) {
  return (
    <ul className="plan-cards" aria-label="Request cards">
      {plans.map((plan) => (
        <li key={plan.id}>
          <button
            type="button"
            className={plan.id === hinted ? 'plan-card plan-card--hinted' : 'plan-card'}
            onClick={() => {
              pickCard(plan.id);
            }}
          >
            {plan.text}
            {plan.id === hinted ? <span className="plan-card__hint">Hint</span> : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Otto said a request back as "Plan: <card>. Go?": Kyle confirms it or picks again. */
export function EchoChoice({ planId }: { planId: string }) {
  return (
    <div className="play-panel__actions">
      <button
        type="button"
        className="play-button play-button--primary"
        onClick={() => {
          pickCard(planId);
        }}
      >
        Go
      </button>
      <button type="button" className="play-button" onClick={pickInstead}>
        Pick instead
      </button>
    </div>
  );
}
