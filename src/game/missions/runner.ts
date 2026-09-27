import type { GitQueries } from '../../engine/git/queries';
import {
  scoreDrill,
  scoreQuestionRound,
  type DrillScore,
  type QuestionRoundScore,
} from './grading';
import { evaluate } from './predicates';
import type { Act, BossTwist, Mission } from './schema';

/**
 * The mission loop from DESIGN.md section 5 as a pure state machine. Every function
 * takes the current run and returns a new one; nothing is mutated, nothing waits on a
 * timer, and the time is passed in as a number. That makes each transition a one-line
 * test, and makes a run plain data the save system can write to IndexedDB after every
 * step (pillar 7).
 *
 *   briefing -> sim -> drills -> question -> done
 */
export type MissionPhase = 'briefing' | 'sim' | 'drills' | 'question' | 'done';

/** 0 means no hints taken yet; 3 means the player has seen the command. */
export type HintLevel = 0 | 1 | 2 | 3;

export interface StepProgress {
  readonly stepId: string;
  /** How many times the step was checked while it was the one on screen. */
  readonly attempts: number;
  readonly hintLevel: HintLevel;
  readonly completed: boolean;
}

export interface DrillOutcome extends DrillScore {
  readonly drillId: string;
}

export interface QuestionRoundOutcome extends QuestionRoundScore {
  readonly picks: readonly string[];
  /** Kept for Sage to grade when the mentor is online; null when the player skipped it. */
  readonly freeText: string | null;
}

export interface MissionRun {
  readonly missionId: string;
  readonly phase: MissionPhase;
  /** The sim step on screen. Equals the step count once every step is done. */
  readonly stepIndex: number;
  readonly steps: readonly StepProgress[];
  /** The drill being played and when its clock started. */
  readonly activeDrill: { readonly drillIndex: number; readonly startedAtMs: number } | null;
  readonly drillResults: readonly DrillOutcome[];
  readonly questionRound: QuestionRoundOutcome | null;
}

/** Thrown when the UI asks for a transition the current phase doesn't allow. A bug, not play. */
export class MissionRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissionRunError';
  }
}

function expectMission(run: MissionRun, mission: Mission): void {
  if (run.missionId !== mission.id) {
    throw new MissionRunError(`This run is for "${run.missionId}", not "${mission.id}".`);
  }
}

function expectPhase(run: MissionRun, phase: MissionPhase, action: string): void {
  if (run.phase !== phase) {
    throw new MissionRunError(`Can't ${action} during the ${run.phase} phase.`);
  }
}

export function startRun(mission: Mission): MissionRun {
  return {
    missionId: mission.id,
    phase: 'briefing',
    stepIndex: 0,
    steps: mission.steps.map((step) => ({
      stepId: step.id,
      attempts: 0,
      hintLevel: 0,
      completed: false,
    })),
    activeDrill: null,
    drillResults: [],
    questionRound: null,
  };
}

/** Ends the briefing, whether it played through or was skipped. */
export function finishBriefing(run: MissionRun): MissionRun {
  expectPhase(run, 'briefing', 'finish the briefing');
  return { ...run, phase: 'sim' };
}

/**
 * Called after every command in the sim. Checks the current step's success predicate
 * against the sandbox and records the attempt. When it passes, the run moves on, and
 * keeps moving through any following steps that are already true: one `git commit -am`
 * can finish both "stage it" and "commit it" at once. After the last step, drills begin.
 */
export function checkStep(run: MissionRun, mission: Mission, queries: GitQueries): MissionRun {
  expectMission(run, mission);
  expectPhase(run, 'sim', 'check a step');

  const steps = run.steps.map((progress, index) =>
    index === run.stepIndex ? { ...progress, attempts: progress.attempts + 1 } : progress,
  );
  let stepIndex = run.stepIndex;
  while (stepIndex < mission.steps.length) {
    const step = mission.steps[stepIndex];
    const progress = steps[stepIndex];
    if (step === undefined || progress === undefined || !evaluate(step.success, queries)) break;
    steps[stepIndex] = { ...progress, completed: true };
    stepIndex++;
  }

  const phase = stepIndex >= mission.steps.length ? 'drills' : 'sim';
  return { ...run, steps, stepIndex, phase };
}

/** Hints come from Sage or the mission's written ladder, and only in the sim. */
export function hintsAvailable(run: MissionRun): boolean {
  return run.phase === 'sim';
}

/** One rung up the ladder, staying on the top rung once there. */
const NEXT_HINT: Record<HintLevel, 1 | 2 | 3> = { 0: 1, 1: 2, 2: 3, 3: 3 };

export interface HintResult {
  readonly run: MissionRun;
  /** Null when hints aren't available right now, e.g. during No-AI Drills. */
  readonly hint: { readonly level: 1 | 2 | 3; readonly text: string } | null;
}

/**
 * The next rung of the current step's hint ladder: a question back, then the concept,
 * then the command. It never skips a rung. Asking again at the top repeats the command
 * hint rather than failing.
 */
export function requestHint(run: MissionRun, mission: Mission): HintResult {
  expectMission(run, mission);
  const step = mission.steps[run.stepIndex];
  const progress = run.steps[run.stepIndex];
  if (!hintsAvailable(run) || step === undefined || progress === undefined) {
    return { run, hint: null };
  }

  const level = NEXT_HINT[progress.hintLevel];
  const [question, concept, command] = step.hints;
  const ladder = { 1: question, 2: concept, 3: command };
  const steps = run.steps.map((entry, index) =>
    index === run.stepIndex ? { ...entry, hintLevel: level } : entry,
  );
  return { run: { ...run, steps }, hint: { level, text: ladder[level] } };
}

/** Starts a drill's clock. Each drill is played once per run, in any order. */
export function startDrill(
  run: MissionRun,
  mission: Mission,
  drillIndex: number,
  nowMs: number,
): MissionRun {
  expectMission(run, mission);
  expectPhase(run, 'drills', 'start a drill');
  const drill = mission.drills[drillIndex];
  if (drill === undefined) throw new MissionRunError(`There is no drill ${String(drillIndex)}.`);
  if (run.activeDrill !== null) throw new MissionRunError('Another drill is still running.');
  if (run.drillResults.some((result) => result.drillId === drill.id)) {
    throw new MissionRunError(`Drill "${drill.id}" was already played in this run.`);
  }
  return { ...run, activeDrill: { drillIndex, startedAtMs: nowMs } };
}

/**
 * Grades the active drill by the sandbox's resulting state and stops its clock. After
 * the last drill, the Question Round begins.
 */
export function submitDrill(
  run: MissionRun,
  mission: Mission,
  queries: GitQueries,
  nowMs: number,
): MissionRun {
  expectMission(run, mission);
  expectPhase(run, 'drills', 'submit a drill');
  const active = run.activeDrill;
  const drill = active === null ? undefined : mission.drills[active.drillIndex];
  if (active === null || drill === undefined) throw new MissionRunError('No drill is running.');

  const seconds = (nowMs - active.startedAtMs) / 1000;
  const score = scoreDrill(evaluate(drill.success, queries), seconds, drill.timeLimitSeconds);
  const drillResults = [...run.drillResults, { drillId: drill.id, ...score }];
  const phase = drillResults.length === mission.drills.length ? 'question' : 'drills';
  return { ...run, activeDrill: null, drillResults, phase };
}

/** Ids of the drills missed in this run, for the review queue at the Standup Board. */
export function missedDrills(run: MissionRun): string[] {
  return run.drillResults.filter((result) => !result.passed).map((result) => result.drillId);
}

/** Locks in the Question Round picks, scores them, and finishes the mission. */
export function finishQuestionRound(
  run: MissionRun,
  mission: Mission,
  picks: readonly string[],
  freeText?: string,
): MissionRun {
  expectMission(run, mission);
  expectPhase(run, 'question', 'finish the Question Round');
  const { candidates, pickLimit } = mission.questionRound;
  const score = scoreQuestionRound(picks, candidates, pickLimit);
  const question = freeText?.trim() ?? '';
  return {
    ...run,
    phase: 'done',
    questionRound: { ...score, picks: [...picks], freeText: question === '' ? null : question },
  };
}

/**
 * XP for this run: each finished sim step's bonus, plus the mission's XP once the
 * whole mission is done. Drill misses cost nothing; they go to the review queue
 * instead, so practice never feels like punishment.
 */
export function xpEarned(run: MissionRun, mission: Mission): number {
  expectMission(run, mission);
  const stepXp = mission.steps.reduce(
    (total, step, index) => total + (run.steps[index]?.completed === true ? (step.xp ?? 0) : 0),
    0,
  );
  return stepXp + (run.phase === 'done' ? mission.xp : 0);
}

// ---- Boss ---------------------------------------------------------------------------

/** Where a boss fight stands. The UI stops the clock on anything but 'running'. */
export type BossOutcome = 'running' | 'won' | 'lost-time' | 'lost-rule';

export interface BossRun {
  readonly bossId: string;
  readonly startedAtMs: number;
  /** Indexes into the boss's twists that have already fired, so each fires once. */
  readonly firedTwists: readonly number[];
}

function expectBoss(boss: BossRun, act: Act): void {
  if (boss.bossId !== act.boss.id) {
    throw new MissionRunError(`This boss run is for "${boss.bossId}", not "${act.boss.id}".`);
  }
}

export function startBoss(act: Act, nowMs: number): BossRun {
  return { bossId: act.boss.id, startedAtMs: nowMs, firedTwists: [] };
}

/** Whole seconds left on the boss clock, never below zero. */
export function secondsRemaining(boss: BossRun, act: Act, nowMs: number): number {
  const elapsed = (nowMs - boss.startedAtMs) / 1000;
  return Math.max(0, Math.ceil(act.boss.timeLimitSeconds - elapsed));
}

export interface BossTick {
  readonly boss: BossRun;
  /** Twists to show and apply now, earliest first. Each one is returned only once. */
  readonly due: readonly BossTwist[];
}

/** Called on a timer by the UI. Returns the twists whose moment has arrived. */
export function tick(boss: BossRun, act: Act, nowMs: number): BossTick {
  expectBoss(boss, act);
  const remaining = act.boss.timeLimitSeconds - (nowMs - boss.startedAtMs) / 1000;
  const dueIndexes = act.boss.twists
    .map((twist, index) => ({ twist, index }))
    .filter(
      ({ twist, index }) =>
        !boss.firedTwists.includes(index) && remaining <= twist.atSecondsRemaining,
    )
    .sort((a, b) => b.twist.atSecondsRemaining - a.twist.atSecondsRemaining);
  if (dueIndexes.length === 0) return { boss, due: [] };
  return {
    boss: { ...boss, firedTwists: [...boss.firedTwists, ...dueIndexes.map(({ index }) => index)] },
    due: dueIndexes.map(({ twist }) => twist),
  };
}

/**
 * Called after every command and every tick. Breaking a rule loses at once, even with
 * time left. At zero, Dex deploys whatever is committed, so time running out beats a
 * win that arrives late: the UI checks after every command, so a real win is always
 * seen before the deadline.
 */
export function checkBoss(
  boss: BossRun,
  act: Act,
  queries: GitQueries,
  nowMs: number,
): BossOutcome {
  expectBoss(boss, act);
  if (act.boss.failIf.some((rule) => evaluate(rule, queries))) return 'lost-rule';
  if (nowMs - boss.startedAtMs >= act.boss.timeLimitSeconds * 1000) return 'lost-time';
  if (act.boss.objectives.every((objective) => evaluate(objective, queries))) return 'won';
  return 'running';
}
