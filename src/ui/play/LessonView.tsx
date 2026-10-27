import { useLayoutEffect, useRef, useState } from 'react';
import { browserMotion } from '../../game/agent/browserMotion';
import {
  allCardsSolved,
  currentCard,
  firstTryPercent,
  lessonSecondsLeft,
  starsFor,
  stepsInPlace,
  type LessonRun,
} from '../../game/missions/lessonRunner';
import type {
  ArtifactKind,
  Artifact,
  CardOption,
  Lesson,
  LessonCard,
  OrderCard,
  PickCard,
} from '../../game/missions/lessonSchema';
import { formatClock } from '../../game/play/bossPlay';
import { getAct } from '../../game/play/catalog';
import {
  answerLesson,
  checkLessonOrder,
  endLessonBriefing,
  moveLessonStep,
  nextLessonCard,
  startLesson,
  startLessonPlacement,
} from '../../game/play/lessonPlay';
import { leavePlay } from '../../game/play/play';
import type { LessonActivity } from '../../game/play/playStore';
import { progress } from '../../game/progress';
import { answersOn, revealBehavior } from './lessonReveal';
import { splitFeedback } from './lessonText';
import { useClock } from './useClock';

/** The label on an artifact's box when content gives none of its own. */
const ARTIFACT_LABELS: Record<ArtifactKind, string> = {
  diff: 'Diff',
  log: 'Log',
  terminal: 'Terminal',
  issue: 'Issue',
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

/** What the briefing's eyebrow calls this run. */
function briefingEyebrow(lesson: Lesson, placement: boolean): string {
  if (placement) return 'Placement test';
  return lesson.kind === 'final' ? 'Final challenge' : 'Briefing';
}

/** The briefing: a few captions, read at the player's own pace. */
function Briefing({ lesson, placement }: { lesson: Lesson; placement: boolean }) {
  const [index, setIndex] = useState(0);
  const last = index + 1 >= lesson.briefing.length;
  return (
    <div className="briefing">
      <p className="play-panel__eyebrow">{briefingEyebrow(lesson, placement)}</p>
      <p className="briefing__caption" key={index} aria-live="polite">
        {lesson.briefing[index]}
      </p>
      {lesson.timeLimitSeconds === undefined ? null : (
        // Skip briefing starts the clock as well as Start, so the note names neither button.
        <p className="play-panel__muted">
          Every card shares one clock: {formatClock(lesson.timeLimitSeconds)}. It starts when the
          first card shows.
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

/**
 * Kinds whose lines stay whole, scrolling sideways when long: where a line of code breaks
 * is part of what it says, and a diff's + and - mark whole lines. Every other kind is
 * prose or output, which wraps so no word of it hides past the box's edge.
 */
const KEEPS_LINES_WHOLE: ReadonlySet<ArtifactKind> = new Set(['diff', 'code', 'file']);

/** Something to read before answering: a diff, a log, a PR. It scrolls when it's long. */
function ArtifactBlock({ artifact }: { artifact: Artifact }) {
  const label = artifact.label ?? ARTIFACT_LABELS[artifact.kind];
  const wraps = !KEEPS_LINES_WHOLE.has(artifact.kind);
  return (
    <figure className={wraps ? 'lesson-artifact lesson-artifact--wrap' : 'lesson-artifact'}>
      <figcaption>
        <span className="lesson-artifact__kind">{ARTIFACT_LABELS[artifact.kind]}</span>
        {label === ARTIFACT_LABELS[artifact.kind] ? null : <span>{label}</span>}
      </figcaption>
      <pre tabIndex={0}>{artifact.text}</pre>
    </figure>
  );
}

function optionClass(
  picked: readonly string[],
  id: string,
  correct: boolean,
  locked: boolean,
): string {
  if (!picked.includes(id)) return 'lesson-option';
  // A test never colours an answer: right or wrong is only told in the final score.
  if (locked) return 'lesson-option lesson-option--chosen';
  return correct ? 'lesson-option lesson-option--right' : 'lesson-option lesson-option--wrong';
}

/** What a test card says once answered: that it's in, never whether it's right. */
function LockedNote({ last }: { last: boolean }) {
  return (
    <p className="drill-result" aria-live="polite">
      <strong>Answer locked in.</strong>{' '}
      {last ? 'Finish to see your score.' : 'Your score comes at the end.'}
    </p>
  );
}

/** A pick's feedback: its verdict in bold, then why. A wrong pick invites another try. */
function AnswerFeedback({ option }: { option: CardOption }) {
  const { verdict, rest } = splitFeedback(option.correct, option.feedback);
  return (
    <p
      className={option.correct ? 'drill-result drill-result--pass' : 'drill-result'}
      aria-live="polite"
    >
      <strong>{verdict}</strong> {rest}
      {option.correct ? null : ' Try another.'}
    </p>
  );
}

/** A choose or prompt card's options, as buttons. */
function PickOptions({ card, run }: { card: PickCard; run: LessonRun }) {
  const { picked, solved } = run.card;
  return (
    <ol className="lesson-options">
      {card.options.map((option) => (
        <li key={option.id}>
          <button
            type="button"
            className={optionClass(picked, option.id, option.correct, run.locked)}
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
  );
}

/** What the latest pick got: its feedback, or a test's locked note. */
function PickResult({ card, run, last }: { card: PickCard; run: LessonRun; last: boolean }) {
  const latest = card.options.find((option) => option.id === run.card.picked.at(-1));
  if (latest === undefined) return null;
  return run.locked ? <LockedNote last={last} /> : <AnswerFeedback option={latest} />;
}

/** An order card's steps, with up and down buttons. */
function OrderSteps({ card, run }: { card: OrderCard; run: LessonRun }) {
  const { order, solved } = run.card;
  const text = new Map(card.steps.map((step) => [step.id, step.text]));
  return (
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
  );
}

/** Under an order card's steps: "Check order" and how the last check went. */
function OrderResult({ card, run, last }: { card: OrderCard; run: LessonRun; last: boolean }) {
  const { solved, wrongOrders } = run.card;
  if (solved) {
    return run.locked ? (
      <LockedNote last={last} />
    ) : (
      <p className="drill-result drill-result--pass" aria-live="polite">
        <strong>Right order.</strong>
      </p>
    );
  }
  return (
    <>
      {wrongOrders > 0 ? (
        <p className="drill-result" aria-live="polite">
          Not yet: {stepsInPlace(run, card)} of {card.steps.length} are in the right place. Move
          some and check again.
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
          {run.locked ? 'Lock in this order' : 'Check order'}
        </button>
      </div>
    </>
  );
}

/** Once a card is over: why the answer is right (never on a test), and Next. */
function WhyAndNext({ card, run, last }: { card: LessonCard; run: LessonRun; last: boolean }) {
  return (
    <div className={run.locked ? undefined : 'hint'}>
      {/* The why would give a test's answer away, so a test moves straight on. */}
      {run.locked ? null : (
        <>
          <p className="hint__source">Why</p>
          <p>{card.explanation}</p>
        </>
      )}
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
  );
}

function CardScreen({ activity }: { activity: LessonActivity }) {
  const { lesson, run } = activity;
  const result = useRef<HTMLDivElement>(null);
  const answers = answersOn(run.card);
  // Each answer's result appears under the options, which on a long card is below the
  // panel's fold, so a placement test looked frozen. Bring the newest into view, and only
  // as far as it takes. A fresh card has none: the panel opens it at the top.
  useLayoutEffect(() => {
    if (answers === 0) return;
    const reducedMotion = progress.get().save?.settings.reducedMotion ?? 'system';
    result.current?.scrollIntoView({
      block: 'nearest',
      behavior: revealBehavior(browserMotion, reducedMotion),
    });
  }, [answers]);
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
        <OrderSteps card={card} run={run} />
      ) : (
        <PickOptions card={card} run={run} />
      )}
      <div ref={result}>
        {card.kind === 'order' ? (
          <OrderResult card={card} run={run} last={last} />
        ) : (
          <PickResult card={card} run={run} last={last} />
        )}
        {run.card.solved ? <WhyAndNext card={card} run={run} last={last} /> : null}
      </div>
    </div>
  );
}

/** The buttons under a Done screen: go again, or back to the Act's menu. */
function DoneActions({
  primary,
  label,
  onAgain,
  act,
}: {
  primary: boolean;
  label: string;
  onAgain: () => void;
  act: number;
}) {
  return (
    <div className="play-panel__actions">
      <button
        type="button"
        className={primary ? 'play-button play-button--primary' : 'play-button'}
        onClick={onAgain}
      >
        {label}
      </button>
      <button type="button" className="play-button" onClick={leavePlay}>
        Back to Act {act}
      </button>
    </div>
  );
}

/**
 * What a test-out leaves to play. A lesson Act's Field Mission isn't skipped by a test-out
 * (the Act completes only once it's verified), so the Done screen names it.
 */
function stillToDo(actNumber: number): string {
  return getAct(actNumber).act.fieldMission === undefined
    ? 'the final is still yours to play.'
    : 'the final and the Field Mission are still yours to do, and the Act completes once the Field Mission is verified.';
}

/**
 * A placement test's Done screen: the score, and whether it tested out. A miss isn't a
 * failure: the lessons are still there to play, and the test can be taken again.
 */
function PlacementDone({ activity }: { activity: LessonActivity }) {
  const { lesson, run, placement } = activity;
  const result = placement?.result;
  if (placement === undefined || result == null) return null;
  const timedOut = run.outcome === 'timed-out';
  return (
    <div>
      <p className={result.testedOut ? 'drill-result drill-result--pass' : 'drill-result'}>
        {result.percent}% right
        {timedOut
          ? ` before time ran out (${String(run.firstTry.length)} of ${String(lesson.cards.length)} answered)`
          : ''}
        .
      </p>
      <p className="play-panel__muted">
        {result.testedOut
          ? `Tested out. Every lesson in Act ${String(lesson.act)} is marked done; ${stillToDo(lesson.act)}`
          : `${String(placement.passPercent)}% tests out. Play the lessons, or try again.`}
      </p>
      <DoneActions
        primary={!result.testedOut}
        label="Try again"
        act={lesson.act}
        onAgain={() => {
          startLessonPlacement(placement.act);
        }}
      />
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
      <DoneActions
        primary={timedOut}
        label={timedOut ? 'Try again' : 'Replay'}
        act={lesson.act}
        onAgain={() => {
          startLesson(lesson.id);
        }}
      />
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
      {run.phase === 'briefing' ? (
        <Briefing lesson={lesson} placement={activity.placement !== undefined} />
      ) : null}
      {run.phase === 'cards' ? <CardScreen activity={activity} /> : null}
      {run.phase === 'done' && activity.placement !== undefined ? (
        <PlacementDone activity={activity} />
      ) : null}
      {run.phase === 'done' && activity.placement === undefined ? (
        <Done activity={activity} />
      ) : null}
    </>
  );
}
