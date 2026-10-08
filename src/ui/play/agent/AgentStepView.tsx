import type { RunRow } from '../../../game/agent/runLog';
import { offeredPlans, type AgentStage } from '../../../game/missions/agentRunner';
import type { MissionStep } from '../../../game/missions/schema';
import { ottoRun } from '../../../game/play/agentPlay';
import type { MissionActivity } from '../../../game/play/playStore';
import { useStore } from '../../useStore';
import { GateCard } from './GateCard';
import { OttoBubble, type OttoMood } from './OttoBubble';
import { ottoLine } from './ottoLines';
import { EchoChoice, PlanCards } from './PlanCards';
import { PredictCard } from './PredictCard';
import { RunLog } from './RunLog';

/** Otto's face for the stage: busy while he works, waiting whenever Kyle has the move. */
function moodOf(stage: AgentStage, rows: readonly RunRow[]): OttoMood {
  if (stage.at !== 'running') return 'waiting';
  return rows.at(-1)?.status === 'failed' ? 'failed' : 'typing';
}

/**
 * A directed step in the play panel (docs/act1-directed.md section 1.3): Otto's bubble,
 * then whatever Kyle decides at this stage, then the run log. Every choice is a button
 * that calls agentPlay, which ignores a click the stage doesn't allow.
 */
export function AgentStepView({
  activity,
  step,
  hintLevel,
}: {
  activity: MissionActivity;
  step: MissionStep;
  hintLevel: number;
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
      {stage.at === 'predict' ? <PredictCard action={stage.action} /> : null}
      {stage.at === 'gate' ? <GateCard gate={stage.gate} action={stage.action} /> : null}
      <RunLog rows={rows} running={stage.at === 'running'} />
    </div>
  );
}
