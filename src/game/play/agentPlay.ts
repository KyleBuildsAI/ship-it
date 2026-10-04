import {
  feedAction,
  feedOutcome,
  feedTyping,
  startFeed,
  type FeedBeat,
  type FeedState,
} from '../agent/feed';
import { advance, START, type Pace, type Playhead } from '../agent/pace';
import { showInTerminal } from '../agent/terminalFeed';
import {
  answerCheck,
  backToCards,
  beginAgentStep,
  choosePlan,
  completeAgentStep,
  confirmAsked,
  echoPlan,
  finishScript,
  nextAction,
  openFixRound,
  stars,
  toDriverAction,
  type AgentStepState,
  type QueuedAction,
} from '../missions/agentRunner';
import type { AgentTask } from '../missions/agentSchema';
import { explain, type CheckRow } from '../missions/predicates';
import { MissionRunError } from '../missions/runner';
import type { MissionStep } from '../missions/schema';
import { saveProgressNow } from '../progress';
import { sandbox } from '../sandbox';
import { play, type MissionActivity } from './playStore';
import { applyChange, currentQueries, recordAction } from './sandboxControl';
import { recordSteps } from './saveRules';

/*
 * Plays a directed step (docs/act1-directed.md sections 1.3 and 1.4). Kyle picks a card,
 * Otto works through its script at a readable pace, and Kyle checks his claim.
 *
 * agentRunner.ts decides what is legal and keeps the score; it never touches a sandbox.
 * This file is its hands: it drives each action through the live sandbox, logs it so a
 * replay can rebuild it, and feeds the terminal what Otto types. The step's
 * state lives in the play store (MissionActivity.agent), where the panels read it. Otto's
 * playback (the beats still to show, the action waiting on them) lives here, because it
 * changes every drawn frame and no panel draws it.
 *
 * So far Otto runs every action as it comes, answers included. Approval gates, predictions,
 * Stop and Rewind are the next layer on top of this one.
 */

/** What Otto still has to show in the terminal, and the action waiting on it. */
interface Playback {
  /** The mission attempt and step it belongs to, so a replay never picks up an old one. */
  readonly attempt: number;
  readonly stepId: string;
  feed: FeedState;
  beats: readonly FeedBeat[];
  head: Playhead;
  /** Typed and waiting for its typing to show: driven once it has, so output follows input. */
  driveNext: QueuedAction | null;
}

let playback: Playback | null = null;

/** More turns than any script can take in one frame: past it, something loops. */
const MAX_TURNS = 1000;

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

function saveAgent(agent: AgentStepState): void {
  const current = missionActivity();
  if (current !== null) setMission({ ...current, agent });
}

function activeTab(): number {
  return sandbox.get().shell.ws.machine?.active().id ?? 1;
}

/**
 * Starts the step the run is on, if it is directed: its `before` changes go into the live
 * sandbox and its log, and Otto waits for a card. Anything else, a typed step or the end of the sim, leaves no agent on screen.
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
    // No prompt yet: the terminal skips a prompt that matches the one already waiting.
    feed: startFeed(activeTab()),
    beats: [],
    head: START,
    driveNext: null,
  };
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
  if (now !== null && picking) saveAgent(choosePlan(now.agent, now.step, planId));
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
      if (!played.done) {
        shown.head = played.head;
        return;
      }
      shown.beats = [];
      shown.head = START;
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
  const next = nextAction(agent);
  if (next === null) {
    saveAgent(finishScript(agent));
    return false;
  }
  saveAgent(next.state);
  // A line to predict waits at the prompt, typed but not run, until Kyle answers.
  typeOut(next.action);
  if (next.state.stage.at === 'running') shown.driveNext = next.action;
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

/** Runs an action in the live sandbox, logs it, and feeds its output to the terminal. */
function driveAction(action: QueuedAction): void {
  if (playback === null) return;
  const step = recordAction(toDriverAction(action));
  const fed =
    playback.feed.typed === null
      ? feedAction(playback.feed, step)
      : feedOutcome(playback.feed, step);
  appendBeats(fed.beats, fed.state);
  const agent = missionActivity()?.agent;
  if (step.asking && agent !== null && agent !== undefined) saveAgent(confirmAsked(agent, action));
}

/**
 * A look chip: one of Kyle's read-only lines, run at once and printed without Otto's
 * marker. It goes in the log too, so a replay rebuilds the same terminal.
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
  const agent = answerCheck(now.agent, now.step, optionId, currentQueries());
  const passed = agent.stage.at === 'result' && agent.stage.passed;
  const earned = passed ? { ...now.current.stars, [now.step.id]: stars(agent) } : now.current.stars;
  setMission({ ...now.current, agent, stars: earned });
}

/** "Direct a fix": after a result that didn't pass, back to the cards for a fix round. */
export function directFix(): void {
  const now = live();
  if (now?.agent.stage.at === 'result' && !now.agent.stage.passed) {
    saveAgent(openFixRound(now.agent));
  }
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
