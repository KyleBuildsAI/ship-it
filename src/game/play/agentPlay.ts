import {
  feedAction,
  feedCancel,
  feedOutcome,
  feedTyping,
  startFeed,
  type FeedBeat,
  type FeedState,
} from '../agent/feed';
import type { MachineChange } from '../../engine/machine/snapshot';
import { display } from '../../engine/machine/winPath';
import { advance, NORMAL_PACE, START, type Pace, type Playhead } from '../agent/pace';
import type { SandboxLog } from '../agent/replay';
import { EMPTY_RUN_LOG, logDenied, logReveals, type RunLog, type RunRow } from '../agent/runLog';
import { showInTerminal } from '../agent/terminalFeed';
import {
  answerCheck,
  answerPredict,
  backToCards,
  beginAgentStep,
  choosePlan,
  completeAgentStep,
  confirmAsked,
  decideGate,
  echoPlan,
  finishScript,
  nextAction,
  openFixRound,
  openGate,
  outcomeHolds,
  pausesBefore,
  REFUSAL,
  rewindStep,
  stars,
  stopScript,
  toDriverAction,
  type AgentStepState,
  type QueuedAction,
} from '../missions/agentRunner';
import type { AgentTask, ApprovalMode } from '../missions/agentSchema';
import { evaluate, explain, type CheckRow } from '../missions/predicates';
import { MissionRunError } from '../missions/runner';
import type { Mission, MissionStep } from '../missions/schema';
import { saveProgressNow } from '../progress';
import { sandbox } from '../sandbox';
import { createStore } from '../store';
import { play, type MissionActivity, type SlipMet } from './playStore';
import {
  applyChange,
  currentLog,
  currentQueries,
  dryRunNow,
  recordAction,
  rewindTo,
} from './sandboxControl';
import { recordSteps } from './saveRules';

/*
 * Plays a directed step (docs/act1-directed.md sections 1.3 and 1.4). Kyle picks a card,
 * Otto works through its script at a readable pace, and Kyle checks his claim.
 *
 * agentRunner.ts decides what is legal and keeps the score; it never touches a sandbox.
 * This file is its hands: it drives each action through the live sandbox, logs it so a
 * dry run or a rewind can replay it, and feeds the terminal what Otto types. The step's
 * state lives in the play store (MissionActivity.agent), where the panels read it. Otto's
 * playback (the beats still to show, the action waiting on them) lives here, because it
 * changes every drawn frame and no panel draws it.
 */

/** What Otto still has to show in the terminal, and the action waiting on it. */
interface Playback {
  /** The mission attempt and step it belongs to, so a replay never picks up an old one. */
  readonly attempt: number;
  readonly stepId: string;
  /** The log as the step began, after its `before`: what Rewind goes back to. */
  readonly checkpoint: SandboxLog;
  feed: FeedState;
  beats: readonly FeedBeat[];
  head: Playhead;
  /** Typed and waiting for its typing to show: driven once it has, so output follows input. */
  driveNext: QueuedAction | null;
  /** The action waiting on Kyle at a gate. */
  held: QueuedAction | null;
  /** Kyle pressed Stop. Otto stops at the next gap between lines, never halfway through one. */
  stopAsked: boolean;
  /**
   * After Kyle predicts, what the line will change, shown as a ghost before it runs. The
   * line waits until `heldMs` reaches the ghost's time at Otto's pace (ghostMs).
   */
  ghost: { readonly changes: readonly MachineChange[]; heldMs: number } | null;
  /** The run log as far as the terminal has shown, the line being typed included. */
  runLog: RunLog;
}

let playback: Playback | null = null;

/**
 * The last thing that gave Otto something to say. The panel turns it into his words
 * (ui/play/agent/ottoLines.ts), so the lines every step shares live in one place.
 * - said: the `say` of the action Otto is on. It is cleared when he moves on to an action
 *   with no `say`, so his words are never about a line he has already left behind.
 * - stopped: Kyle pressed Stop
 * - denied: Kyle denied a line. `line` is the content's `denyLine` for it, if it has one:
 *   Otto's answer to the deny, which stays up while he works on plan B.
 * - fixing: Kyle chose "Direct a fix" after a check that didn't pass
 */
export type OttoEvent =
  | { readonly kind: 'said'; readonly text: string }
  | { readonly kind: 'stopped' }
  | { readonly kind: 'denied'; readonly harmful: boolean; readonly line: string | null }
  | { readonly kind: 'fixing' };

/**
 * What the directing panels draw beside the play store: Otto's finished rows and his last
 * event. It is a store of its own because rows arrive with drawn frames, and the play
 * store's listeners (grading, saving) have no use for them.
 */
export interface OttoRun {
  readonly rows: readonly RunRow[];
  readonly last: OttoEvent | null;
}

export const ottoRun = createStore<OttoRun>({ rows: [], last: null });

function ottoDid(last: OttoEvent | null): void {
  ottoRun.update({ last });
}

/** More turns than any script can take in one frame: past it, something loops. */
const MAX_TURNS = 1000;

/** How long the ghost shows after a prediction, at the normal pace (spec 1.3, Predict). */
const GHOST_MS = 1500;

/**
 * The ghost's time at `pace`: shorter at 2×, and none at the instant pace, since reduced
 * motion and test robots want no waiting. It scales with the settle time, which is the
 * pause after a result that the ghost stands in for.
 */
function ghostMs(pace: Pace): number {
  return Math.round((GHOST_MS * pace.settleMs) / NORMAL_PACE.settleMs);
}

const REWIND_NOTICE = 'Rewound to the start of the step. A real laptop has no rewind.';

function missionActivity(): MissionActivity | null {
  const current = play.get().activity;
  return current?.kind === 'mission' ? current : null;
}

/** The directed step being played right now, with everything needed to play it. */
interface Live {
  readonly current: MissionActivity;
  readonly agent: AgentStepState;
  readonly step: MissionStep;
  readonly task: AgentTask;
  readonly playback: Playback;
}

function live(): Live | null {
  const current = missionActivity();
  const agent = current?.agent ?? null;
  if (current === null || agent === null || current.run.phase !== 'sim') return null;
  const step = current.mission.steps[current.run.stepIndex];
  const task = step?.agent;
  if (step === undefined || task === undefined || playback === null) return null;
  if (playback.attempt !== current.attempt || playback.stepId !== agent.stepId) return null;
  return { current, agent, step, task, playback };
}

/** A directed mission must say which changes pause Otto; the schema makes sure it does. */
function approvalsOf(mission: Mission): ApprovalMode {
  if (mission.approvals === undefined) {
    throw new MissionRunError(`Mission "${mission.id}" is directed but sets no approvals.`);
  }
  return mission.approvals;
}

/**
 * The checklist beside the terminal for a directed step. It stays empty until the result:
 * showing the step's checks while Kyle decides would answer his check for him.
 */
export function directedChecklist(current: MissionActivity): CheckRow[] {
  const step = current.mission.steps[current.run.stepIndex];
  if (current.agent?.stage.at !== 'result' || step?.agent === undefined) return [];
  return explain({ kind: 'all', of: [step.success, ...step.agent.guards] }, currentQueries());
}

function setMission(next: MissionActivity): void {
  play.update({ activity: next, checklist: directedChecklist(next) });
}

/**
 * Adds a slip Kyle met, replacing any earlier entry for the same step and card. Rewind
 * undoes an attempt on the laptop, so the latest try is the one that counts: one authored
 * slip is one slip on the Done screen, however many times Kyle replays it.
 */
export function meetSlip(slips: readonly SlipMet[], met: SlipMet): SlipMet[] {
  const others = slips.filter(
    (entry) => entry.stepId !== met.stepId || entry.planId !== met.planId,
  );
  return [...others, met];
}

/** The slip written on a step's card, start plan or fix, if it has one. */
function slipOf(task: AgentTask, planId: string): SlipMet['slip'] | undefined {
  return [...task.plans, ...task.fixes].find((plan) => plan.id === planId)?.slip;
}

function saveAgent(agent: AgentStepState): void {
  const current = missionActivity();
  if (current !== null) setMission({ ...current, agent });
}

function activeTab(): number {
  return sandbox.get().shell.ws.machine?.active().id ?? 1;
}

/**
 * Starts the step the run is on, if it is directed: its `before` changes go into the live
 * sandbox (and its log), and the log at that moment becomes the step's rewind point.
 * Anything else, a typed step or the end of the sim, leaves no agent on screen.
 */
export function beginDirectedStep(current: MissionActivity): MissionActivity {
  const step = current.mission.steps[current.run.stepIndex];
  if (current.run.phase !== 'sim' || step?.agent === undefined) {
    playback = null;
    return { ...current, agent: null };
  }
  if (step.agent.before.length > 0) applyChange(step.agent.before);
  playback = {
    attempt: current.attempt,
    stepId: step.id,
    checkpoint: currentLog(),
    // No prompt yet: the terminal skips a prompt that matches the one already waiting.
    feed: startFeed(activeTab()),
    beats: [],
    head: START,
    driveNext: null,
    held: null,
    stopAsked: false,
    ghost: null,
    runLog: EMPTY_RUN_LOG,
  };
  ottoRun.update({ rows: [], last: null });
  return { ...current, agent: beginAgentStep(step) };
}

/** "Say it back": Otto repeats a card as "Plan: <card>. Go?" before running it. */
export function repeatCard(planId: string): void {
  const now = live();
  if (now?.agent.stage.at === 'direct') saveAgent(echoPlan(now.agent, now.step, planId));
}

/** "Pick instead": back to the cards from Otto's repeat. */
export function pickInstead(): void {
  const now = live();
  if (now?.agent.stage.at === 'echo') saveAgent(backToCards(now.agent));
}

/**
 * Kyle picks a card (or says "Go" on a repeat). Otto starts on the next frame. A second
 * click, landing after Otto has started, is ignored: a button never throws at Kyle.
 */
export function pickCard(planId: string): void {
  const now = live();
  const stage = now?.agent.stage;
  const picking = stage?.at === 'direct' || (stage?.at === 'echo' && stage.planId === planId);
  if (now === null || !picking) return;
  // A new plan starts Otto's talk afresh: the last plan's words are about the last plan.
  ottoRun.update({ last: null });
  saveAgent(choosePlan(now.agent, now.step, planId));
}

/**
 * Moves Otto on by one drawn frame: `elapsedMs` since the last one, at `pace`. The terminal
 * gets whatever appeared, and when the beats on screen have played, Otto takes his next
 * turn. At the instant pace, one frame runs him to the next thing Kyle must decide.
 */
export function frameAgent(elapsedMs: number, pace: Pace): void {
  let elapsed = elapsedMs;
  for (let turns = 0; turns < MAX_TURNS; turns++) {
    const now = live();
    if (now === null) return;
    const shown = now.playback;
    if (shown.beats.length > 0) {
      const played = advance(shown.beats, pace, shown.head, elapsed);
      // The frame's time is spent on the beats; turns that follow happen at once.
      elapsed = 0;
      showInTerminal(played.reveals);
      shown.runLog = logReveals(shown.runLog, played.reveals);
      // Rows change only when a line ends, so the panel isn't redrawn for every key.
      ottoRun.update({ rows: shown.runLog.rows });
      if (!played.done) {
        shown.head = played.head;
        return;
      }
      shown.beats = [];
      shown.head = START;
    }
    const { ghost } = shown;
    if (ghost !== null) {
      ghost.heldMs += elapsed;
      elapsed = 0;
      if (ghost.heldMs < ghostMs(pace)) return;
      shown.ghost = null;
    }
    if (!takeTurn(now)) return;
  }
  throw new MissionRunError('Otto took too many turns in one frame.');
}

/** One move by Otto. Returns false when he waits: on Kyle, or with nothing left to do. */
function takeTurn({ agent, playback: shown }: Live): boolean {
  const typed = shown.driveNext;
  if (typed !== null) {
    shown.driveNext = null;
    driveAction(typed);
    return true;
  }
  if (agent.stage.at !== 'running') return false;
  if (shown.stopAsked) {
    shown.stopAsked = false;
    ottoDid({ kind: 'stopped' });
    saveAgent(stopScript(agent));
    return true;
  }
  const next = nextAction(agent);
  if (next === null) {
    saveAgent(finishScript(agent));
    return false;
  }
  saveAgent(next.state);
  const say = 'say' in next.action ? next.action.say : undefined;
  if (say !== undefined) ottoDid({ kind: 'said', text: say });
  // The last action's words were about that action: this one has none of its own.
  else if (ottoRun.get().last?.kind === 'said') ottoDid(null);
  if (next.state.stage.at === 'predict') {
    // The line waits at the prompt, typed but not run, while Kyle predicts.
    typeOut(next.action);
  } else {
    consider(next.action, false);
  }
  return true;
}

function appendBeats(beats: readonly FeedBeat[], feed: FeedState): void {
  if (playback === null) return;
  playback.beats = [...playback.beats, ...beats];
  playback.feed = feed;
}

/** Types a line or an answer at the prompt, ahead of driving it. Other actions type nothing. */
function typeOut(action: QueuedAction): void {
  if (playback === null) return;
  let echo: string | null = null;
  if (action.do === 'run') echo = action.line;
  else if (action.do === 'answer') echo = action.choice;
  if (echo === null) return;
  const typing = { tab: activeTab(), prompt: sandbox.get().shell.prompt(), echo };
  const fed = feedTyping(playback.feed, typing);
  appendBeats(fed.beats, fed.state);
}

/**
 * Decides what happens to an action before it runs. A dry run on a scratch copy says what
 * it would change, and the mission's approval mode says whether that pauses Otto (D6). A
 * line is weighed with every question refused, because refusing can't undo the parts of a
 * line that never ask. Otherwise its typing plays, and then it is driven.
 */
function consider(action: QueuedAction, alreadyTyped: boolean): void {
  const now = live();
  if (now === null) return;
  const driven = toDriverAction(action);
  const judge = { guards: now.task.guards };
  const dry = action.do === 'answer' ? dryRunNow(driven, judge) : dryRunNow(driven, judge, REFUSAL);
  const pauses = pausesBefore(action, dry.changes, approvalsOf(now.current.mission));
  // An answer is typed only once Kyle allows it: the gate says which letter Otto will type.
  if (!alreadyTyped && !(pauses && action.do === 'answer')) typeOut(action);
  if (!pauses) {
    now.playback.driveNext = action;
    return;
  }
  now.playback.held = action;
  const gate = {
    kind: action.do === 'answer' ? 'confirm' : 'line',
    line: gateLine(action),
    changes: dry.changes,
    harmful: dry.harmful,
  } as const;
  saveAgent(openGate(now.agent, action, gate));
}

/** The line a gate shows: the command, the line that asked, or the file Otto writes. */
function gateLine(action: QueuedAction): string {
  switch (action.do) {
    case 'run':
    case 'answer':
      return action.line;
    case 'write':
      return action.path;
    case 'newTerminal':
    case 'useTerminal':
      return action.do;
  }
}

/**
 * The run log's words for an action Otto doesn't type: his file tool, or a terminal tab.
 * Null for a line or an answer, whose row shows what he typed.
 */
function untypedLabel(action: QueuedAction): string | null {
  switch (action.do) {
    case 'run':
    case 'answer':
      return null;
    case 'write':
      return `Wrote ${display(action.path)}`;
    case 'newTerminal':
      return 'Opened a new terminal';
    case 'useTerminal':
      return `Switched to terminal ${String(action.tab)}`;
  }
}

/** Runs an action in the live sandbox, logs it, and feeds its output to the terminal. */
function driveAction(action: QueuedAction): void {
  if (playback === null) return;
  const step = recordAction(toDriverAction(action));
  const label = untypedLabel(action) ?? undefined;
  const fed =
    playback.feed.typed === null
      ? feedAction(playback.feed, step, 'otto', label)
      : feedOutcome(playback.feed, step, label);
  appendBeats(fed.beats, fed.state);
  const agent = missionActivity()?.agent;
  if (step.asking && agent !== null && agent !== undefined) saveAgent(confirmAsked(agent, action));
}

/**
 * Kyle's prediction for the line waiting at the prompt. It is graded on a dry run of the
 * line alone, before any gate, so a line Kyle then denies is judged on what it would do.
 */
export function predict(optionId: string): void {
  const now = live();
  if (now?.agent.stage.at !== 'predict') return;
  const { action } = now.agent.stage;
  const option = action.predict.options.find((candidate) => candidate.id === optionId);
  if (option === undefined) throw new MissionRunError(`There is no prediction "${optionId}".`);
  const dry = dryRunNow(toDriverAction(action), { guards: now.task.guards });
  saveAgent(answerPredict(now.agent, outcomeHolds(option.outcome, dry.step, dry.queries)));
  consider(action, true);
  // A line that runs straight on waits while its ghost shows. One that pauses at a gate
  // needs no wait: the gate holds it, and lists the same changes.
  if (now.playback.driveNext === action) now.playback.ghost = { changes: dry.changes, heldMs: 0 };
}

/** The ghost of the predicted line, while it shows: for the world's ghost tiles (A26). */
export function predictionGhost(): readonly MachineChange[] {
  return live()?.playback.ghost?.changes ?? [];
}

/**
 * Allow or Deny at a gate. Allowed, the held action runs on the next frame. Denied, a typed
 * line ends unrun, and agentRunner decides what Otto does instead: ask once more for a
 * safe line, refuse an open question, run plan B, or wait for new directions.
 */
export function decide(allow: boolean): void {
  const now = live();
  if (now?.agent.stage.at !== 'gate') return;
  const held = now.playback.held;
  const next = decideGate(now.agent, allow);
  if (next.stage.at !== 'gate') {
    now.playback.held = null;
    if (allow) now.playback.driveNext = held;
    else {
      const fed = feedCancel(now.playback.feed);
      appendBeats(fed.beats, fed.state);
      // A write or a tab change typed nothing, so no line ends in the terminal to log it.
      const label = held === null ? null : untypedLabel(held);
      if (label !== null) {
        now.playback.runLog = logDenied(now.playback.runLog, label);
        ottoRun.update({ rows: now.playback.runLog.rows });
      }
      const denyLine = held !== null && 'denyLine' in held ? held.denyLine : undefined;
      const { harmful } = now.agent.stage.gate;
      ottoDid({ kind: 'denied', harmful, line: denyLine ?? null });
      // Denying the harmful line of a card with a slip is catching that slip, even though
      // plan B may then pass the step and the check never sees it.
      const { planId } = now.agent.stage;
      const slip = slipOf(now.task, planId);
      if (harmful && slip !== undefined) {
        const met = { stepId: now.step.id, planId, slip, caught: true };
        setMission({ ...now.current, agent: next, slips: meetSlip(now.current.slips, met) });
        return;
      }
    }
  }
  saveAgent(next);
}

/** Stop: Otto finishes the line he's on, then waits for new directions. */
export function stopOtto(): void {
  const now = live();
  if (now?.agent.stage.at === 'running') now.playback.stopAsked = true;
}

/**
 * A look chip: one of Kyle's read-only lines, run at once and printed without Otto's
 * marker. It goes in the log too, so a dry run or rewind replays the same terminal.
 */
export function runLook(lookId: string): void {
  const now = live();
  if (now?.agent.stage.at !== 'check') return;
  const look = now.task.looks.find((candidate) => candidate.id === lookId);
  if (look === undefined) throw new MissionRunError(`There is no look "${lookId}".`);
  const step = recordAction({ do: 'run', line: look.line });
  const fed = feedAction(now.playback.feed, step, 'kyle');
  appendBeats(fed.beats, fed.state);
}

/**
 * Kyle's answer to "is Otto right?". The verdict comes from the live sandbox. A step that
 * passed keeps its stars, which pay XP when the mission is completed.
 */
export function checkClaim(optionId: string): void {
  const now = live();
  if (now?.agent.stage.at !== 'check') return;
  const { planId } = now.agent.stage;
  const agent = answerCheck(now.agent, now.step, optionId, currentQueries());
  if (agent.stage.at !== 'result') return;
  const { passed, verdict } = agent.stage;
  const earned = passed ? { ...now.current.stars, [now.step.id]: stars(agent) } : now.current.stars;
  // A slip counts once it reaches a check with the step still broken: that's the moment
  // Kyle either sees Otto's mistake or takes his word for it. A step that passed keeps
  // whatever a gate already recorded for this card.
  const slip = slipOf(now.task, planId);
  const slips =
    slip === undefined || passed
      ? now.current.slips
      : meetSlip(now.current.slips, {
          stepId: now.step.id,
          planId,
          slip,
          caught: verdict === 'caught',
        });
  setMission({ ...now.current, agent, stars: earned, slips });
}

/**
 * The check options that are true on the laptop now, for the result after a Missed
 * check, which shows Kyle the answer he should have picked. Empty until the result.
 */
export function trueCheckOptions(current: MissionActivity): readonly string[] {
  const step = current.mission.steps[current.run.stepIndex];
  if (current.agent?.stage.at !== 'result' || step?.agent === undefined) return [];
  const queries = currentQueries();
  return step.agent.check.options
    .filter((option) => evaluate(option.truth, queries))
    .map((option) => option.id);
}

/** "Direct a fix": after a result that didn't pass, back to the cards for a fix round. */
export function directFix(): void {
  const now = live();
  if (now?.agent.stage.at === 'result' && !now.agent.stage.passed) {
    ottoDid({ kind: 'fixing' });
    saveAgent(openFixRound(now.agent));
  }
}

/**
 * Rewind: the live sandbox goes back to how it was when the step began, and the cards
 * start over. Whatever Otto was typing or waiting on is dropped with it.
 */
export function rewind(): void {
  const now = live();
  // A step that passed has nothing to rewind, and the button does nothing.
  if (now === null || (now.agent.stage.at === 'result' && now.agent.stage.passed)) return;
  const agent = rewindStep(now.agent);
  const { playback: shown } = now;
  shown.beats = [];
  shown.head = START;
  shown.driveNext = null;
  shown.held = null;
  shown.stopAsked = false;
  shown.ghost = null;
  shown.runLog = EMPTY_RUN_LOG;
  ottoRun.update({ rows: [], last: null });
  // Before any card was picked nothing has run, so the laptop stays as it is, with no notice.
  if (now.agent.tried.length > 0) {
    rewindTo(shown.checkpoint, REWIND_NOTICE);
    shown.feed = startFeed(activeTab());
  }
  saveAgent(agent);
}

/**
 * "Next step", after a result that passed: completes exactly this step (never the later
 * ones that happen to be true already, which still need directing), saves its XP, and
 * starts the next step, or the drills.
 */
export function nextStep(): void {
  const now = live();
  if (now?.agent.stage.at !== 'result' || !now.agent.stage.passed) return;
  const { current } = now;
  const run = completeAgentStep(current.run, current.mission, currentQueries());
  const completed = run.steps.filter((step) => step.completed).map((step) => step.stepId);
  saveProgressNow((save) => recordSteps(save, current.mission, completed, run.stepIndex));
  const xpEarned = current.mission.steps
    .filter((step) => completed.includes(step.id))
    .reduce((total, step) => total + step.xp, 0);
  setMission(beginDirectedStep({ ...current, run, hint: null, xpEarned }));
}
