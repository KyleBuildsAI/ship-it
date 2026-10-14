import { localDay } from '../progression/days';
import { addMiss, applyReview, qualityFor } from '../progression/reviewQueue';
import { recordDrillAttempt, recordPractice } from '../progression/stats';
import { placementTestOutXp, XP_AWARDS } from '../progression/xp';
import {
  createActProgress,
  createMissionProgress,
  type ActProgress,
  type FieldMissionProgress,
  type MissionProgress,
  type MissionResume,
  type SaveData,
} from '../save/schema';
import type { Lesson } from '../missions/lessonSchema';
import { requireFieldMission, type Act, type Drill, type Mission } from '../missions/schema';

/*
 * How play changes the save. Every function takes a save and returns a new one, so the
 * rules are unit tested without a browser, and the play controllers stay about flow.
 */

function mission(save: SaveData, id: string): MissionProgress {
  return save.missions[id] ?? createMissionProgress();
}

function act(save: SaveData, number: number): ActProgress {
  return save.acts[String(number)] ?? createActProgress();
}

function withMission(save: SaveData, id: string, progress: MissionProgress): SaveData {
  return { ...save, missions: { ...save.missions, [id]: progress } };
}

function withAct(save: SaveData, number: number, progress: ActProgress): SaveData {
  return { ...save, acts: { ...save.acts, [String(number)]: progress } };
}

function addXp(save: SaveData, xp: number): SaveData {
  return xp === 0 ? save : { ...save, profile: { ...save.profile, xp: save.profile.xp + xp } };
}

/** Marks a mission as started, keeping a completed mission completed on replays. */
export function startMissionProgress(save: SaveData, missionId: string): SaveData {
  const current = mission(save, missionId);
  if (current.status !== 'available') return save;
  return withMission(save, missionId, { ...current, status: 'in-progress' });
}

/**
 * Keeps where the current attempt got to, so leaving or reloading picks it up there; null
 * forgets it, so the next Play starts from the briefing.
 */
export function recordResume(
  save: SaveData,
  missionId: string,
  resume: MissionResume | null,
): SaveData {
  const current = mission(save, missionId);
  if (resume === null && current.resume === null) return save;
  return withMission(save, missionId, { ...current, resume });
}

/**
 * Records finished sim steps. XP is paid once per step, ever: replaying a mission shows
 * the steps again but can't farm XP from them.
 */
export function recordSteps(
  save: SaveData,
  target: Mission,
  completedStepIds: readonly string[],
  stepIndex: number,
): SaveData {
  const current = mission(save, target.id);
  const fresh = completedStepIds.filter((id) => !current.completedSteps.includes(id));
  if (fresh.length === 0 && stepIndex <= current.stepIndex) return save;
  const xp = target.steps
    .filter((step) => fresh.includes(step.id))
    .reduce((total, step) => total + step.xp, 0);
  const updated: MissionProgress = {
    ...current,
    stepIndex: Math.max(current.stepIndex, stepIndex),
    completedSteps: [...current.completedSteps, ...fresh],
    xpEarned: current.xpEarned + xp,
  };
  return addXp(withMission(save, target.id, updated), xp);
}

/**
 * Records one drill attempt: history for stats, a practice day, and, when missed, a place
 * in the review queue so the Standup Board brings it back (DESIGN.md section 6).
 */
export function recordDrill(
  save: SaveData,
  drill: Drill,
  result: { passed: boolean; seconds: number },
  now: Date,
): SaveData {
  const today = localDay(now);
  const drillHistory = recordDrillAttempt(save.drillHistory, {
    drillId: drill.id,
    correct: result.passed,
    seconds: result.seconds,
    at: now.toISOString(),
  });
  const reviewQueue = result.passed ? save.reviewQueue : addMiss(save.reviewQueue, drill.id, today);
  const xp = result.passed ? XP_AWARDS.drillCorrect : 0;
  return addXp(
    { ...save, drillHistory, reviewQueue, profile: recordPractice(save.profile, today) },
    xp,
  );
}

/** Grades a Standup Board review with SM-2 and records it like any drill attempt. */
export function recordReview(
  save: SaveData,
  drill: Drill,
  result: { passed: boolean; seconds: number },
  now: Date,
): SaveData {
  const quality = qualityFor(result.passed, result.seconds, drill.timeLimitSeconds);
  const today = localDay(now);
  const reviewQueue = save.reviewQueue.some((item) => item.drillId === drill.id)
    ? applyReview(save.reviewQueue, drill.id, quality, today)
    : save.reviewQueue;
  const recorded = recordDrill(save, drill, result, now);
  // recordDrill re-queues a miss as due today; a review keeps SM-2's schedule instead.
  return { ...recorded, reviewQueue };
}

/** XP for Question Round picks: strong and okay picks earn, weak ones teach instead. */
export function questionXp(picks: readonly { quality: 'strong' | 'okay' | 'weak' }[]): number {
  return picks.reduce(
    (total, pick) =>
      total +
      (pick.quality === 'strong'
        ? XP_AWARDS.questionStrong
        : pick.quality === 'okay'
          ? XP_AWARDS.questionOkay
          : 0),
    0,
  );
}

/**
 * Finishes a mission: its completion XP and the Question Round XP (both first time only,
 * so replays practise without farming), plus the best drill score so far. A tested-out
 * mission already paid half its completion XP, so finishing it pays the other half.
 */
export function completeMission(
  save: SaveData,
  target: Act,
  finished: Mission,
  result: { drillPercent: number; questionXp: number; directingXp: number },
  now: Date,
): SaveData {
  const current = mission(save, finished.id);
  const firstTime = current.completedAt === null;
  const xp = firstTime
    ? completionXp(current, finished.xp) + result.questionXp + result.directingXp
    : 0;
  const updated: MissionProgress = {
    ...current,
    status: 'completed',
    completedAt: current.completedAt ?? now.toISOString(),
    bestDrillScore: Math.max(current.bestDrillScore ?? 0, result.drillPercent),
    xpEarned: current.xpEarned + xp,
    // A finished attempt has nothing to resume: Play replays it from the start.
    resume: null,
  };
  return refreshAct(addXp(withMission(save, finished.id, updated), xp), target, now);
}
/**
 * Finishes a lesson. Its XP is paid the first time only, like a mission's, so replays
 * practise without farming; after a test-out, only the half not already paid. The save has no stars field: a lesson's best first-try
 * percent goes in bestDrillScore (a lesson has no drills to need it), and the stars are
 * worked out from it, so no save migration is needed.
 */
export function completeLesson(
  save: SaveData,
  target: Act,
  finished: Lesson,
  firstTryPercent: number,
  now: Date,
): SaveData {
  const current = mission(save, finished.id);
  const xp = completionXp(current, finished.xp);
  const updated: MissionProgress = {
    ...current,
    status: 'completed',
    completedAt: current.completedAt ?? now.toISOString(),
    bestDrillScore: Math.max(current.bestDrillScore ?? 0, firstTryPercent),
    xpEarned: current.xpEarned + xp,
  };
  let next = addXp(withMission(save, finished.id, updated), xp);
  // The Act's final stands in for its boss, so beating it is recorded as beating the
  // boss. Its own XP is the reward; the boss award isn't paid on top.
  const progress = act(next, target.act);
  if (target.finalLessonId === finished.id && progress.bossCompletedAt === null) {
    next = withAct(next, target.act, { ...progress, bossCompletedAt: now.toISOString() });
  }
  return refreshAct(next, target, now);
}

/**
 * Counts a placement attempt the moment its first question is on screen, before any
 * answer. A run left partway, or lost to a reload, still counts: otherwise leaving a bad
 * run would be a free retry.
 */
export function countPlacementAttempt(save: SaveData, actNumber: number): SaveData {
  const current = act(save, actNumber);
  const placement = { ...current.placement, attempts: current.placement.attempts + 1 };
  return withAct(save, actNumber, { ...current, placement });
}

/**
 * Records a placement test's result: its best score, and whether it tested out. The
 * attempt itself was counted when the run began (countPlacementAttempt).
 *
 * Testing out marks the Act's unfinished missions (or a lesson Act's unfinished lessons)
 * tested out at half their XP, once. A part already completed paid its full XP, so it
 * adds nothing here. A lesson Act's final is its boss, so like a boss it isn't skipped:
 * it stays there to play, and the Act completes without it, once any Field Mission it
 * has is verified too (refreshAct).
 */
export function recordPlacement(
  save: SaveData,
  target: Act,
  parts: readonly { readonly id: string; readonly xp: number }[],
  result: { percent: number; testedOut: boolean },
  now: Date,
): SaveData {
  const current = act(save, target.act);
  const alreadyTestedOut = current.placement.testedOut;
  const placement = {
    attempts: current.placement.attempts,
    bestPercent: Math.max(current.placement.bestPercent ?? 0, result.percent),
    testedOut: alreadyTestedOut || result.testedOut,
  };
  let next = withAct(save, target.act, { ...current, placement });
  if (result.testedOut && !alreadyTestedOut) {
    const skipped = parts.filter(
      (entry) =>
        target.missionIds.includes(entry.id) &&
        entry.id !== target.finalLessonId &&
        mission(next, entry.id).status !== 'completed',
    );
    let xp = 0;
    for (const entry of skipped) {
      const share = testOutShare(entry.xp);
      const progress = mission(next, entry.id);
      next = withMission(next, entry.id, {
        ...progress,
        status: 'tested-out',
        xpEarned: progress.xpEarned + share,
      });
      xp += share;
    }
    next = addXp(next, xp);
  }
  return refreshAct(next, target, now);
}

/** The XP a part pays when it's tested out: half, rounded per part so it adds up exactly. */
function testOutShare(xp: number): number {
  return placementTestOutXp([xp]);
}

/**
 * The completion XP a part pays the first time it's finished. A tested-out part already
 * paid its test-out share, so finishing it later pays the rest and never more than once.
 */
function completionXp(progress: MissionProgress, xp: number): number {
  if (progress.completedAt !== null) return 0;
  return progress.status === 'tested-out' ? xp - testOutShare(xp) : xp;
}

export function completeBoss(save: SaveData, target: Act, now: Date): SaveData {
  const current = act(save, target.act);
  if (current.bossCompletedAt !== null) return save;
  const next = withAct(save, target.act, { ...current, bossCompletedAt: now.toISOString() });
  return refreshAct(addXp(next, XP_AWARDS.boss), target, now);
}

/** Records the Field Mission's verified checks, completing it when every one passes. */
export function recordFieldMission(
  save: SaveData,
  target: Act,
  passedIds: readonly string[],
  now: Date,
): SaveData {
  const field = requireFieldMission(target);
  const previous = save.fieldMissions[field.id] ?? { checklist: {}, verifiedAt: null };
  const checklist = { ...previous.checklist };
  for (const id of passedIds) checklist[id] = true;
  const allPassed = field.verifications.every((check) => checklist[check.id] === true);
  const verifiedAt = previous.verifiedAt ?? (allPassed ? now.toISOString() : null);
  let next: SaveData = {
    ...save,
    fieldMissions: { ...save.fieldMissions, [field.id]: { ...previous, checklist, verifiedAt } },
  };
  const current = act(next, target.act);
  if (allPassed && current.fieldMissionCompletedAt === null) {
    next = withAct(next, target.act, { ...current, fieldMissionCompletedAt: now.toISOString() });
    next = addXp(next, XP_AWARDS.fieldMission);
  }
  return refreshAct(next, target, now);
}

/**
 * Remembers the repo Kyle named for the opt-in GitHub check, and when it passed. It never
 * completes anything: the paste checks alone finish a Field Mission, so the game works
 * the same for a private repo or with no network.
 */
export function recordGitHubCheck(
  save: SaveData,
  target: Act,
  repo: string,
  passedAt: Date | null,
): SaveData {
  const field = requireFieldMission(target);
  const previous = save.fieldMissions[field.id] ?? { checklist: {}, verifiedAt: null };
  // A pass on one repo says nothing about another, so naming a new repo clears it.
  const kept = previous.githubRepo === repo ? previous.githubVerifiedAt : undefined;
  const githubVerifiedAt = passedAt?.toISOString() ?? kept;
  const next: FieldMissionProgress = {
    checklist: previous.checklist,
    verifiedAt: previous.verifiedAt,
    githubRepo: repo,
  };
  if (githubVerifiedAt !== undefined) next.githubVerifiedAt = githubVerifiedAt;
  return { ...save, fieldMissions: { ...save.fieldMissions, [field.id]: next } };
}

/**
 * Ticks or unticks one of the Field Mission's checklist tasks. A tick is Kyle's own note
 * of where he got to, saved so a mission done over days picks up where he left off. It
 * never completes the mission: only the paste checks can do that.
 */
export function tickFieldTask(
  save: SaveData,
  target: Act,
  taskId: string,
  done: boolean,
): SaveData {
  const field = requireFieldMission(target);
  if (!field.checklist.some((item) => item.id === taskId)) return save;
  const previous = save.fieldMissions[field.id] ?? { checklist: {}, verifiedAt: null };
  return {
    ...save,
    fieldMissions: {
      ...save.fieldMissions,
      [field.id]: { ...previous, checklist: { ...previous.checklist, [taskId]: done } },
    },
  };
}

/** Whether a mission counts as done for unlocking the boss: finished or tested out. */
export function missionDone(save: SaveData, missionId: string): boolean {
  const status = save.missions[missionId]?.status;
  return status === 'completed' || status === 'tested-out';
}

/**
 * Whether every part a placement can skip is done or tested out: all but a lesson Act's
 * final, which is its boss. A placement that only borrows from some parts (Act 1's tests
 * lessons 1.5 and 1.6, not its directed missions) can't complete the Act by itself.
 */
function partsDone(save: SaveData, target: Act): boolean {
  return target.missionIds
    .filter((id) => id !== target.finalLessonId)
    .every((id) => missionDone(save, id));
}

/**
 * Stamps the Act complete once every mission is done (or tested out), the boss is beaten,
 * and the Field Mission is verified. A placement pass also completes it (section 5), once
 * every part it could skip is done or tested out, so it never skips untested missions.
 * An early-access Act never completes: finishing what's built so far isn't the whole Act.
 *
 * A lesson Act's final is listed in missionIds and stands in for the boss, so finishing
 * every lesson beats it. Its Field Mission is optional, and only counts when it exists.
 * When it does, a placement pass skips the lessons but not the Field Mission: cards can be
 * guessed, and the Field Mission is the one part done on a real repo.
 */
function refreshAct(save: SaveData, target: Act, now: Date): SaveData {
  if (target.earlyAccess) return save;
  const current = act(save, target.act);
  if (current.completedAt !== null) return save;
  const bossBeaten = target.finalLessonId !== undefined || current.bossCompletedAt !== null;
  const fieldDone = target.fieldMission === undefined || current.fieldMissionCompletedAt !== null;
  const everything =
    target.missionIds.every((id) => missionDone(save, id)) && bossBeaten && fieldDone;
  // A lesson Act's Field Mission is real work on a real repo, so a card test can't skip it.
  const lessonFieldLeft = target.finalLessonId !== undefined && !fieldDone;
  const testedOut = current.placement.testedOut && partsDone(save, target) && !lessonFieldLeft;
  if (!everything && !testedOut) return save;
  return withAct(save, target.act, { ...current, completedAt: now.toISOString() });
}
