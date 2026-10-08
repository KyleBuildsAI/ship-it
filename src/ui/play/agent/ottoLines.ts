import { describeChanges } from '../../../game/agent/effects';
import type { AgentStepState } from '../../../game/missions/agentRunner';
import { FIX_ROUND_LINES, type AgentTask, type Plan } from '../../../game/missions/agentSchema';
import type { OttoEvent } from '../../../game/play/agentPlay';
import { display } from '../../../engine/machine/winPath';

/*
 * What Otto says in his bubble (docs/act1-directed.md section 1.2): short, upbeat and
 * literal. Lines written for one step (a `say`, a `denyLine`, a claim) come from the
 * content; the lines every step shares live here, so they read the same everywhere.
 */

/** His first line, so Kyle knows from the start that Otto's slips are on purpose. */
export const OTTO_INTRO = "I'm Otto. Scripted for this course, so my slips teach.";
export const YOUR_CALL = 'Your call.';
export const ON_IT = 'On it.';
export const PREDICT_ASK = 'Before I run it: what do you think happens?';
export const NEEDS_OK = 'This one changes things. Okay to run it?';
export const GOOD_STOP = 'Good stop. What should I do instead?';
export const DIFFERENT_WAY = 'Okay, trying it a different way.';

/** Every plan the step has, start cards and fixes, so a claim can be found by id. */
export function planById(task: AgentTask, planId: string): Plan | undefined {
  return [...task.plans, ...task.fixes].find((plan) => plan.id === planId);
}

/**
 * The words on a gate's effect line, lowered to fit after "I need this to finish:".
 * PowerShell paths keep their capitals: only the first letter changes.
 */
function firstEffect(changes: Parameters<typeof describeChanges>[0]): string | null {
  const [effect] = describeChanges(changes, display);
  if (effect === undefined) return null;
  return effect.charAt(0).toLowerCase() + effect.slice(1);
}

/** What Otto says after a deny, a stop or a missed check sent him back for directions. */
function fixRoundLine(last: OttoEvent | null): string {
  switch (last?.kind) {
    case 'denied':
      return last.line ?? (last.harmful ? GOOD_STOP : FIX_ROUND_LINES[0]);
    case 'fixing':
      return FIX_ROUND_LINES[1];
    // An action's `say` is about running it, not about why Otto stopped.
    case 'said':
    case 'stopped':
    case undefined:
      return FIX_ROUND_LINES[0];
  }
}

/**
 * Otto's line for the stage on screen. `last` is the latest thing he did that gives him
 * something to say; `firstStep` is true on a mission's first step, where he introduces
 * himself before Kyle's first pick.
 */
export function ottoLine(
  agent: AgentStepState,
  task: AgentTask,
  last: OttoEvent | null,
  firstStep: boolean,
): string {
  const { stage } = agent;
  const said = last?.kind === 'said' ? last.text : null;
  switch (stage.at) {
    case 'direct':
      if (stage.round === 'fix') return fixRoundLine(last);
      return firstStep && agent.tried.length === 0 ? OTTO_INTRO : YOUR_CALL;
    case 'echo':
      return `Plan: ${planById(task, stage.planId)?.text ?? ''} Go?`;
    case 'running':
      if (last?.kind === 'denied') return last.line ?? DIFFERENT_WAY;
      return said ?? ON_IT;
    case 'predict':
      return PREDICT_ASK;
    case 'gate': {
      const effect = firstEffect(stage.gate.changes);
      if (stage.again && effect !== null) return `I need this to finish: ${effect}. Run it?`;
      // The gate's own action's words, never an earlier line's: Kyle is approving this one.
      return ('say' in stage.action ? stage.action.say : undefined) ?? NEEDS_OK;
    }
    case 'check':
    case 'result':
      return planById(task, stage.planId)?.claim ?? ON_IT;
  }
}
