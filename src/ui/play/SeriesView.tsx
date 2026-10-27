import { formatClock } from '../../game/play/bossPlay';
import type { CheckRow } from '../../game/missions/predicates';
import { leavePlay } from '../../game/play/play';
import type { DrillResult, SeriesActivity } from '../../game/play/playStore';
import { isJudgmentDrill, type Drill } from '../../game/missions/schema';
import {
  startNextSeriesDrill,
  submitSeriesDrill,
  submitSeriesJudgment,
} from '../../game/play/seriesPlay';
import { Checklist } from './Checklist';
import { JudgmentDrillView, JudgmentReveal, ScenePlaying } from './JudgmentDrillView';
import { useClock } from './useClock';

const TITLES = { placement: 'Placement test', review: 'Standup Board review' } as const;

/**
 * How a finished drill reads before the next one starts. A review reveals a judgment
 * drill's answer, as a mission's drills do. A placement test is locked, like a lesson
 * placement (DESIGN.md section 5): it says only that the answer is in, since a run that
 * named the right answers would hand them to the next attempt. Its score comes at the end.
 */
function DrillDone({
  drill,
  result,
  locked,
}: {
  drill: Drill;
  result: DrillResult;
  locked: boolean;
}) {
  if (isJudgmentDrill(drill) && locked) {
    return (
      <p className="drill-result" aria-live="polite">
        <strong>{result.overtime ? 'Out of time.' : 'Answer locked in.'}</strong> Your score comes
        at the end.
      </p>
    );
  }
  if (isJudgmentDrill(drill)) return <JudgmentReveal drill={drill} result={result} />;
  return (
    <p className={result.passed ? 'drill-result drill-result--pass' : 'drill-result'}>
      {result.passed ? 'Passed' : result.overtime ? 'Out of time' : 'Not quite'} ·{' '}
      {result.seconds.toFixed(0)}s
    </p>
  );
}

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
  const locked = activity.kind === 'placement';

  let body;
  if (finished) {
    // A placement test's score is the whole of its ending; a review reveals its last drill.
    body = (
      <>
        {!locked && last && lastDrill && isJudgmentDrill(lastDrill) ? (
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
        {last && lastDrill ? (
          <DrillDone drill={lastDrill} result={last} locked={locked} />
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
