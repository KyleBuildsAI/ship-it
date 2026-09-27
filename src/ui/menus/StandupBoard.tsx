import { openMenu } from '../../game/hud';
import { findDrill } from '../../game/play/catalog';
import { startReview } from '../../game/play/seriesPlay';
import { progress } from '../../game/progress';
import { compareDays, localDay } from '../../game/progression/days';
import { dailySet } from '../../game/progression/reviewQueue';
import { useStore } from '../useStore';
import { Overlay } from './Overlay';

function drillPrompt(id: string): string {
  try {
    return findDrill(id).prompt;
  } catch {
    // A drill from content this build no longer has; show its id rather than hide it.
    return id;
  }
}

/** Today's review set (DESIGN.md section 6): missed drills, brought back by SM-2. */
export function StandupBoard() {
  const { save } = useStore(progress);
  if (save === null) return null;
  const today = localDay(new Date());
  const items = dailySet(save.reviewQueue, today);
  const due = items.filter((item) => compareDays(item.dueOn, today) <= 0).length;

  return (
    <Overlay title="Standup Board">
      {items.length === 0 ? (
        <p className="play-panel__instruction">
          Nothing to review yet. Drills you miss show up here, spaced out so they stick.
        </p>
      ) : (
        <>
          <p className="play-panel__instruction">
            {due > 0
              ? `${String(due)} due today`
              : 'Nothing is due, but a little early practice helps'}{' '}
            · {items.length} in today’s set
          </p>
          <ol className="standup-list">
            {items.map((item) => (
              <li key={item.drillId}>
                {drillPrompt(item.drillId)}
                <small>{compareDays(item.dueOn, today) <= 0 ? 'Due' : `Due ${item.dueOn}`}</small>
              </li>
            ))}
          </ol>
          <div className="play-panel__actions">
            <button
              type="button"
              className="play-button play-button--primary"
              onClick={() => {
                startReview();
                openMenu(null);
              }}
            >
              Start review
            </button>
          </div>
        </>
      )}
    </Overlay>
  );
}
