import { Fragment, useEffect, useState } from 'react';
import {
  askForHint,
  endBriefing,
  startNextDrill,
  submitCurrentDrill,
  submitJudgment,
  submitQuestionRound,
} from '../../game/play/missionPlay';
import { isJudgmentDrill, type Drill } from '../../game/missions/schema';
import { formatClock } from '../../game/play/bossPlay';
import { leavePlay } from '../../game/play/play';
import type { DrillResult, MissionActivity } from '../../game/play/playStore';
import { devStatus } from '../../game/devStatus';
import { useStore } from '../useStore';
import { Checklist } from './Checklist';
import type { CheckRow } from '../../game/missions/predicates';
import { useClock } from './useClock';
import { AgentStepView } from './agent/AgentStepView';
import { Stars } from './agent/Stars';
import { JudgmentDrillView, JudgmentReveal, ScenePlaying } from './JudgmentDrillView';

const CAPTION_MS = 5000;

/** Act 2's three rooms, the strip under a git mission's briefing. */
const GIT_ROOMS = ['Workbench', 'Loading Dock', 'Vault'];

/** The strip under a briefing, by Act: Act 1's is the path from C:\ to the API. */
const BRIEFING_STRIP: Readonly<Partial<Record<number, readonly string[]>>> = {
  1: ['C:\\', 'Users', 'kyle', 'quillwork', 'api'],
};

/** The briefing: a few captions that advance on their own, skippable at any time. */
function Briefing({ activity }: { activity: MissionActivity }) {
  const { captions } = activity.mission.briefing;
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (index + 1 >= captions.length) endBriefing();
      else setIndex(index + 1);
    }, CAPTION_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [index, captions.length]);
  return (
    <div className="briefing">
      <p className="play-panel__eyebrow">Briefing</p>
      <p className="briefing__caption" key={index} aria-live="polite">
        {captions[index]}
      </p>
      <div className="briefing__rooms" aria-hidden="true">
        {(BRIEFING_STRIP[activity.mission.act] ?? GIT_ROOMS).map((label, place) => (
          <Fragment key={label}>
            {place > 0 ? <span>→</span> : null}
            <span>{label}</span>
          </Fragment>
        ))}
      </div>
      <div className="play-panel__actions">
        <button type="button" className="play-button play-button--primary" onClick={endBriefing}>
          {index + 1 >= captions.length ? 'Start' : 'Skip briefing'}
        </button>
      </div>
    </div>
  );
}

function Sim({
  activity,
  checklist,
}: {
  activity: MissionActivity;
  checklist: readonly CheckRow[];
}) {
  const { mission, run, hint, hintLoading } = activity;
  const { mentor } = useStore(devStatus);
  const step = mission.steps[run.stepIndex];
  if (step === undefined) return null;
  return (
    <div>
      <p className="play-panel__eyebrow">
        Step {run.stepIndex + 1} of {mission.steps.length}
      </p>
      <p className="play-panel__instruction">{step.instruction}</p>
      {/* A directed step: Kyle directs Otto instead of typing. Act 2's typed steps skip it. */}
      {step.agent === undefined ? (
        <Checklist rows={checklist} />
      ) : (
        <AgentStepView
          activity={activity}
          step={step}
          hintLevel={hint?.level ?? 0}
          checklist={checklist}
        />
      )}
      {hint ? (
        <div className="hint" aria-live="polite">
          <p className="hint__source">
            {hint.fromSage ? 'Sage' : 'Hint'} · level {hint.level} of 3
          </p>
          <p>{hint.text}</p>
        </div>
      ) : null}
      <div className="play-panel__actions">
        <button
          type="button"
          className="play-button"
          disabled={hintLoading}
          onClick={() => {
            void askForHint();
          }}
        >
          {hintLoading ? 'Sage is thinking…' : hint ? 'Next hint' : 'Hint'}
        </button>
        <span className="play-panel__muted">
          {mentor === 'online' ? 'Sage is online' : 'Written hints (Sage offline)'}
        </span>
      </div>
    </div>
  );
}

function DrillOutcome({ result, drill }: { result: DrillResult; drill: Drill | undefined }) {
  if (drill !== undefined && isJudgmentDrill(drill)) {
    return <JudgmentReveal drill={drill} result={result} />;
  }
  const verdict = result.passed ? 'Passed' : result.overtime ? 'Out of time' : 'Not quite';
  return (
    <p className={result.passed ? 'drill-result drill-result--pass' : 'drill-result'}>
      {verdict} · {result.seconds.toFixed(0)}s
      {result.passed ? '' : '. It goes to your review queue at the Standup Board.'}
    </p>
  );
}

function Drills({
  activity,
  checklist,
}: {
  activity: MissionActivity;
  checklist: readonly CheckRow[];
}) {
  const { mission, run, lastDrill, scene } = activity;
  const active = run.activeDrill;
  const now = useClock(active !== null);
  const total = mission.drills.length;
  const next = run.drillResults.length + 1;
  if (scene !== null) return <ScenePlaying label={`Drill ${String(next)} of ${String(total)}`} />;
  if (active === null) {
    const judged = mission.drills.some(isJudgmentDrill);
    const finished = lastDrill
      ? mission.drills.find((drill) => drill.id === lastDrill.drillId)
      : undefined;
    return (
      <div>
        <p className="play-panel__eyebrow">No-AI Drills</p>
        {lastDrill ? <DrillOutcome result={lastDrill} drill={finished} /> : null}
        <p className="play-panel__instruction">
          {lastDrill
            ? `Drill ${String(next)} of ${String(total)} is next.`
            : judged
              ? `${String(total)} timed drills. No hints, no Sage: judge what Otto does.`
              : `${String(total)} timed drills. No hints, no Sage: recall, not recognition.`}
        </p>
        <div className="play-panel__actions">
          <button
            type="button"
            className="play-button play-button--primary"
            onClick={() => {
              startNextDrill();
            }}
          >
            Start drill {next}
          </button>
        </div>
      </div>
    );
  }
  const drill = mission.drills[active.drillIndex];
  if (drill === undefined) return null;
  const left = drill.timeLimitSeconds - (now - active.startedAtMs) / 1000;
  if (isJudgmentDrill(drill)) {
    return (
      <JudgmentDrillView
        key={drill.id}
        drill={drill}
        eyebrow={`Drill ${String(active.drillIndex + 1)} of ${String(total)}`}
        secondsLeft={left}
        onAnswer={(answer) => {
          submitJudgment(drill.id, answer);
        }}
      />
    );
  }
  return (
    <div>
      <p className="play-panel__eyebrow">
        Drill {active.drillIndex + 1} of {total} ·{' '}
        <span className="clock">{formatClock(left)}</span>
      </p>
      <p className="play-panel__instruction">{drill.prompt}</p>
      <Checklist rows={checklist} />
      <div className="play-panel__actions">
        <button
          type="button"
          className="play-button"
          onClick={() => {
            submitCurrentDrill();
          }}
        >
          I’m done
        </button>
        <span className="play-panel__muted">Sage is offline during drills.</span>
      </div>
    </div>
  );
}

/**
 * The last drill's reveal, above the Question Round. Answering the last drill moves the run
 * straight on, so without this Kyle would never see whether he judged it right. Only a
 * judgment drill shows one: Act 2's typed missions play exactly as before.
 */
function FinalJudgmentReveal({ activity }: { activity: MissionActivity }) {
  const { lastDrill, mission } = activity;
  if (lastDrill === null) return null;
  const drill = mission.drills.find((candidate) => candidate.id === lastDrill.drillId);
  if (drill === undefined || !isJudgmentDrill(drill)) return null;
  return <JudgmentReveal drill={drill} result={lastDrill} />;
}

function QuestionRound({ activity }: { activity: MissionActivity }) {
  const { ticket, candidates, pickLimit } = activity.mission.questionRound;
  const { mentor } = useStore(devStatus);
  const [picks, setPicks] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');
  const toggle = (id: string) => {
    setPicks((current) =>
      current.includes(id)
        ? current.filter((pick) => pick !== id)
        : current.length < pickLimit
          ? [...current, id]
          : current,
    );
  };
  return (
    <div>
      <FinalJudgmentReveal activity={activity} />
      <p className="play-panel__eyebrow">Question Round · ticket from {ticket.from}</p>
      <p className="ticket__title">{ticket.title}</p>
      <p className="ticket__body">{ticket.body}</p>
      <p className="play-panel__muted">
        Pick up to {pickLimit} questions you would ask before building anything.
      </p>
      <ul className="candidates">
        {candidates.map((candidate) => (
          <li key={candidate.id}>
            <label>
              <input
                type="checkbox"
                checked={picks.includes(candidate.id)}
                disabled={!picks.includes(candidate.id) && picks.length >= pickLimit}
                onChange={() => {
                  toggle(candidate.id);
                }}
              />
              <span>{candidate.text}</span>
            </label>
          </li>
        ))}
      </ul>
      {mentor === 'online' ? (
        <label className="free-text">
          <span className="play-panel__muted">Optional: your own question, graded by Sage</span>
          <textarea
            value={freeText}
            maxLength={1000}
            rows={2}
            onChange={(event) => {
              setFreeText(event.target.value);
            }}
          />
        </label>
      ) : null}
      <div className="play-panel__actions">
        <button
          type="button"
          className="play-button play-button--primary"
          disabled={picks.length === 0}
          onClick={() => {
            submitQuestionRound(picks, freeText);
          }}
        >
          Lock in {picks.length} {picks.length === 1 ? 'question' : 'questions'}
        </button>
      </div>
    </div>
  );
}

const QUALITY_LABEL = { strong: 'Strong', okay: 'Okay', weak: 'Weak' } as const;

/** "You caught 2 of 3 of Otto's slips": the one number that says how well Kyle checked. */
function slipLine(slips: MissionActivity['slips']): string {
  if (slips.length === 0) return "None of Otto's slips reached a gate or a check.";
  const caught = slips.filter((slip) => slip.caught).length;
  return `You caught ${String(caught)} of ${String(slips.length)} of Otto's slips.`;
}

/**
 * How Kyle directed Otto, on the Done screen of a directed mission: the slips he caught
 * and each step's stars. A typed mission (Act 2) has no directed steps, so it shows nothing.
 */
function DirectingSummary({ activity }: { activity: MissionActivity }) {
  const directed = activity.mission.steps.filter((step) => step.agent !== undefined);
  if (directed.length === 0) return null;
  return (
    <div className="directing-summary">
      <p>{slipLine(activity.slips)}</p>
      <ol className="directing-summary__steps" aria-label="Stars per step">
        {directed.map((step) => {
          const earned = activity.stars[step.id];
          return (
            <li key={step.id}>
              <span className="play-panel__muted">{step.instruction}</span>
              {earned === undefined ? null : <Stars earned={earned} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Done({ activity }: { activity: MissionActivity }) {
  const { questionScore, freeTextGrade, run, mission, xpEarned } = activity;
  const passed = run.drillResults.filter((result) => result.passed).length;
  return (
    <div>
      <p className="play-panel__eyebrow">Mission complete</p>
      <p className="play-panel__instruction">
        {mission.title}: +{xpEarned} XP · drills {passed}/{run.drillResults.length}
      </p>
      <DirectingSummary activity={activity} />
      {questionScore ? (
        <ul className="pick-feedback">
          {questionScore.perPick.map((pick) => (
            <li key={pick.id} className={`pick-feedback__${pick.quality}`}>
              <strong>{QUALITY_LABEL[pick.quality]}.</strong> {pick.rationale}
            </li>
          ))}
        </ul>
      ) : null}
      {freeTextGrade?.state === 'grading' ? (
        <p className="play-panel__muted">Sage is grading your question…</p>
      ) : null}
      {freeTextGrade?.state === 'graded' ? (
        <div className="hint">
          <p className="hint__source">Sage · your question scored {freeTextGrade.score} of 3</p>
          <p>{freeTextGrade.whyItMatters}</p>
          <p>Sharper: “{freeTextGrade.betterVersion}”</p>
        </div>
      ) : null}
      {freeTextGrade?.state === 'unavailable' ? (
        <p className="play-panel__muted">{freeTextGrade.message}</p>
      ) : null}
      <div className="play-panel__actions">
        <button type="button" className="play-button play-button--primary" onClick={leavePlay}>
          Back to Act {activity.mission.act}
        </button>
      </div>
    </div>
  );
}

export function MissionView({
  activity,
  checklist,
}: {
  activity: MissionActivity;
  checklist: readonly CheckRow[];
}) {
  const { phase } = activity.run;
  return (
    <>
      <header className="play-panel__header">
        <h2>{activity.mission.title}</h2>
        {phase === 'done' ? null : (
          <button
            type="button"
            className="play-panel__close"
            aria-label="Leave mission"
            onClick={leavePlay}
          >
            ×
          </button>
        )}
      </header>
      {phase === 'briefing' ? <Briefing activity={activity} /> : null}
      {phase === 'sim' ? <Sim activity={activity} checklist={checklist} /> : null}
      {phase === 'drills' ? <Drills activity={activity} checklist={checklist} /> : null}
      {phase === 'question' ? <QuestionRound activity={activity} /> : null}
      {phase === 'done' ? <Done activity={activity} /> : null}
    </>
  );
}
