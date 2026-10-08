import { formatClock } from '../../game/play/bossPlay';
import type { BaseAction } from '../../game/missions/agentSchema';
import { shuffleFor, type JudgmentAnswer } from '../../game/missions/judgment';
import type { JudgmentDrill } from '../../game/missions/schema';
import type { DrillResult } from '../../game/play/playStore';
import { progress } from '../../game/progress';
import { useStore } from '../useStore';
import { OttoBubble } from './agent/OttoBubble';
import { useArmed } from './agent/useArmed';
import { actionText, attemptsBefore } from './judgmentText';

/*
 * A judgment drill on screen (docs/act1-directed.md section 2): Kyle reads what Otto did
 * or is about to do, then picks an option or allows or denies. Nothing is typed, and
 * nothing on the card hints at the answer: the engine works the key out after he answers.
 */

/** The clock and a bar that empties with it, so the time left reads at a glance. */
function Timer({ secondsLeft, limit }: { secondsLeft: number; limit: number }) {
  const share = Math.min(1, Math.max(0, secondsLeft / limit));
  return (
    <div className="judgment__timer" role="timer" aria-label="Time left">
      <span className="clock">{formatClock(secondsLeft)}</span>
      <span className="judgment__bar" aria-hidden="true">
        <span style={{ width: `${String(Math.round(share * 100))}%` }} />
      </span>
    </div>
  );
}

/** What Otto is about to do, set apart in his terminal font, with what he said about it. */
function OttoAction({ action }: { action: BaseAction }) {
  return (
    <>
      <p className="predict-card__line">
        <code>{actionText(action)}</code>
      </p>
      {action.say === undefined ? null : <OttoBubble line={action.say} mood="waiting" flash={0} />}
    </>
  );
}

/** What every option shows, whatever decides if it's right. */
interface Choice {
  readonly id: string;
  readonly text: string;
}

/** Predict, diagnose and fix: one button per option, in this attempt's shuffled order. */
function Options({
  options,
  armed,
  onPick,
}: {
  options: readonly Choice[];
  armed: boolean;
  onPick: (optionId: string) => void;
}) {
  return (
    <ul className="plan-cards" aria-label="Your answer">
      {options.map((option) => (
        <li key={option.id}>
          <button
            type="button"
            className="plan-card"
            disabled={!armed}
            onClick={() => {
              onPick(option.id);
            }}
          >
            {option.text}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Approve: like a gate in a mission, but with no effects list. Working out what the line
 * would change is the drill. Allow and Deny look alike, so their colors give nothing away.
 */
function AllowDeny({ armed, onAnswer }: { armed: boolean; onAnswer: (allow: boolean) => void }) {
  return (
    <div className="play-panel__actions">
      {[true, false].map((allow) => (
        <button
          key={String(allow)}
          type="button"
          className="play-button"
          disabled={!armed}
          onClick={() => {
            onAnswer(allow);
          }}
        >
          {allow ? 'Allow' : 'Deny'}
        </button>
      ))}
    </div>
  );
}

/**
 * The question card for the judgment drill on the clock. Parents key it by drill id, so a
 * new drill mounts afresh and waits a moment before it takes a click (useArmed): a
 * double-click on "Start drill" never answers the drill it opens.
 */
export function JudgmentDrillView({
  drill,
  eyebrow,
  secondsLeft,
  onAnswer,
}: {
  drill: JudgmentDrill;
  /** Where Kyle is, like "Drill 1 of 2". */
  eyebrow: string;
  secondsLeft: number;
  onAnswer: (answer: JudgmentAnswer) => void;
}) {
  const armed = useArmed();
  const { save } = useStore(progress);
  const attempt = attemptsBefore(save?.drillHistory ?? [], drill.id);
  const pick = (optionId: string) => {
    onAnswer({ kind: 'pick', optionId });
  };
  return (
    <div className="judgment" role="group" aria-label="Judgment drill">
      <p className="play-panel__eyebrow">{eyebrow}</p>
      <Timer secondsLeft={secondsLeft} limit={drill.timeLimitSeconds} />
      <p className="play-panel__instruction">{drill.prompt}</p>
      {drill.kind === 'predict' || drill.kind === 'approve' ? (
        <OttoAction action={drill.action} />
      ) : null}
      {drill.claim === undefined ? null : (
        <OttoBubble line={drill.claim} mood="waiting" flash={0} />
      )}
      {drill.kind === 'approve' ? (
        <AllowDeny
          armed={armed}
          onAnswer={(allow) => {
            onAnswer({ kind: 'approve', allow });
          }}
        />
      ) : (
        <Options
          options={shuffleFor(drill.id, attempt)<Choice>(drill.options)}
          armed={armed}
          onPick={pick}
        />
      )}
      <p className="play-panel__muted">No typing, no hints: read what Otto did, then judge.</p>
    </div>
  );
}

/**
 * While a drill's scene plays, Otto runs what he already did in the terminal. The question
 * waits until he stops, and so does the clock, so watching never costs Kyle time.
 */
export function ScenePlaying({ label }: { label: string }) {
  return (
    <div className="judgment">
      <p className="play-panel__eyebrow">{label}</p>
      <OttoBubble line="Here's what I did. Watch the terminal." mood="typing" flash={0} />
      <p className="play-panel__muted">The clock starts when Otto stops.</p>
    </div>
  );
}

/** The right answer in words: an option's text, or Allow or Deny. */
function keyText(drill: JudgmentDrill, keyId: string): string | null {
  if (drill.kind === 'approve') return keyId === 'allow' ? 'Allow' : 'Deny';
  return drill.options.find((option) => option.id === keyId)?.text ?? null;
}

/**
 * After the answer: Right or Missed, the right answer when Kyle missed it, and the drill's
 * explain. A drill that ran out of time is a miss, so it names the right answer too.
 */
export function JudgmentReveal({ drill, result }: { drill: JudgmentDrill; result: DrillResult }) {
  const verdict = result.passed ? 'Right' : result.overtime ? 'Out of time' : 'Missed';
  const key = result.passed || result.keyId === undefined ? null : keyText(drill, result.keyId);
  return (
    <div className="judgment-reveal" aria-live="polite">
      <p
        className={
          result.passed ? 'result-card__verdict result-card__verdict--good' : 'result-card__verdict'
        }
      >
        {verdict} · {result.seconds.toFixed(0)}s
      </p>
      {key === null ? null : (
        <p>
          The right answer: <strong>{key}</strong>
        </p>
      )}
      <p>{drill.explain}</p>
      {result.passed ? null : (
        <p className="play-panel__muted">It comes back for review at the Standup Board.</p>
      )}
    </div>
  );
}
