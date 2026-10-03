import type { OutputLine } from '../../engine/git/cli/output';
import type { AgentAction, AgentTask, Outcome, Plan } from './agentSchema';
import { evaluate, type SandboxQueries } from './predicates';
import { MissionRunError, type MissionRun } from './runner';
import type { Mission, MissionStep } from './schema';

/*
 * One directed step as a pure state machine (docs/act1-directed.md sections 1.3, 1.4 and
 * 5.6). Kyle picks a request card, Otto works through its script, Kyle checks Otto's
 * claim, and the result says how it went:
 *
 *   direct -> (echo) -> running -> check -> result
 *                        |  ^
 *                      predict
 *
 * Like runner.ts, nothing here waits, draws or touches a sandbox. The play layer drives
 * each action through the real shell and tells this module what happened, so every
 * transition is a one-line test, and the grading never depends on what a command says:
 * only on the state it leaves behind.
 */

/** How Kyle's check of Otto's claim came out (section 1.4's table). */
export type Verdict = 'confirmed' | 'caught' | 'missed' | 'false-alarm';

/** Kyle's first pick, or a fix after a stop or a failed check. */
export type Round = 'start' | 'fix';

/** A run line with a prediction for Kyle to make before it runs. */
export type PredictedAction = Extract<AgentAction, { do: 'run' }> & {
  readonly predict: NonNullable<Extract<AgentAction, { do: 'run' }>['predict']>;
};

export type AgentStage =
  /** Kyle picks a card. A fix round offers the fixes and the start cards not tried yet. */
  | { readonly at: 'direct'; readonly round: Round }
  /** Otto repeats a request back, "Plan: <card>. Go?", before running it. */
  | { readonly at: 'echo'; readonly round: Round; readonly planId: string }
  /** Otto works through his queue, one action at a time. Stop is allowed here. */
  | { readonly at: 'running'; readonly planId: string; readonly queue: readonly AgentAction[] }
  /** A line waits at the prompt while Kyle predicts what it will do. */
  | {
      readonly at: 'predict';
      readonly planId: string;
      readonly action: PredictedAction;
      readonly queue: readonly AgentAction[];
    }
  /** Otto claims he's done. Kyle answers one question about the result. */
  | { readonly at: 'check'; readonly planId: string }
  | {
      readonly at: 'result';
      readonly planId: string;
      readonly optionId: string;
      readonly verdict: Verdict;
      /** The step's success and every guard hold: the step is done. */
      readonly passed: boolean;
      readonly guardBroken: boolean;
    };

export interface AgentStepState {
  readonly stepId: string;
  readonly stage: AgentStage;
  /**
   * Every card picked this step, in order. A fix round leaves out the start cards in here,
   * but every fix stays on offer (section 1.3): the same cleanup may be needed again, and
   * the Plan star already counts each extra card.
   */
  readonly tried: readonly string[];
  /** Whether each gate decision was right. */
  readonly gates: readonly boolean[];
  /** Whether each prediction was right. */
  readonly predicts: readonly boolean[];
  readonly verdicts: readonly Verdict[];
  readonly rewound: boolean;
  /** Kyle saw the hint that names the card, which costs the Plan star. */
  readonly hintRung3: boolean;
}

/** The three skills a step rewards: directing well, approving well, checking well. */
export interface Stars {
  readonly plan: boolean;
  readonly safety: boolean;
  readonly check: boolean;
}

/** XP per star, paid the first time a mission is completed (decision D15). */
export const STAR_XP = 2;

function agentTask(step: MissionStep): AgentTask {
  if (step.agent === undefined) {
    throw new MissionRunError(`Step "${step.id}" is typed, not directed.`);
  }
  return step.agent;
}

function expectStep(state: AgentStepState, step: MissionStep): AgentTask {
  if (state.stepId !== step.id) {
    throw new MissionRunError(`This state is for step "${state.stepId}", not "${step.id}".`);
  }
  return agentTask(step);
}

type StageAt<At extends AgentStage['at']> = Extract<AgentStage, { at: At }>;

function expectStage<At extends AgentStage['at']>(
  state: AgentStepState,
  at: At,
  doing: string,
): StageAt<At> {
  if (state.stage.at !== at) {
    throw new MissionRunError(`Can't ${doing} while Otto is at ${state.stage.at}.`);
  }
  // The check above proves it; TypeScript can't narrow a union by a generic key.
  return state.stage as StageAt<At>;
}

export function beginAgentStep(step: MissionStep): AgentStepState {
  agentTask(step);
  return {
    stepId: step.id,
    stage: { at: 'direct', round: 'start' },
    tried: [],
    gates: [],
    predicts: [],
    verdicts: [],
    rewound: false,
    hintRung3: false,
  };
}

/** The cards on screen: the start plans, or in a fix round the fixes and untried plans. */
export function offeredPlans(state: AgentStepState, step: MissionStep): readonly Plan[] {
  const task = expectStep(state, step);
  const { stage } = state;
  if (stage.at !== 'direct' && stage.at !== 'echo') return [];
  if (stage.round === 'start') return task.plans;
  return [...task.fixes, ...task.plans.filter((plan) => !state.tried.includes(plan.id))];
}

function offeredPlan(state: AgentStepState, step: MissionStep, planId: string): Plan {
  const plan = offeredPlans(state, step).find((offered) => offered.id === planId);
  if (plan === undefined) throw new MissionRunError(`Card "${planId}" isn't on offer now.`);
  return plan;
}

/** Otto repeats Kyle's request back before acting on it, as he will for free text. */
export function echoPlan(state: AgentStepState, step: MissionStep, planId: string): AgentStepState {
  const { round } = expectStage(state, 'direct', 'repeat a plan back');
  offeredPlan(state, step, planId);
  return { ...state, stage: { at: 'echo', round, planId } };
}

/** "Pick instead": back to the cards without running anything. */
export function backToCards(state: AgentStepState): AgentStepState {
  const { round } = expectStage(state, 'echo', 'go back to the cards');
  return { ...state, stage: { at: 'direct', round } };
}

/** Kyle's pick, from the cards or as "Go" on an echo. Otto starts on its script. */
export function choosePlan(
  state: AgentStepState,
  step: MissionStep,
  planId: string,
): AgentStepState {
  const { stage } = state;
  if (stage.at === 'echo' && stage.planId !== planId) {
    throw new MissionRunError(`Otto repeated back "${stage.planId}", not "${planId}".`);
  }
  if (stage.at !== 'direct' && stage.at !== 'echo') {
    throw new MissionRunError(`Can't pick a card while Otto is at ${stage.at}.`);
  }
  const plan = offeredPlan(state, step, planId);
  return {
    ...state,
    tried: [...state.tried, plan.id],
    stage: { at: 'running', planId: plan.id, queue: plan.script },
  };
}

/**
 * Hands play Otto's next action, or null when his queue is empty (then call
 * finishScript). A line with a prediction stops at the prompt for Kyle's guess. Play
 * drives anything else through the shell, and the world shows it.
 */
export function nextAction(
  state: AgentStepState,
): { readonly action: AgentAction; readonly state: AgentStepState } | null {
  const stage = expectStage(state, 'running', "take Otto's next action");
  const [action, ...queue] = stage.queue;
  if (action === undefined) return null;
  if (isPredicted(action)) {
    return {
      action,
      state: { ...state, stage: { at: 'predict', planId: stage.planId, action, queue } },
    };
  }
  return { action, state: { ...state, stage: { ...stage, queue } } };
}

function isPredicted(action: AgentAction): action is PredictedAction {
  return action.do === 'run' && action.predict !== undefined;
}

/**
 * Records whether Kyle's prediction held. Play grades it with outcomeHolds on a dry run of
 * the line, so a line Kyle then denies is judged on what it would have done. The line is
 * still in play's hands to drive.
 */
export function answerPredict(state: AgentStepState, correct: boolean): AgentStepState {
  const { planId, queue } = expectStage(state, 'predict', 'answer a prediction');
  return {
    ...state,
    predicts: [...state.predicts, correct],
    stage: { at: 'running', planId, queue },
  };
}

/**
 * Whether a predict option's outcome held: every part it names must. `result` reads the
 * exit code, `printed` the line's output (ignoring case), `state` the sandbox after it.
 */
export function outcomeHolds(
  outcome: Outcome,
  result: { readonly lines: readonly OutputLine[]; readonly exitCode: number },
  queries: SandboxQueries,
): boolean {
  const printed = result.lines.map((line) => line.text.toLowerCase()).join('\n');
  return (
    (outcome.result === undefined || (outcome.result === 'error') === (result.exitCode !== 0)) &&
    (outcome.printed === undefined || printed.includes(outcome.printed.toLowerCase())) &&
    (outcome.state === undefined || evaluate(outcome.state, queries))
  );
}

/** Stop, between lines: back to the cards, with the plan marked as tried. */
export function stopScript(state: AgentStepState): AgentStepState {
  expectStage(state, 'running', 'stop Otto');
  return { ...state, stage: { at: 'direct', round: 'fix' } };
}

/** Otto's queue is empty, so he claims he's done and Kyle checks. */
export function finishScript(state: AgentStepState): AgentStepState {
  const { planId, queue } = expectStage(state, 'running', 'finish the script');
  if (queue.length > 0) throw new MissionRunError('Otto still has actions queued.');
  return { ...state, stage: { at: 'check', planId } };
}

/** The step is done when its success and every guard hold (section 1.4). */
export function stepPasses(step: MissionStep, queries: SandboxQueries): boolean {
  const { guards } = agentTask(step);
  return evaluate(step.success, queries) && guards.every((guard) => evaluate(guard, queries));
}

/**
 * Kyle's answer to the check. The right option is whichever one's truth holds now, so the
 * verdict comes from the sandbox, never from a flag in the content.
 */
export function answerCheck(
  state: AgentStepState,
  step: MissionStep,
  optionId: string,
  queries: SandboxQueries,
): AgentStepState {
  const task = expectStep(state, step);
  const { planId } = expectStage(state, 'check', "check Otto's claim");
  const option = task.check.options.find((candidate) => candidate.id === optionId);
  if (option === undefined) throw new MissionRunError(`There is no check option "${optionId}".`);
  const passed = stepPasses(step, queries);
  const verdict = verdictFor(evaluate(option.truth, queries), passed);
  const guardBroken = !task.guards.every((guard) => evaluate(guard, queries));
  return {
    ...state,
    verdicts: [...state.verdicts, verdict],
    stage: { at: 'result', planId, optionId, verdict, passed, guardBroken },
  };
}

/** Section 1.4's table: was Kyle's answer true, and did the step pass? */
function verdictFor(optionTrue: boolean, passed: boolean): Verdict {
  if (optionTrue) return passed ? 'confirmed' : 'caught';
  return passed ? 'false-alarm' : 'missed';
}

/** After a result that didn't pass: "Missed that. How should I fix it?" */
export function openFixRound(state: AgentStepState): AgentStepState {
  const { passed } = expectStage(state, 'result', 'open a fix round');
  if (passed) throw new MissionRunError('The step passed: there is nothing to fix.');
  return { ...state, stage: { at: 'direct', round: 'fix' } };
}

/**
 * Rewind to the start of the step. Play swaps the sandbox back to the log kept when the
 * step began, and the cards start over. It costs the Plan star: a real laptop has no rewind.
 */
export function rewindStep(state: AgentStepState): AgentStepState {
  const { stage } = state;
  if (stage.at === 'result' && stage.passed) {
    throw new MissionRunError('The step passed: there is nothing to rewind.');
  }
  return { ...state, rewound: true, stage: { at: 'direct', round: 'start' } };
}

/** Kyle saw hint rung 3, which names the card to pick. */
export function markHintRung3(state: AgentStepState): AgentStepState {
  return { ...state, hintRung3: true };
}

/**
 * The step's stars (section 1.4).
 * - Plan: the first card passed, with no fix, no rewind and no card-naming hint.
 * - Safety: every gate decision was right. Free when nothing paused.
 * - Check: every check was Confirmed or a Good catch, and every prediction was right.
 */
export function stars(state: AgentStepState): Stars {
  const { stage } = state;
  const passedFirstTime =
    stage.at === 'result' && stage.passed && state.tried.length === 1 && !state.rewound;
  return {
    plan: passedFirstTime && !state.hintRung3,
    safety: state.gates.every(Boolean),
    check:
      state.verdicts.every((verdict) => verdict === 'confirmed' || verdict === 'caught') &&
      state.predicts.every(Boolean),
  };
}

/** XP for a step's stars: STAR_XP each. */
export function starXp(earned: Stars): number {
  return [earned.plan, earned.safety, earned.check].filter(Boolean).length * STAR_XP;
}

/**
 * Completes the directed step on screen, and only that one. runner.checkStep moves on
 * through every later step that is already true, which would skip their directing, so a
 * directed mission advances here instead, once Kyle has seen a passing result.
 */
export function completeAgentStep(
  run: MissionRun,
  mission: Mission,
  queries: SandboxQueries,
): MissionRun {
  if (run.missionId !== mission.id) {
    throw new MissionRunError(`This run is for "${run.missionId}", not "${mission.id}".`);
  }
  if (run.phase !== 'sim') throw new MissionRunError(`Can't complete a step during ${run.phase}.`);
  const step = mission.steps[run.stepIndex];
  if (step === undefined) throw new MissionRunError('Every step is already done.');
  if (!stepPasses(step, queries)) {
    throw new MissionRunError(`Step "${step.id}" hasn't passed yet.`);
  }
  const steps = run.steps.map((progress, index) =>
    index === run.stepIndex
      ? { ...progress, attempts: progress.attempts + 1, completed: true }
      : progress,
  );
  const stepIndex = run.stepIndex + 1;
  return { ...run, steps, stepIndex, phase: stepIndex >= mission.steps.length ? 'drills' : 'sim' };
}
