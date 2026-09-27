import { useEffect } from 'react';
import { sandbox } from '../game/sandbox';
import { dismissTutorial, skipTutorial, tutorial, TUTORIAL_STEPS } from '../game/tutorial';
import { worldState } from '../game/worldState';
import { useStore } from './useStore';

/** How long the "you're ready" card stays before it tidies itself away. */
const FINISHED_CARD_MS = 8000;

/**
 * The first-run tutorial's card, top left. It shows one step at a time and moves on by
 * itself when the player does what it asks. Nothing in it takes focus by itself, so WASD
 * and Space keep reaching the world while it's on screen.
 */
export function TutorialCard() {
  const { step, finished } = useStore(tutorial);
  const { openFile } = useStore(sandbox);
  // The play panel reports how much of the left edge it covers; stand just right of it.
  const { leftInset } = useStore(worldState);
  const place = leftInset > 0 ? { left: leftInset + 16 } : undefined;

  useEffect(() => {
    if (!finished) return;
    const timer = window.setTimeout(dismissTutorial, FINISHED_CARD_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [finished]);

  // The editor docks on the right, under this card. It wins: its Close button must be reachable.
  if (openFile !== null) return null;

  if (finished) {
    return (
      <aside className="glass tutorial-card" style={place} aria-label="Tutorial" aria-live="polite">
        <p className="tutorial-card__eyebrow">Tutorial complete</p>
        <h2 className="tutorial-card__title">You know the controls</h2>
        <p className="tutorial-card__instruction">
          Replay this any time from Settings. Now go learn something.
        </p>
        <div className="tutorial-card__actions">
          <button type="button" className="play-button" onClick={dismissTutorial}>
            Close
          </button>
        </div>
      </aside>
    );
  }

  const current = step === null ? undefined : TUTORIAL_STEPS[step];
  if (step === null || current === undefined) return null;
  return (
    <aside className="glass tutorial-card" style={place} aria-label="Tutorial" aria-live="polite">
      <p className="tutorial-card__eyebrow">
        Tutorial · step {step + 1} of {TUTORIAL_STEPS.length}
      </p>
      <h2 className="tutorial-card__title">{current.title}</h2>
      <p className="tutorial-card__instruction">{current.instruction}</p>
      <ol className="tutorial-card__progress" aria-hidden="true">
        {TUTORIAL_STEPS.map((item, index) => (
          <li
            key={item.id}
            className={
              index < step
                ? 'tutorial-card__dot tutorial-card__dot--done'
                : index === step
                  ? 'tutorial-card__dot tutorial-card__dot--current'
                  : 'tutorial-card__dot'
            }
          />
        ))}
      </ol>
      <div className="tutorial-card__actions">
        <button type="button" className="play-button" onClick={skipTutorial}>
          Skip tutorial
        </button>
      </div>
    </aside>
  );
}
