import type { AgentStage, Stars as StarSet, Verdict } from '../../../game/missions/agentRunner';
import type { AgentTask, Slip } from '../../../game/missions/agentSchema';
import type { CheckRow } from '../../../game/missions/predicates';
import { directFix, nextStep, rewind } from '../../../game/play/agentPlay';
import { Checklist } from '../Checklist';
import { AnatomyChips } from './AnatomyChips';
import { planById } from './ottoLines';
import { Stars } from './Stars';

/** The banner for each verdict (section 1.4's table): what Kyle said, against what's true. */
const VERDICTS: Readonly<Record<Verdict, { title: string; detail: string; good: boolean }>> = {
  confirmed: { title: 'Confirmed', detail: 'Otto was right, and you checked.', good: true },
  caught: { title: 'Good catch', detail: "Otto's claim was wrong, and you saw it.", good: true },
  'false-alarm': { title: 'False alarm', detail: 'Otto was right this time.', good: false },
  missed: { title: 'Missed', detail: "Otto's claim was wrong.", good: false },
};

/** A slip's id in words: "wrong-place" reads "wrong place". */
function slipName(slip: Slip): string {
  return slip.replaceAll('-', ' ');
}

/**
 * The step's result (docs/act1-directed.md section 1.3, stage 4): the verdict, the
 * checklist kept hidden until now, what the request had, Otto's slip, one line to learn
 * from, and the stars. Then Kyle moves on, or directs a fix. Rewind is always there for a
 * broken step, and goes first when a guard broke, since that damage is the urgent part.
 */
export function ResultCard({
  task,
  stage,
  checklist,
  earned,
  trueIds,
  slipMet,
}: {
  task: AgentTask;
  stage: Extract<AgentStage, { at: 'result' }>;
  checklist: readonly CheckRow[];
  earned: StarSet | null;
  /**
   * The check options true now. After a Missed check they are shown, so Kyle sees the
   * answer, and after any misread their feedback is what he should have seen.
   */
  trueIds: readonly string[];
  /**
   * The card's slip reached Kyle (a gate or a broken check). A slip card that passed with
   * nothing denied never showed its slip, so naming it here would disagree with the Done
   * screen's count.
   */
  slipMet: boolean;
}) {
  const verdict = VERDICTS[stage.verdict];
  const plan = planById(task, stage.planId);
  const truth = task.check.options.filter((option) => trueIds.includes(option.id));
  // Each option's feedback is the evidence that it is true. On a misread the option Kyle
  // picked is false, so its feedback would restate his mistake: the true option's evidence
  // explains it instead. Otherwise, or if no option holds, the card's lesson is the takeaway.
  const misread = stage.verdict === 'missed' || stage.verdict === 'false-alarm';
  const evidence = truth.map((option) => option.feedback).join(' ');
  const takeaway = misread && evidence !== '' ? evidence : plan?.lesson;
  const answers = stage.verdict === 'missed' ? truth : [];
  return (
    <div className="result-card" role="group" aria-label="Step result">
      <p
        className={
          verdict.good ? 'result-card__verdict result-card__verdict--good' : 'result-card__verdict'
        }
      >
        <strong>{verdict.title}.</strong> {verdict.detail}
      </p>
      {answers.map((option) => (
        <p key={option.id}>The true answer: {option.text}</p>
      ))}
      <Checklist rows={checklist} result />
      {plan === undefined ? null : <AnatomyChips covers={plan.covers} />}
      {plan?.slip === undefined || !slipMet ? null : (
        <p className="result-card__slip">Slip: {slipName(plan.slip)}</p>
      )}
      {takeaway === undefined ? null : <p>{takeaway}</p>}
      {earned === null ? null : <Stars earned={earned} />}
      <ResultActions passed={stage.passed} guardBroken={stage.guardBroken} />
    </div>
  );
}

function ResultActions({ passed, guardBroken }: { passed: boolean; guardBroken: boolean }) {
  if (passed) {
    return (
      <div className="play-panel__actions">
        <button type="button" className="play-button play-button--primary" onClick={nextStep}>
          Next step
        </button>
      </div>
    );
  }
  const fix = (
    <button
      key="fix"
      type="button"
      className={guardBroken ? 'play-button' : 'play-button play-button--primary'}
      onClick={directFix}
    >
      Direct a fix
    </button>
  );
  const back = (
    <button
      key="rewind"
      type="button"
      className={guardBroken ? 'play-button play-button--primary' : 'play-button'}
      onClick={rewind}
    >
      Rewind step
    </button>
  );
  return (
    <>
      <div className="play-panel__actions">{guardBroken ? [back, fix] : [fix, back]}</div>
      {/* Not "Rewind costs the Plan star": a step that didn't pass has lost it already. */}
      <p className="play-panel__muted">A real laptop has no rewind.</p>
    </>
  );
}
