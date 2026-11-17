import { useEffect } from 'react';
import { openMenu } from '../../game/hud';
import { drillPrompt } from '../../game/play/catalog';
import { lockedRunActive, play } from '../../game/play/playStore';
import { actsNeeded, whileMenuOpen } from '../../game/play/playWhenReady';
import { todaysItems } from '../../game/play/seriesPlay';
import { progress } from '../../game/progress';
import { compareDays, localDay } from '../../game/progression/days';
import { LoadFailedAlert, PlayButton } from '../play/PlayButton';
import { useStore } from '../useStore';
import { LockedRunNote } from './LockedRunNote';
import { Overlay } from './Overlay';

/** Today's review set (DESIGN.md section 6): missed drills, brought back by SM-2. */
export function StandupBoard() {
  const { save } = useStore(progress);
  const { activity } = useStore(play);
  const saveLoaded = save !== null;
  // Above the early return: React needs the same hooks, in the same order, every render.
  // It runs again once the save loads: the save holds the review queue, which says which
  // Acts today's review draws from, so until then there's nothing to fetch.
  useEffect(
    () => whileMenuOpen('standup-board', actsNeeded({ kind: 'review' }, new Date())),
    [saveLoaded],
  );
  if (save === null) return null;
  // A locked answer that was wrong joins the review queue at once, so a new item would
  // give it away.
  if (lockedRunActive(activity)) {
    return (
      <Overlay title="Standup Board">
        <LockedRunNote />
      </Overlay>
    );
  }
  const now = new Date();
  const today = localDay(now);
  // The same set the Act menu counts and Start review plays, so all three agree.
  const items = todaysItems(now);
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
                {/* todaysItems already leaves out drills this build doesn't ship, so the id
                    is only a guard: it beats a blank line. */}
                {drillPrompt(item.drillId) ?? item.drillId}
                <small>{compareDays(item.dueOn, today) <= 0 ? 'Due' : `Due ${item.dueOn}`}</small>
              </li>
            ))}
          </ol>
          <LoadFailedAlert from="standup-board" />
          <div className="play-panel__actions">
            <PlayButton
              request={{ kind: 'review' }}
              from="standup-board"
              className="play-button play-button--primary"
              onStarted={() => {
                openMenu(null);
              }}
            >
              Start review
            </PlayButton>
          </div>
        </>
      )}
    </Overlay>
  );
}
