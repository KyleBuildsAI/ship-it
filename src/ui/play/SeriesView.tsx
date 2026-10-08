import { formatClock } from '../../game/play/bossPlay';
import type { CheckRow } from '../../game/missions/predicates';
import { leavePlay } from '../../game/play/play';
import type { SeriesActivity } from '../../game/play/playStore';
import { isJudgmentDrill } from '../../game/missions/schema';
import {
  startNextSeriesDrill,
  submitSeriesDrill,
  submitSeriesJudgment,
} from '../../game/play/seriesPlay';
import { Checklist } from './Checklist';
import { JudgmentDrillView, JudgmentReveal, ScenePlaying } from './JudgmentDrillView';
import { useClock } from './useClock';

const TITLES = { placement: 'Placement test', review: 'Standup Board review' } as const;

function Summary({ activity }: { activity: SeriesActivity }) {
  const passed = activity.results.filter((result) => result.passed).length;
  const { placement } = activity;
  return (
    <div>
      <p className="play-panel__instruction">
        {passed} of {activity.results.length} passed
        {placement ? ` · ${String(placement.percent)}%` : ''}
      </p>
      {placement ? (
        <p className="play-panel__muted">
          {placement.testedOut
            ? `Tested out: Act ${String(activity.act)} is complete. Every mission stays open to replay.`
            : 'Not quite 85%. Play the missions, then try again any time.'}
        </p>
      ) : (
        <p className="play-panel__muted">
          Items you missed come back tomorrow; the ones you knew come back later and later.
        </p>
      )}
      <div className="play-panel__actions">
        <button type="button" className="play-button play-button--primary" onClick={leavePlay}>
          Done
        </button>
      </div>
    </div>
  );
}

export function SeriesView({
  activity,
  checklist,
}: {
  activity: SeriesActivity;
  checklist: readonly CheckRow[];
}) {
  const { active, drills, results, scene } = activity;
  const now = useClock(active !== null);
  const finished = results.length === drills.length;
  const last = results.at(-1);
  const lastDrill = drills[results.length - 1];
  const position = `${String(results.length + 1)} of ${String(drills.length)}`;

  let body;
  if (finished) {
    body = (
      <>
        {last && lastDrill && isJudgmentDrill(lastDrill) ? (
          <JudgmentReveal drill={lastDrill} result={last} />
        ) : null}
        <Summary activity={activity} />
      </>
    );
  } else if (scene !== null) {
    body = <ScenePlaying label={position} />;
  } else if (active === null) {
    body = (
      <div>
        {last && lastDrill && isJudgmentDrill(lastDrill) ? (
          <JudgmentReveal drill={lastDrill} result={last} />
        ) : last ? (
          <p className={last.passed ? 'drill-result drill-result--pass' : 'drill-result'}>
            {last.passed ? 'Passed' : last.overtime ? 'Out of time' : 'Not quite'} ·{' '}
            {last.seconds.toFixed(0)}s
          </p>
        ) : (
          <p className="play-panel__instruction">
            {drills.length} timed drills. No hints and no Sage: this is what you can do alone.
          </p>
        )}
        <div className="play-panel__actions">
          <button
            type="button"
            className="play-button play-button--primary"
            onClick={() => {
              startNextSeriesDrill();
            }}
          >
            Start {position}
          </button>
        </div>
      </div>
    );
  } else {
    const drill = drills[active.index];
    const left = drill ? drill.timeLimitSeconds - (now - active.startedAtMs) / 1000 : 0;
    body =
      drill !== undefined && isJudgmentDrill(drill) ? (
        <JudgmentDrillView
          key={drill.id}
          drill={drill}
          eyebrow={`${String(active.index + 1)} of ${String(drills.length)}`}
          secondsLeft={left}
          onAnswer={(answer) => {
            submitSeriesJudgment(drill.id, answer);
          }}
        />
      ) : (
        <div>
          <p className="play-panel__eyebrow">
            {active.index + 1} of {drills.length} ·{' '}
            <span className="clock">{formatClock(left)}</span>
          </p>
          <p className="play-panel__instruction">{drill?.prompt}</p>
          <Checklist rows={checklist} />
          <div className="play-panel__actions">
            <button
              type="button"
              className="play-button"
              onClick={() => {
                submitSeriesDrill();
              }}
            >
              I’m done
            </button>
          </div>
        </div>
      );
  }

  return (
    <>
      <header className="play-panel__header">
        <h2>{TITLES[activity.kind]}</h2>
        <button type="button" className="play-panel__close" aria-label="Leave" onClick={leavePlay}>
          ×
        </button>
      </header>
      {body}
    </>
  );
}
