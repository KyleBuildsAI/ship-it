import type { PredictedAction } from '../../../game/missions/agentRunner';
import { predict } from '../../../game/play/agentPlay';

/**
 * Before a line runs, Kyle guesses what it will do. The line waits typed at the prompt, so
 * he can read it there. Every option is just a guess until the line runs: the engine
 * decides which was right from what the line does, never from a flag in the content.
 */
export function PredictCard({ action }: { action: PredictedAction }) {
  return (
    <div className="predict-card">
      <p className="play-panel__eyebrow">Predict</p>
      <p className="predict-card__line">
        <code>{action.line}</code>
      </p>
      <p className="play-panel__instruction">{action.predict.question}</p>
      <ul className="plan-cards" aria-label="Your prediction">
        {action.predict.options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              className="plan-card"
              onClick={() => {
                predict(option.id);
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
