import { runGit } from '../../engine/git/cli/runGit';
import { askHint, gradeQuestion } from '../../mentor/client';
import { beginDrill, endDrill } from '../../mentor/drillGuard';
import { explain, evaluate } from '../missions/predicates';
import {
  checkStep,
  finishBriefing,
  finishQuestionRound,
  missedDrills,
  requestHint,
  startDrill,
  startRun,
  submitDrill,
} from '../missions/runner';
import { progress, updateSave } from '../progress';
import { DISPLAY_ROOT, sandbox } from '../sandbox';
import { findMission, getCatalog } from './catalog';
import { play, type DrillResult, type MissionActivity } from './playStore';
import { currentQueries, currentWorkspace, loadSandbox } from './sandboxControl';
import {
  completeMission,
  questionXp,
  recordDrill,
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
    play.update({ checklist: step === undefined ? [] : explain(step.success, queries) });
  } else if (run.phase === 'drills' && run.activeDrill !== null) {
    const drill = mission.drills[run.activeDrill.drillIndex];
    play.update({ checklist: drill === undefined ? [] : explain(drill.success, queries) });
  } else {
    play.update({ checklist: [] });
  }
}

export function startMission(missionId: string): void {
  const mission = findMission(missionId);
  endDrill();
  loadSandbox(mission.initialRepoState, `${mission.title}: a fresh project is on your Workbench.`);
  updateSave((save) => startMissionProgress(save, mission.id));
  setActivity({
    kind: 'mission',
    mission,
    run: startRun(mission),
    hint: null,
    hintLoading: false,
    lastDrill: null,
    questionScore: null,
    freeTextGrade: null,
    xpEarned: 0,
  });
}

/** Ends the briefing, whether it played through or was skipped. */
export function endBriefing(): void {
  const current = activity();
  if (current?.run.phase !== 'briefing') return;
  setActivity({ ...current, run: finishBriefing(current.run) });
}

function stepXp(current: MissionActivity, completedIds: readonly string[]): number {
  return current.mission.steps
    .filter((step) => completedIds.includes(step.id))
    .reduce((total, step) => total + step.xp, 0);
}

/** Loads the next unplayed drill's sandbox and starts its clock. Sage goes quiet. */
export function startNextDrill(nowMs: number = Date.now()): void {
  const current = activity();
  if (current?.run.phase !== 'drills' || current.run.activeDrill !== null) return;
  const index = current.run.drillResults.length;
  const drill = current.mission.drills[index];
  if (drill === undefined) return;
  loadSandbox(
    drill.setup,
    `No-AI Drill ${String(index + 1)} of ${String(current.mission.drills.length)}. Sage is offline.`,
  );
  beginDrill(`${current.mission.id}:${drill.id}`);
  setActivity({
    ...current,
    run: startDrill(current.run, current.mission, index, nowMs),
    lastDrill: null,
  });
}

function finishDrill(current: MissionActivity, nowMs: number): void {
  const active = current.run.activeDrill;
  if (active === null) return;
  const drill = current.mission.drills[active.drillIndex];
  if (drill === undefined) return;
  const run = submitDrill(current.run, current.mission, currentQueries(), nowMs);
  endDrill();
  const outcome = run.drillResults.at(-1);
  if (outcome === undefined) return;
  const lastDrill: DrillResult = {
    drillId: outcome.drillId,
    passed: outcome.passed,
    seconds: outcome.seconds,
    overtime: outcome.overtime,
  };
  updateSave((save) => recordDrill(save, drill, outcome, new Date(nowMs)));
  setActivity({ ...current, run, lastDrill });
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
    const next = checkStep(run, mission, currentQueries());
    const completed = next.steps.filter((step) => step.completed).map((step) => step.stepId);
    const before = run.steps.filter((step) => step.completed).length;
    if (completed.length > before) {
      updateSave((save) => recordSteps(save, mission, completed, next.stepIndex));
    }
    // A finished step retires its hint; the next step starts at the bottom of the ladder.
    const hint = next.stepIndex === run.stepIndex ? current.hint : null;
    setActivity({ ...current, run: next, hint, xpEarned: stepXp(current, completed) });
    return;
  }
  if (run.phase === 'drills' && run.activeDrill !== null) {
    const drill = mission.drills[run.activeDrill.drillIndex];
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
  const ladderHint = { level: hint.level, text: hint.text, fromSage: false } as const;
  const mentorEnabled = progress.get().save?.settings.mentorEnabled ?? true;
  if (!mentorEnabled || step === undefined) {
    setActivity({ ...current, run, hint: ladderHint });
    return;
  }
  setActivity({ ...current, run, hintLoading: true });
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
  if (latest?.run.stepIndex !== run.stepIndex || latest.run.phase !== 'sim') return;
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
  updateSave((save) =>
    completeMission(
      save,
      getCatalog().act,
      current.mission,
      { drillPercent, questionXp: xpFromQuestions },
      new Date(nowMs),
    ),
  );
  const question = score.freeText;
  setActivity({
    ...current,
    run,
    questionScore: score,
    freeTextGrade: question === null ? null : { state: 'grading' },
    xpEarned: current.xpEarned + current.mission.xp + xpFromQuestions,
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
  if (latest?.mission.id !== current.mission.id) return;
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
