import { testDeps } from '../../engine/git/testDeps';
import {
  dryRun,
  dryRunRefused,
  playAction,
  replay,
  startLog,
  withEntry,
  type SandboxLog,
} from '../../game/agent/replay';
import { transcriptQueries } from '../../game/agent/transcript';
import {
  answerPredict,
  beginAgentStep,
  choosePlan,
  confirmAsked,
  decideGate,
  finishScript,
  nextAction,
  openGate,
  outcomeHolds,
  pausesBefore,
  REFUSAL,
  toDriverAction,
  type AgentStepState,
  type QueuedAction,
} from '../../game/missions/agentRunner';
import type { AgentTask } from '../../game/missions/agentSchema';
import { evaluate, type SandboxQueries } from '../../game/missions/predicates';
import { sandboxQueries } from '../../game/missions/sandbox';
import type { Mission, MissionStep } from '../../game/missions/schema';

/*
 * Test-only helpers for playing Act 1 the way the game does, with no browser: Otto's
 * script goes through agentRunner, each action is dry-run on a scratch copy (replay.ts)
 * to decide whether it pauses, and then it is driven into the live laptop and logged.
 * This mirrors src/game/play/agentPlay.ts without its pacing, so a passing test proves a
 * card reaches its result through the same rules Kyle plays by.
 */

/** How Kyle answers gates: allow everything, or deny exactly the lines that do harm. */
export type GatePolicy = 'allow-all' | 'deny-harmful';

/** A line Otto typed, and how it went. */
export interface LineRun {
  readonly line: string;
  readonly exitCode: number;
  /** The content marked the line as failing on purpose. */
  readonly fails: boolean;
  /** What the terminal printed for it. */
  readonly output: string;
}

/** A gate Otto paused at, and what the dry run said. */
export interface GateSeen {
  readonly line: string;
  readonly harmful: boolean;
}

/** A prediction Otto stopped for, and which of its options came true. */
export interface PredictSeen {
  readonly question: string;
  readonly trueOptions: readonly string[];
}

/** Where a card left things: the laptop as a log, Otto's state, and what happened on the way. */
export interface CardPlayed {
  readonly log: SandboxLog;
  readonly state: AgentStepState;
  readonly lines: readonly LineRun[];
  readonly gates: readonly GateSeen[];
  readonly predicts: readonly PredictSeen[];
}

/** Questions about the laptop a log builds, as the grading sees it. */
export function queriesOf(log: SandboxLog): SandboxQueries {
  const { shell, transcript } = replay(log, testDeps());
  return sandboxQueries(shell.ws, transcriptQueries(transcript));
}

function taskOf(step: MissionStep): AgentTask {
  if (step.agent === undefined) throw new Error(`Step "${step.id}" is not directed.`);
  return step.agent;
}

/** The step's `before` applied to a log, as play does when the step starts. */
export function beginStep(log: SandboxLog, step: MissionStep): SandboxLog {
  const { before } = taskOf(step);
  return before.length === 0 ? log : withEntry(log, { kind: 'steps', steps: before });
}

/**
 * Picks a card and plays Otto's whole script, until he claims he's done (stage `check`)
 * or stops for new directions (stage `direct`). Each prediction is answered with the
 * option that comes true, so the run is the same as with no prediction at all.
 */
export function playCard(
  mission: Mission,
  step: MissionStep,
  from: { readonly log: SandboxLog; readonly state: AgentStepState },
  planId: string,
  policy: GatePolicy,
): CardPlayed {
  const task = taskOf(step);
  const judge = { guards: task.guards };
  if (mission.approvals === undefined) throw new Error('A directed mission sets approvals.');
  const mode = mission.approvals;
  const live = replay(from.log, testDeps());
  let log = from.log;
  let state = choosePlan(from.state, step, planId);
  const lines: LineRun[] = [];
  const gates: GateSeen[] = [];
  const predicts: PredictSeen[] = [];

  const drive = (action: QueuedAction) => {
    const driven = toDriverAction(action);
    const result = playAction(live.shell, live.transcript, driven);
    log = withEntry(log, { kind: 'action', action: driven });
    if (action.do === 'run') {
      lines.push({
        line: action.line,
        exitCode: result.exitCode,
        fails: action.fails === true,
        output: result.lines.map((printed) => printed.text).join('\n'),
      });
    }
    if (result.asking) state = confirmAsked(state, action);
  };

  for (let turns = 0; turns < 100 && state.stage.at === 'running'; turns++) {
    const next = nextAction(state);
    if (next === null) {
      state = finishScript(state);
      break;
    }
    state = next.state;
    const { action } = next;
    if (state.stage.at === 'predict') {
      const { predict } = state.stage.action;
      const dry = dryRun(log, toDriverAction(action), judge, testDeps());
      const trueOptions = predict.options
        .filter((option) => outcomeHolds(option.outcome, dry.step, dry.queries))
        .map((option) => option.id);
      predicts.push({ question: predict.question, trueOptions });
      state = answerPredict(state, trueOptions.length > 0);
    }
    const driven = toDriverAction(action);
    const dry =
      action.do === 'answer'
        ? dryRun(log, driven, judge, testDeps())
        : dryRunRefused(log, driven, judge, testDeps(), REFUSAL);
    if (!pausesBefore(action, dry.changes, mode)) {
      drive(action);
      continue;
    }
    const line = action.do === 'run' || action.do === 'answer' ? action.line : action.do;
    gates.push({ line, harmful: dry.harmful });
    const kind = action.do === 'answer' ? 'confirm' : 'line';
    state = openGate(state, action, { kind, line, changes: dry.changes, harmful: dry.harmful });
    const allow = policy === 'allow-all' || !dry.harmful;
    state = decideGate(state, allow);
    // Denying a safe line makes Otto ask once more; Kyle gives the same answer again.
    if (state.stage.at === 'gate') state = decideGate(state, allow);
    if (allow) drive(action);
  }
  return { log, state, lines, gates, predicts };
}

/**
 * The reference path up to (not including) step `upTo`: each earlier step's `before`,
 * then its hint card, the strong one the last hint names. It's the laptop Kyle meets at
 * that step when he played the steps before it well.
 */
export function canonicalStart(mission: Mission, upTo: number): SandboxLog {
  let log = startLog(mission.initialRepoState);
  mission.steps.slice(0, upTo).forEach((step) => {
    const begun = beginStep(log, step);
    const start = { log: begun, state: beginAgentStep(step) };
    log = playCard(mission, step, start, taskOf(step).hintPlan, 'allow-all').log;
  });
  return log;
}

/** The ids of the check options that are true on the laptop a log builds. */
export function trueChecks(step: MissionStep, log: SandboxLog): string[] {
  const queries = queriesOf(log);
  return taskOf(step)
    .check.options.filter((option) => evaluate(option.truth, queries))
    .map((option) => option.id);
}
