import { DRILL_HISTORY_LIMIT, type DrillAttempt, type Profile } from '../save/schema';
import { assertDayString } from './days';

/**
 * Player stats for the Trophy Wall, and the skill-tree mastery rule. DESIGN.md section 6:
 * drill accuracy, average time per drill, and days practiced, with no punishment for
 * missed days. Days are counted, never streaks, so a break never resets anything.
 */

/** A concept is mastered at 90%+ accuracy over its last 10 drill attempts. */
export const MASTERY_ATTEMPTS = 10;
export const MASTERY_ACCURACY = 0.9;

/**
 * Share of correct attempts, from 0 to 1, over the whole history or just the last `lastN`
 * attempts. Returns null when there are no attempts yet: "no data" is not the same as 0%.
 */
export function drillAccuracy(history: readonly DrillAttempt[], lastN?: number): number | null {
  if (lastN !== undefined && (!Number.isInteger(lastN) || lastN < 1)) {
    throw new RangeError(`lastN must be a whole number of at least 1, got ${String(lastN)}.`);
  }
  // History is oldest first, so the most recent attempts are at the end.
  const attempts = lastN === undefined ? history : history.slice(-lastN);
  if (attempts.length === 0) return null;
  const correct = attempts.filter((attempt) => attempt.correct).length;
  return correct / attempts.length;
}

/** Average seconds per drill attempt, or null when there are no attempts yet. */
export function averageSeconds(history: readonly DrillAttempt[]): number | null {
  if (history.length === 0) return null;
  const total = history.reduce((sum, attempt) => sum + attempt.seconds, 0);
  return total / history.length;
}

/** Adds an attempt to the history, dropping the oldest ones past the save's limit. */
export function recordDrillAttempt(
  history: readonly DrillAttempt[],
  attempt: DrillAttempt,
): DrillAttempt[] {
  return [...history, attempt].slice(-DRILL_HISTORY_LIMIT);
}

/** How many different days the player has practiced on. */
export function practiceDayCount(profile: Pick<Profile, 'practiceDays'>): number {
  return profile.practiceDays.length;
}

/**
 * Marks `today` as a practice day. Practicing twice on one day still counts once. Returns the
 * same profile object when nothing changed, so a UI store can skip a pointless re-render.
 */
export function recordPractice(profile: Profile, today: string): Profile {
  assertDayString(today);
  if (profile.practiceDays.includes(today)) return profile;
  // The schema keeps these sorted, so the latest day is always last.
  const practiceDays = [...profile.practiceDays, today].toSorted();
  return { ...profile, practiceDays };
}

/**
 * Whether each of the last 10 (or fewer) attempts at `drillIds` was right, oldest first.
 * Attempts count wherever they were played: a mission, a placement test or a review.
 */
export function recentResults(
  history: readonly DrillAttempt[],
  drillIds: readonly string[],
): boolean[] {
  const wanted = new Set(drillIds);
  return history
    .filter((attempt) => wanted.has(attempt.drillId))
    .slice(-MASTERY_ATTEMPTS)
    .map((attempt) => attempt.correct);
}

/**
 * The mastery rule over recent results (oldest first): at least 90% right over the last
 * 10. With fewer than 10 it is not mastered yet, so a lucky first few answers can't light
 * up a skill-tree node.
 */
export function isMastered(results: readonly boolean[]): boolean {
  const recent = results.slice(-MASTERY_ATTEMPTS);
  if (recent.length < MASTERY_ATTEMPTS) return false;
  const correct = recent.filter(Boolean).length;
  return correct / MASTERY_ATTEMPTS >= MASTERY_ACCURACY;
}

/**
 * Whether the concept practiced by `drillIds` is mastered. Here a "concept" is one
 * mission's drills: the skill tree has a node per mission, not per `drill.concept` tag
 * (src/game/play/skillTree.ts).
 */
export function masteredConcept(
  history: readonly DrillAttempt[],
  drillIds: readonly string[],
): boolean {
  return isMastered(recentResults(history, drillIds));
}
