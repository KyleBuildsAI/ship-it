import { localDay } from '../progression/days';
import { addMiss, applyReview, qualityFor } from '../progression/reviewQueue';
import { recordDrillAttempt, recordPractice } from '../progression/stats';
import { placementTestOutXp, XP_AWARDS } from '../progression/xp';
import {
  createActProgress,
  createMissionProgress,
  type ActProgress,
  type MissionProgress,
  type SaveData,
} from '../save/schema';
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
 * so replays practise without farming), plus the best drill score so far.
 */
export function completeMission(
  save: SaveData,
  target: Act,
  finished: Mission,
  result: { drillPercent: number; questionXp: number },
  now: Date,
): SaveData {
  const current = mission(save, finished.id);
  const firstTime = current.completedAt === null;
  const xp = firstTime ? finished.xp + result.questionXp : 0;
  const updated: MissionProgress = {
    ...current,
    status: 'completed',
    completedAt: current.completedAt ?? now.toISOString(),
    bestDrillScore: Math.max(current.bestDrillScore ?? 0, result.drillPercent),
    xpEarned: current.xpEarned + xp,
  };
  return refreshAct(addXp(withMission(save, finished.id, updated), xp), target, now);
}
/** Records a placement test. Testing out completes the Act's missions at half XP, once. */
export function recordPlacement(
  save: SaveData,
  target: Act,
  missions: readonly Mission[],
  result: { percent: number; testedOut: boolean },
  now: Date,
): SaveData {
  const current = act(save, target.act);
  const alreadyTestedOut = current.placement.testedOut;
  const placement = {
    attempts: current.placement.attempts + 1,
    bestPercent: Math.max(current.placement.bestPercent ?? 0, result.percent),
    testedOut: alreadyTestedOut || result.testedOut,
  };
  let next = withAct(save, target.act, { ...current, placement });
  if (result.testedOut && !alreadyTestedOut) {
    const actMissions = missions.filter((entry) => target.missionIds.includes(entry.id));
    const xp = placementTestOutXp(actMissions.map((entry) => entry.xp));
    for (const entry of actMissions) {
      const progress = mission(next, entry.id);
      if (progress.status === 'completed') continue;
      next = withMission(next, entry.id, { ...progress, status: 'tested-out' });
    }
    next = addXp(next, xp);
  }
  return refreshAct(next, target, now);
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
    fieldMissions: { ...save.fieldMissions, [field.id]: { checklist, verifiedAt } },
  };
  const current = act(next, target.act);
  if (allPassed && current.fieldMissionCompletedAt === null) {
    next = withAct(next, target.act, { ...current, fieldMissionCompletedAt: now.toISOString() });
    next = addXp(next, XP_AWARDS.fieldMission);
  }
  return refreshAct(next, target, now);
}

/** Whether a mission counts as done for unlocking the boss: finished or tested out. */
export function missionDone(save: SaveData, missionId: string): boolean {
  const status = save.missions[missionId]?.status;
  return status === 'completed' || status === 'tested-out';
}

/**
 * Stamps the Act complete once every mission is done (or tested out), the boss is beaten,
 * and the Field Mission is verified. A placement pass alone also completes it (section 5).
 * An early-access Act never completes: finishing what's built so far isn't the whole Act.
 */
function refreshAct(save: SaveData, target: Act, now: Date): SaveData {
  if (target.earlyAccess) return save;
  const current = act(save, target.act);
  if (current.completedAt !== null) return save;
  const everything =
    target.missionIds.every((id) => missionDone(save, id)) &&
    current.bossCompletedAt !== null &&
    current.fieldMissionCompletedAt !== null;
  if (!everything && !current.placement.testedOut) return save;
  return withAct(save, target.act, { ...current, completedAt: now.toISOString() });
}
