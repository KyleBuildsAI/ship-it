import { useState } from 'react';
import {
  allCardsSolved,
  currentCard,
  firstTryPercent,
  lessonSecondsLeft,
  starsFor,
  stepsInPlace,
} from '../../game/missions/lessonRunner';
import type {
  ArtifactKind,
  Artifact,
  Lesson,
  OrderCard,
  PickCard,
} from '../../game/missions/lessonSchema';
import { formatClock } from '../../game/play/bossPlay';
import {
  answerLesson,
  checkLessonOrder,
  endLessonBriefing,
  moveLessonStep,
  nextLessonCard,
  startLesson,
} from '../../game/play/lessonPlay';
import { leavePlay } from '../../game/play/play';
import type { LessonActivity } from '../../game/play/playStore';
import { useClock } from './useClock';

/** The label on an artifact's box when content gives none of its own. */
const ARTIFACT_LABELS: Record<ArtifactKind, string> = {
  diff: 'Diff',
  log: 'Log',
  terminal: 'Terminal',
  'pull-request': 'Pull request',
  'agent-message': "Agent's message",
  code: 'Code',
  file: 'File',
  request: 'HTTP request',
  response: 'HTTP response',
  error: 'Error',
};

/** The eyebrow over each kind of card, so the player knows how to answer it. */
const CARD_EYEBROWS = {
  choose: 'What would you do?',
  prompt: 'Brief the agent',
  order: 'Put it in order',
} as const;

/** The briefing: a few captions, read at the player's own pace. */
function Briefing({ lesson }: { lesson: Lesson }) {
  const [index, setIndex] = useState(0);
  const last = index + 1 >= lesson.briefing.length;
  return (
    <div className="briefing">
      <p className="play-panel__eyebrow">
        {lesson.kind === 'final' ? 'Final challenge' : 'Briefing'}
      </p>
      <p className="briefing__caption" key={index} aria-live="polite">
        {lesson.briefing[index]}
      </p>
      {lesson.timeLimitSeconds === undefined ? null : (
        <p className="play-panel__muted">
          Every card shares one clock: {formatClock(lesson.timeLimitSeconds)}. It starts when you
          press Start.
        </p>
      )}
      <div className="play-panel__actions">
        <button
          type="button"
          className="play-button play-button--primary"
          onClick={() => {
            if (last) endLessonBriefing();
            else setIndex(index + 1);
          }}
        >
          {last ? 'Start' : 'Next'}
        </button>
        {last ? null : (
          <button
            type="button"
            className="play-button"
            onClick={() => {
              endLessonBriefing();
            }}
          >
            Skip briefing
          </button>
        )}
      </div>
    </div>
  );
}

/** Something to read before answering: a diff, a log, a PR. It scrolls when it's long. */
function ArtifactBlock({ artifact }: { artifact: Artifact }) {
  const label = artifact.label ?? ARTIFACT_LABELS[artifact.kind];
  return (
    <figure className="lesson-artifact">
      <figcaption>
        <span className="lesson-artifact__kind">{ARTIFACT_LABELS[artifact.kind]}</span>
        {label === ARTIFACT_LABELS[artifact.kind] ? null : <span>{label}</span>}
      </figcaption>
      <pre tabIndex={0}>{artifact.text}</pre>
    </figure>
  );
}

function optionClass(picked: readonly string[], id: string, correct: boolean): string {
  if (!picked.includes(id)) return 'lesson-option';
  return correct ? 'lesson-option lesson-option--right' : 'lesson-option lesson-option--wrong';
}

/** A choose or prompt card: options as buttons, and the latest pick's feedback. */
function PickOptions({ card, activity }: { card: PickCard; activity: LessonActivity }) {
  const { picked, solved } = activity.run.card;
  const latest = card.options.find((option) => option.id === picked.at(-1));
  return (
    <>
      <ol className="lesson-options">
        {card.options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              className={optionClass(picked, option.id, option.correct)}
              disabled={solved || picked.includes(option.id)}
              onClick={() => {
                answerLesson(option.id);
              }}
            >
              {option.text}
            </button>
          </li>
        ))}
      </ol>
      {latest === undefined ? null : (
        <p
          className={latest.correct ? 'drill-result drill-result--pass' : 'drill-result'}
          aria-live="polite"
        >
          <strong>{latest.correct ? 'Right. ' : 'Not quite. '}</strong>
          {latest.feedback}
          {latest.correct ? null : ' Try another.'}
        </p>
      )}
    </>
  );
}

/** An order card: the steps with up and down buttons, then "Check order". */
function OrderSteps({ card, activity }: { card: OrderCard; activity: LessonActivity }) {
  const { order, solved, wrongOrders } = activity.run.card;
  const text = new Map(card.steps.map((step) => [step.id, step.text]));
  return (
    <>
      <ol className="lesson-order">
        {order.map((id, index) => (
          <li key={id}>
            <span>{text.get(id)}</span>
            <span className="lesson-order__moves">
              <button
                type="button"
                className="play-button"
                aria-label={`Move up: ${text.get(id) ?? id}`}
                disabled={solved || index === 0}
                onClick={() => {
                  moveLessonStep(id, -1);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="play-button"
                aria-label={`Move down: ${text.get(id) ?? id}`}
                disabled={solved || index === order.length - 1}
                onClick={() => {
                  moveLessonStep(id, 1);
                }}
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      {solved ? (
        <p className="drill-result drill-result--pass" aria-live="polite">
          <strong>Right order.</strong>
        </p>
      ) : (
        <>
          {wrongOrders > 0 ? (
            <p className="drill-result" aria-live="polite">
              Not yet: {stepsInPlace(activity.run, card)} of {card.steps.length} are in the right
              place. Move some and check again.
            </p>
          ) : null}
          <div className="play-panel__actions">
            <button
              type="button"
              className="play-button play-button--primary"
              onClick={() => {
                checkLessonOrder();
              }}
            >
              Check order
            </button>
          </div>
        </>
      )}
    </>
  );
}

function CardScreen({ activity }: { activity: LessonActivity }) {
  const { lesson, run } = activity;
  const card = currentCard(run, lesson);
  if (card === undefined) return null;
  const last = run.cardIndex + 1 >= lesson.cards.length;
  return (
    <div className="lesson-card">
      <p className="play-panel__eyebrow">{CARD_EYEBROWS[card.kind]}</p>
      <p className="play-panel__instruction">{card.situation}</p>
      {card.artifact === undefined ? null : <ArtifactBlock artifact={card.artifact} />}
      <p className="lesson-card__question">{card.question}</p>
      {card.kind === 'order' ? (
        <OrderSteps card={card} activity={activity} />
      ) : (
        <PickOptions card={card} activity={activity} />
      )}
      {run.card.solved ? (
        <div className="hint">
          <p className="hint__source">Why</p>
          <p>{card.explanation}</p>
          <div className="play-panel__actions">
            <button
              type="button"
              className="play-button play-button--primary"
              onClick={() => {
                nextLessonCard();
              }}
            >
              {last ? 'Finish' : 'Next card'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The Done screen: stars and XP, or, when a final's clock ran out, a way back in. */
function Done({ activity }: { activity: LessonActivity }) {
  const { lesson, run, xpEarned } = activity;
  const right = run.firstTry.filter(Boolean).length;
  const timedOut = run.outcome === 'timed-out';
  const stars = starsFor(firstTryPercent(run, lesson));
  return (
    <div>
      {timedOut ? (
        <p className="drill-result">
          Time’s up. You answered {run.firstTry.length} of {lesson.cards.length} cards. Try again:
          the cards stay the same.
        </p>
      ) : (
        <>
          <p className="lesson-stars" aria-label={`${String(stars)} of 3 stars`}>
            {'★'.repeat(stars)}
            <span>{'★'.repeat(3 - stars)}</span>
          </p>
          <p className="drill-result drill-result--pass">
            {right} of {lesson.cards.length} right on the first try.
          </p>
          <p className="play-panel__muted">
            {xpEarned > 0 ? `+${String(xpEarned)} XP` : 'Replays practise without paying XP again.'}
          </p>
        </>
      )}
      <div className="play-panel__actions">
        <button
          type="button"
          className={timedOut ? 'play-button play-button--primary' : 'play-button'}
          onClick={() => {
            startLesson(lesson.id);
          }}
        >
          {timedOut ? 'Try again' : 'Replay'}
        </button>
        <button type="button" className="play-button" onClick={leavePlay}>
          Back to Act {lesson.act}
        </button>
      </div>
    </div>
  );
}

/**
 * A lesson being played: the briefing, then one card at a time, then Done. Everything is
 * answered by clicking. A final shows its shared clock above the cards.
 */
export function LessonView({ activity }: { activity: LessonActivity }) {
  const { lesson, run } = activity;
  // The clock stops once every card is answered, so the time shown freezes where Kyle
  // beat it instead of running on while he reads the last explanation.
  const clockRunning =
    lesson.timeLimitSeconds !== undefined &&
    run.phase === 'cards' &&
    run.outcome === 'running' &&
    !allCardsSolved(run, lesson);
  const now = useClock(clockRunning);
  const secondsLeft = lessonSecondsLeft(run, lesson, now);
  return (
    <>
      <header className="play-panel__header">
        <h2>{lesson.title}</h2>
        <button type="button" className="play-panel__close" aria-label="Leave" onClick={leavePlay}>
          ×
        </button>
      </header>
      {run.phase === 'cards' ? (
        <p className="play-panel__muted lesson-progress">
          Card {run.cardIndex + 1} of {lesson.cards.length}
          {secondsLeft === null ? null : (
            <>
              {' · '}
              <span className="clock clock--boss">{formatClock(secondsLeft)}</span>
            </>
          )}
        </p>
      ) : null}
      {run.phase === 'briefing' ? <Briefing lesson={lesson} /> : null}
      {run.phase === 'cards' ? <CardScreen activity={activity} /> : null}
      {run.phase === 'done' ? <Done activity={activity} /> : null}
    </>
  );
}
