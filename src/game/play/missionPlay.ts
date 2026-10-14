import { defaultDeps } from '../../engine/fixtures';
import { runGit } from '../../engine/git/cli/runGit';
import { loadWorkbench } from '../../engine/workbench';
import { askHint, gradeQuestion } from '../../mentor/client';
import { beginDrill, endDrill } from '../../mentor/drillGuard';
import type { Pace } from '../agent/pace';
import { closeTerminal, openTerminal } from '../hud';
import { markHintRung3, starXp } from '../missions/agentRunner';
import {
  answerFits,
  gradeJudgment,
  unansweredKey,
  type JudgmentAnswer,
  type JudgmentGrade,
} from '../missions/judgment';
import { explain, evaluate } from '../missions/predicates';
import {
  checkStep,
  finishBriefing,
  finishQuestionRound,
  missedDrills,
  requestHint,
  resumeRun,
  startDrill,
  startRun,
  submitAnsweredDrill,
  submitDrill,
  type MissionRun,
} from '../missions/runner';
import { isJudgmentDrill, type Mission } from '../missions/schema';
import type { MissionResume } from '../save/schema';
import { progress, saveProgressNow } from '../progress';
import { DISPLAY_ROOT, sandbox } from '../sandbox';
import { beginDirectedStep, directedChecklist } from './agentPlay';
import { findMission, getAct } from './catalog';
import { play, type DrillResult, type MissionActivity } from './playStore';
import { saveResume } from './resumePoint';
import {
  currentQueries,
  currentWorkspace,
  loadSandbox,
  resumeSandbox,
  scratchDeps,
} from './sandboxControl';
import { beginScene, endScene, frameScene } from './scenePlay';
import {
  completeMission,
  questionXp,
  recordDrill,
  recordResume,
  recordSteps,
  startMissionProgress,
} from './saveRules';

/*
 * Plays one mission (DESIGN.md section 5): briefing, then the sim with its objective
 * checklist and hint ladder, then No-AI Drills, then the Question Round. The runner
 * decides what's legal; this file wires it to the sandbox, Sage, and the save.
 */

function activity(): MissionActivity | null {
  const current = play.get().activity;
  return current?.kind === 'mission' ? current : null;
}

function setActivity(next: MissionActivity): void {
  play.update({ activity: next });
  refreshChecklist();
}

/** The checklist beside the terminal: the current step's objectives, or the drill's. */
function refreshChecklist(): void {
  const current = activity();
  if (current === null) return;
  const { run, mission } = current;
  const queries = currentQueries();
  if (run.phase === 'sim') {
    const step = mission.steps[run.stepIndex];
    if (step?.agent !== undefined) play.update({ checklist: directedChecklist(current) });
    else play.update({ checklist: step === undefined ? [] : explain(step.success, queries) });
  } else if (run.phase === 'drills' && run.activeDrill !== null) {
    const drill = mission.drills[run.activeDrill.drillIndex];
    // A judgment drill's checklist would give its answer away, so it shows none.
    const hidden = drill === undefined || isJudgmentDrill(drill);
    play.update({ checklist: hidden ? [] : explain(drill.success, queries) });
  } else {
    play.update({ checklist: [] });
  }
}

let attempts = 0;

function newActivity(mission: Mission, run: MissionRun): MissionActivity {
  return {
    kind: 'mission',
    attempt: ++attempts,
    mission,
    run,
    hint: null,
    hintLoading: false,
    lastDrill: null,
    questionScore: null,
    freeTextGrade: null,
    xpEarned: 0,
    agent: null,
    stars: {},
    slips: [],
    scene: null,
  };
}

/**
 * Picks up an attempt the save kept (DESIGN.md principle 7: leaving or reloading loses
 * nothing). Returns false when there is nothing that can be resumed: no saved place, one
 * that no longer fits the mission, or a sim step whose sandbox wasn't kept (a laptop).
 */
function resumeMission(mission: Mission, saved: MissionResume): boolean {
  const run = resumeRun(mission, saved.stepIndex, saved.drillResults);
  if (run === null) return false;
  if (run.phase === 'sim') {
    if (saved.workbench === null) return false;
    let ws;
    try {
      ws = loadWorkbench(saved.workbench, defaultDeps());
    } catch (error) {
      console.error('[ship-it] the saved sandbox could not be rebuilt; starting over', error);
      return false;
    }
    const step = String(run.stepIndex + 1);
    resumeSandbox(ws, `${mission.title}: picked up at step ${step}, as you left it.`);
  } else {
    // Each drill loads its own sandbox, so the starting project is only a backdrop here.
    loadSandbox(mission.initialRepoState, `${mission.title}: picked up where you left off.`);
  }
  const { xpEarned, stars, slips } = saved;
  setActivity(beginDirectedStep({ ...newActivity(mission, run), xpEarned, stars, slips }));
  return true;
}

/** Plays a mission: picks up an unfinished attempt, or starts at the briefing. */
export function startMission(missionId: string): void {
  const mission = findMission(missionId);
  endDrill();
  endScene();
  saveProgressNow((save) => startMissionProgress(save, mission.id));
  // A typed mission (Act 2's git) needs the terminal; a directed one shows Otto's work in
  // the panel and the world, so the terminal stays put away unless the player opens it.
  if (mission.steps.some((step) => step.agent === undefined)) openTerminal();
  else closeTerminal();
  const saved = progress.get().save?.missions[mission.id]?.resume ?? null;
  if (saved !== null && resumeMission(mission, saved)) return;
  // Act 1 plays on the laptop; the git Acts start from a project on the Workbench.
  const where = mission.act === 1 ? 'the laptop is ready' : 'a fresh project is on your Workbench';
  loadSandbox(mission.initialRepoState, `${mission.title}: ${where}.`);
  setActivity(newActivity(mission, startRun(mission)));
}

/**
 * "Start mission over": forgets the unfinished attempt and starts again at step 1, with the
 * project back the way it began. The way out when a step can no longer be reached.
 */
export function restartMission(missionId: string): void {
  saveProgressNow((save) => recordResume(save, missionId, null));
  startMission(missionId);
  endBriefing();
}

/** Ends the briefing, whether it played through or was skipped. */
export function endBriefing(): void {
  const current = activity();
  if (current?.run.phase !== 'briefing') return;
  // A directed first step starts here: its `before` applies, and Otto waits for a card.
  setActivity(beginDirectedStep({ ...current, run: finishBriefing(current.run) }));
}

/**
 * Loads the next unplayed drill's sandbox and starts its clock. Sage goes quiet. A judgment
 * drill with a history plays its scene first, and its clock starts when the scene ends.
 */
export function startNextDrill(nowMs: number = Date.now()): void {
  const current = activity();
  if (current?.run.phase !== 'drills' || current.run.activeDrill !== null) return;
  if (current.scene !== null) return;
  const index = current.run.drillResults.length;
  const drill = current.mission.drills[index];
  if (drill === undefined) return;
  loadSandbox(
    drill.setup,
    `No-AI Drill ${String(index + 1)} of ${String(current.mission.drills.length)}. Sage is offline.`,
  );
  beginDrill(`${current.mission.id}:${drill.id}`);
  if (isJudgmentDrill(drill) && beginScene(drill)) {
    setActivity({ ...current, scene: { index: 0 }, lastDrill: null });
    return;
  }
  setActivity({
    ...current,
    run: startDrill(current.run, current.mission, index, nowMs),
    lastDrill: null,
  });
}

/**
 * Plays the next drill's scene on by one drawn frame. When it ends, the question shows and
 * the clock starts at `nowMs`, so watching Otto never eats Kyle's time.
 */
export function frameMissionScene(elapsedMs: number, pace: Pace, nowMs: number): void {
  const current = activity();
  if (current?.scene == null) return;
  const index = current.run.drillResults.length;
  const drill = current.mission.drills[index];
  if (drill === undefined) return;
  const frame = frameScene(drill.id, elapsedMs, pace);
  if (frame === null) return;
  // The scene drove Otto's lines, so a listener may have changed the activity meanwhile.
  const latest = activity() ?? current;
  if (frame.done) {
    setActivity({
      ...latest,
      scene: null,
      run: startDrill(latest.run, latest.mission, index, nowMs),
    });
  } else if (frame.index !== current.scene.index) {
    setActivity({ ...latest, scene: { index: frame.index } });
  }
}

/**
 * Scores the drill on the clock. `graded` is Kyle's answer to a judgment drill; without
 * one, a judgment drill was never answered (time ran out, or he gave up), so it's a miss.
 */
function finishDrill(
  current: MissionActivity,
  nowMs: number,
  graded: JudgmentGrade | null = null,
): void {
  const active = current.run.activeDrill;
  if (active === null) return;
  const drill = current.mission.drills[active.drillIndex];
  if (drill === undefined) return;
  const run = isJudgmentDrill(drill)
    ? submitAnsweredDrill(current.run, current.mission, graded?.passed ?? false, nowMs)
    : submitDrill(current.run, current.mission, currentQueries(), nowMs);
  endDrill();
  const outcome = run.drillResults.at(-1);
  if (outcome === undefined) return;
  // An unanswered judgment drill still names its right answer in the reveal.
  const keyId =
    graded?.keyId ?? (isJudgmentDrill(drill) ? unansweredKey(drill, scratchDeps()) : undefined);
  const lastDrill: DrillResult = {
    drillId: outcome.drillId,
    passed: outcome.passed,
    seconds: outcome.seconds,
    overtime: outcome.overtime,
    ...(keyId === undefined ? {} : { keyId }),
  };
  // A miss joins the review queue here (recordDrill calls addMiss), by the drill's id.
  const paid = saveProgressNow((save) => recordDrill(save, drill, outcome, new Date(nowMs)));
  saveResume(current, run, current.xpEarned + paid);
  setActivity({ ...current, run, lastDrill, xpEarned: current.xpEarned + paid });
}

/**
 * Called after anything changes the sandbox. In the sim it checks the current step (and
 * any following steps already true); in a drill it passes the drill the moment the
 * target state is reached.
 */
export function missionSandboxChanged(nowMs: number = Date.now()): void {
  const current = activity();
  if (current === null) return;
  const { run, mission } = current;
  if (run.phase === 'sim') {
    // Otto's lines change the sandbox as he goes, and none of them may finish a directed
    // step: it is checked when Kyle answers the check, then advanced by agentPlay.nextStep.
    if (mission.steps[run.stepIndex]?.agent !== undefined) {
      refreshChecklist();
      return;
    }
    const next = checkStep(run, mission, currentQueries());
    const completed = next.steps.filter((step) => step.completed).map((step) => step.stepId);
    const before = run.steps.filter((step) => step.completed).length;
    // What the save paid, not what the steps are worth: a replay pays nothing for them.
    const advanced = completed.length > before;
    const paid = advanced
      ? saveProgressNow((save) => recordSteps(save, mission, completed, next.stepIndex))
      : 0;
    // Taken as the next step begins, so a resume starts it exactly as it is now.
    if (advanced) saveResume(current, next, current.xpEarned + paid);
    // A finished step retires its hint; the next step starts at the bottom of the ladder.
    const hint = next.stepIndex === run.stepIndex ? current.hint : null;
    setActivity({ ...current, run: next, hint, xpEarned: current.xpEarned + paid });
    return;
  }
  if (run.phase === 'drills' && run.activeDrill !== null) {
    const drill = mission.drills[run.activeDrill.drillIndex];
    // A judgment drill is graded by Kyle's answer. Its scene changes the sandbox as it
    // plays, and none of those changes may end the drill.
    if (drill !== undefined && isJudgmentDrill(drill)) return;
    if (drill !== undefined && evaluate(drill.success, currentQueries())) {
      finishDrill(current, nowMs);
    } else {
      refreshChecklist();
    }
  }
}

/** Called on a timer. A drill that runs out of time is scored as it stands: a miss. */
export function missionTick(nowMs: number = Date.now()): void {
  const current = activity();
  const active = current?.run.activeDrill;
  if (current === null || active === null || active === undefined) return;
  const drill = current.mission.drills[active.drillIndex];
  if (drill === undefined) return;
  if (nowMs - active.startedAtMs >= drill.timeLimitSeconds * 1000) finishDrill(current, nowMs);
}

/**
 * Kyle's answer to the judgment drill `drillId`, if it is the one on the clock. The key is
 * worked out by running the drill in a scratch copy (judgment.ts), never read from the
 * content. An answer that lands after the limit, before the next tick, is overtime and so
 * a miss (grading.scoreDrill). A late or doubled click, meant for a drill that has ended or
 * shaped for another kind of drill, does nothing: a button never throws at Kyle.
 */
export function submitJudgment(
  drillId: string,
  answer: JudgmentAnswer,
  nowMs: number = Date.now(),
): void {
  const current = activity();
  const active = current?.run.activeDrill;
  if (current === null || active === null || active === undefined) return;
  const drill = current.mission.drills[active.drillIndex];
  if (drill === undefined || !isJudgmentDrill(drill) || drill.id !== drillId) return;
  if (!answerFits(drill, answer)) return;
  finishDrill(current, nowMs, gradeJudgment(drill, answer, scratchDeps()));
}

/** "I'm done": submits the drill now, graded by the sandbox as it stands. */
export function submitCurrentDrill(nowMs: number = Date.now()): void {
  const current = activity();
  if (current !== null) finishDrill(current, nowMs);
}

function statusText(): string {
  const result = runGit(currentWorkspace(), { cwd: '', displayRoot: DISPLAY_ROOT }, ['status']);
  return result.lines
    .map((entry) => entry.text)
    .join('\n')
    .slice(0, 8000);
}

/**
 * The next rung of the hint ladder. Sage writes it when online and switched on; otherwise
 * the mission's pre-written hint shows, so the game never depends on the network.
 */
export async function askForHint(): Promise<void> {
  const current = activity();
  if (current === null) return;
  const { run, hint } = requestHint(current.run, current.mission);
  if (hint === null) return;
  const step = current.mission.steps[current.run.stepIndex];
  // The third rung names the card to pick, which costs a directed step its Plan star.
  const agent =
    hint.level === 3 && current.agent !== null ? markHintRung3(current.agent) : current.agent;
  const ladderHint = { level: hint.level, text: hint.text, fromSage: false } as const;
  const mentorEnabled = progress.get().save?.settings.mentorEnabled ?? true;
  if (!mentorEnabled || step === undefined) {
    setActivity({ ...current, run, agent, hint: ladderHint });
    return;
  }
  setActivity({ ...current, run, agent, hintLoading: true });
  const reply = await askHint({
    missionTitle: current.mission.title,
    stepInstruction: step.instruction,
    level: hint.level,
    recentCommands: sandbox
      .get()
      .shell.history.slice(-20)
      .map((command) => command.slice(0, 500)),
    gitStatus: statusText(),
  });
  // The player may have moved on while Sage was thinking; only show it if they haven't.
  const latest = activity();
  if (
    latest?.attempt !== current.attempt ||
    latest.run.stepIndex !== run.stepIndex ||
    latest.run.phase !== 'sim'
  ) {
    return;
  }
  const shown = reply.offline
    ? ladderHint
    : { level: hint.level, text: reply.text, fromSage: true };
  setActivity({
    ...latest,
    run: { ...latest.run, steps: run.steps },
    hint: shown,
    hintLoading: false,
  });
}

/**
 * Locks in the Question Round and finishes the mission. A free-text question goes to
 * Sage for a grade when Sage is available; the mission is complete either way.
 */
export function submitQuestionRound(
  picks: readonly string[],
  freeText: string,
  nowMs: number = Date.now(),
): void {
  const current = activity();
  if (current?.run.phase !== 'question') return;
  const run = finishQuestionRound(current.run, current.mission, picks, freeText);
  const score = run.questionRound;
  if (score === null) return;
  const drills = run.drillResults;
  const drillPercent =
    drills.length === 0
      ? 0
      : Math.round((drills.filter((result) => result.passed).length / drills.length) * 100);
  const xpFromQuestions = questionXp(score.perPick);
  // Stars pay for directing Otto. A typed mission has none, so it pays nothing here.
  const directingXp = Object.values(current.stars).reduce(
    (total, earned) => total + starXp(earned),
    0,
  );
  const paid = saveProgressNow((save) =>
    completeMission(
      save,
      getAct(current.mission.act).act,
      current.mission,
      { drillPercent, questionXp: xpFromQuestions, directingXp },
      new Date(nowMs),
    ),
  );
  const question = score.freeText;
  setActivity({
    ...current,
    run,
    questionScore: score,
    freeTextGrade: question === null ? null : { state: 'grading' },
    xpEarned: current.xpEarned + paid,
  });
  if (question !== null) void gradeFreeText(question);
}

async function gradeFreeText(question: string): Promise<void> {
  const current = activity();
  if (current === null) return;
  const { ticket, rubric } = current.mission.questionRound;
  const reply = await gradeQuestion({
    ticket: { title: ticket.title, body: ticket.body },
    question: question.slice(0, 1000),
    rubric,
  });
  const latest = activity();
  if (latest?.attempt !== current.attempt) return;
  setActivity({
    ...latest,
    freeTextGrade: reply.offline
      ? { state: 'unavailable', message: reply.message }
      : {
          state: 'graded',
          score: reply.score,
          whyItMatters: reply.whyItMatters,
          betterVersion: reply.betterVersion,
        },
  });
}

/** Drills missed in this run, which the save has already queued for review. */
export function missedInRun(current: MissionActivity): string[] {
  return missedDrills(current.run);
}
