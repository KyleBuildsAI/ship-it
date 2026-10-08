import type { RunRow } from '../../../game/agent/runLog';
import { offeredPlans, type AgentStage } from '../../../game/missions/agentRunner';
import type { CheckRow } from '../../../game/missions/predicates';
import type { MissionStep } from '../../../game/missions/schema';
import { ottoRun, trueCheckOptions } from '../../../game/play/agentPlay';
import type { MissionActivity } from '../../../game/play/playStore';
import { useStore } from '../../useStore';
import { CheckCard } from './CheckCard';
import { GateCard } from './GateCard';
import { OttoBubble, type OttoMood } from './OttoBubble';
import { ottoLine } from './ottoLines';
import { EchoChoice, PlanCards } from './PlanCards';
import { PredictCard } from './PredictCard';
import { ResultCard } from './ResultCard';
import { RunLog } from './RunLog';

/** Otto's face for the stage: busy while he works, waiting whenever Kyle has the move. */
function moodOf(stage: AgentStage, rows: readonly RunRow[]): OttoMood {
  if (stage.at !== 'running') return 'waiting';
  return rows.at(-1)?.status === 'failed' ? 'failed' : 'typing';
}

/**
 * A directed step in the play panel (docs/act1-directed.md section 1.3): Otto's bubble,
 * then whatever Kyle decides at this stage, then the run log. Every choice is a button
 * that calls agentPlay, which ignores a click the stage doesn't allow. `checklist` is the
 * step's checks, empty until the result, which shows them.
 */
export function AgentStepView({
  activity,
  step,
  hintLevel,
  checklist,
}: {
  activity: MissionActivity;
  step: MissionStep;
  hintLevel: number;
  checklist: readonly CheckRow[];
}) {
  const { rows, last } = useStore(ottoRun);
  const { agent } = activity;
  const task = step.agent;
  if (agent === null || task === undefined) return null;
  const { stage } = agent;
  const line = ottoLine(agent, task, last, activity.run.stepIndex === 0);
  return (
    <div className="agent-step">
      {task.note === undefined ? null : <p className="play-panel__muted">{task.note}</p>}
      <OttoBubble line={line} mood={moodOf(stage, rows)} flash={rows.length} />
      {stage.at === 'direct' ? (
        <PlanCards
          plans={offeredPlans(agent, step)}
          hinted={hintLevel === 3 ? task.hintPlan : null}
        />
      ) : null}
      {stage.at === 'echo' ? <EchoChoice planId={stage.planId} /> : null}
      {/* Keyed by how many decisions came before, so each new card mounts unarmed. */}
      {stage.at === 'predict' ? (
        <PredictCard key={`predict-${String(agent.predicts.length)}`} action={stage.action} />
      ) : null}
      {stage.at === 'gate' ? (
        <GateCard
          key={`gate-${String(agent.gates.length)}`}
          gate={stage.gate}
          action={stage.action}
        />
      ) : null}
      {stage.at === 'check' ? <CheckCard task={task} /> : null}
      {stage.at === 'result' ? (
        <ResultCard
          task={task}
          stage={stage}
          checklist={checklist}
          trueIds={stage.verdict === 'missed' ? trueCheckOptions(activity) : []}
        />
      ) : null}
      <RunLog rows={rows} running={stage.at === 'running'} />
    </div>
  );
}
