import type { CheckRow } from '../../game/missions/predicates';
import { formatClock, startBossFight } from '../../game/play/bossPlay';
import { getCatalog } from '../../game/play/catalog';
import { leavePlay } from '../../game/play/play';
import type { BossActivity } from '../../game/play/playStore';
import { Checklist } from './Checklist';
import { useClock } from './useClock';

const ENDINGS = {
  won: 'Dex shipped a clean build. You beat the Dirty Tree.',
  'lost-time': 'Time’s up. Dex deployed a clean checkout, and uncommitted work was left behind.',
  'lost-rule': 'That broke a rule (like committing .env). Dex pulled the deploy.',
} as const;

export function BossView({
  activity,
  checklist,
}: {
  activity: BossActivity;
  checklist: readonly CheckRow[];
}) {
  const running = activity.outcome === 'running';
  useClock(running);
  const { boss } = getCatalog().act;
  const latest = activity.messages.at(-1);

  return (
    <>
      <header className="play-panel__header">
        <h2>{boss.title}</h2>
        <button type="button" className="play-panel__close" aria-label="Leave" onClick={leavePlay}>
          ×
        </button>
      </header>
      <p className="play-panel__eyebrow">
        Dex deploys in{' '}
        <span className="clock clock--boss">{formatClock(activity.secondsLeft)}</span>
      </p>
      {running && activity.messages.length === 0 ? (
        <p className="play-panel__instruction">{boss.briefing.join(' ')}</p>
      ) : null}
      {latest && running ? (
        <p className="dex-message" aria-live="assertive">
          {latest}
        </p>
      ) : null}
      <Checklist rows={checklist} />
      {running ? null : (
        <div>
          <p
            className={
              activity.outcome === 'won' ? 'drill-result drill-result--pass' : 'drill-result'
            }
          >
            {ENDINGS[activity.outcome]}
          </p>
          <div className="play-panel__actions">
            {activity.outcome === 'won' ? null : (
              <button
                type="button"
                className="play-button play-button--primary"
                onClick={() => {
                  startBossFight();
                }}
              >
                Try again
              </button>
            )}
            <button type="button" className="play-button" onClick={leavePlay}>
              Back to Act 2
            </button>
          </div>
        </div>
      )}
    </>
  );
}
