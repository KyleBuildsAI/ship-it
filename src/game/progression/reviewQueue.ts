import { MIN_EASINESS, type ReviewItem } from '../save/schema';
import { addDays, assertDayString, compareDays } from './days';

/**
 * The review queue behind the Standup Board, scheduled with SM-2.
 *
 * SM-2 is a classic spaced-repetition algorithm. Every missed drill becomes a review item.
 * Answer it well and the gap before you see it again grows (1 day, 6 days, then longer
 * each time, up to a year). Miss it and it comes back tomorrow. Items you find hard get a
 * lower "easiness", which keeps their gaps short.
 *
 * `today` is always passed in rather than read from the clock, so tests are repeatable.
 */

/** How well a review went, from 0 (total blank) to 5 (perfect, instant recall). */
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;

/** SM-2 counts a review as passed from quality 3 up. */
const PASSING_QUALITY = 3;

/** Where every new item starts. Higher is easier, and it only drifts down to MIN_EASINESS. */
export const INITIAL_EASINESS = 2.5;

export const DAILY_SET_LIMITS = { min: 5, max: 10 } as const;

/**
 * The longest gap between two reviews. Plain SM-2 has no limit: every good answer multiplies
 * the gap by the item's easiness (2.5 for a new item). The daily set tops up with items
 * that are not due yet, so a small queue gets reviewed every day, and without a cap its gaps
 * would pass the year 9999 within about two weeks. A year also means no drill is gone for good.
 */
export const MAX_INTERVAL_DAYS = 365;

/**
 * Grades a drill attempt for SM-2. A fast correct answer (under half the time limit) shows
 * real recall and scores 5. A slow correct answer scores 4. A wrong answer scores 1.
 */
export function qualityFor(
  correct: boolean,
  seconds: number,
  timeLimitSeconds: number,
): ReviewQuality {
  if (!(timeLimitSeconds > 0) || !(seconds >= 0)) {
    throw new RangeError(
      `Expected seconds >= 0 and a time limit > 0, got ${String(seconds)} and ${String(timeLimitSeconds)}.`,
    );
  }
  if (!correct) return 1;
  return seconds < timeLimitSeconds / 2 ? 5 : 4;
}

/** A new item for a drill that is due for review today. */
export function createReviewItem(drillId: string, today: string): ReviewItem {
  assertDayString(today);
  return {
    drillId,
    easiness: INITIAL_EASINESS,
    repetitions: 0,
    intervalDays: 0,
    dueOn: today,
  };
}

function nextEasiness(easiness: number, quality: ReviewQuality): number {
  // The standard SM-2 formula: +0.1 for a perfect answer, unchanged at 4, lower below that.
  const shortfall = 5 - quality;
  const updated = easiness + (0.1 - shortfall * (0.08 + shortfall * 0.02));
  // SM-2 only ever changes easiness in steps of 0.02, so rounding to two decimals loses
  // nothing. It stops floating-point noise like 2.3600000000000003 piling up in the save.
  return Math.max(MIN_EASINESS, Math.round(updated * 100) / 100);
}

function nextInterval(item: ReviewItem): number {
  if (item.repetitions === 0) return 1;
  if (item.repetitions === 1) return 6;
  const grown = Math.round(item.intervalDays * item.easiness);
  // At least 1, so an item can never be rescheduled for the day it was just reviewed.
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, grown));
}

/**
 * Schedules the next review of `item` after a review on `today`. Returns a new item; the
 * original is left unchanged.
 */
export function review(item: ReviewItem, quality: ReviewQuality, today: string): ReviewItem {
  assertDayString(today);
  const passed = quality >= PASSING_QUALITY;
  // Following SM-2, the new gap uses the easiness from before this review.
  const intervalDays = passed ? nextInterval(item) : 1;
  return {
    ...item,
    easiness: nextEasiness(item.easiness, quality),
    repetitions: passed ? item.repetitions + 1 : 0,
    intervalDays,
    dueOn: addDays(today, intervalDays),
  };
}

/**
 * Records a missed drill. A drill not yet in the queue is added. One already there starts
 * its repetitions over and is due today. Its easiness is kept, because that is the history
 * of how hard this drill has been for the player.
 */
export function addMiss(
  queue: readonly ReviewItem[],
  drillId: string,
  today: string,
): ReviewItem[] {
  assertDayString(today);
  if (!queue.some((item) => item.drillId === drillId)) {
    return [...queue, createReviewItem(drillId, today)];
  }
  return queue.map((item) =>
    item.drillId === drillId ? { ...item, repetitions: 0, intervalDays: 0, dueOn: today } : item,
  );
}

/** Reviews the queue item for `drillId` and returns the updated queue. */
export function applyReview(
  queue: readonly ReviewItem[],
  drillId: string,
  quality: ReviewQuality,
  today: string,
): ReviewItem[] {
  if (!queue.some((item) => item.drillId === drillId)) {
    throw new Error(`Drill "${drillId}" is not in the review queue.`);
  }
  return queue.map((item) => (item.drillId === drillId ? review(item, quality, today) : item));
}

/** Most urgent first: the longest-overdue day, then the hardest item, then by id so ties are stable. */
function byUrgency(a: ReviewItem, b: ReviewItem): number {
  return (
    compareDays(a.dueOn, b.dueOn) || a.easiness - b.easiness || a.drillId.localeCompare(b.drillId)
  );
}

/**
 * Today's Standup Board set. Due items come first, most urgent first. If fewer than `min`
 * are due, the set is topped up with the items coming up soonest, so there is always
 * something to practice. The set never holds more than `max` items.
 */
export function dailySet(
  queue: readonly ReviewItem[],
  today: string,
  limits: { min: number; max: number } = DAILY_SET_LIMITS,
): ReviewItem[] {
  assertDayString(today);
  const { min, max } = limits;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || min > max) {
    throw new RangeError(
      `Expected whole numbers with 0 <= min <= max, got min ${String(min)} and max ${String(max)}.`,
    );
  }
  const sorted = queue.toSorted(byUrgency);
  // Day strings compare correctly as text, so "due" is simply dueOn <= today.
  const due = sorted.filter((item) => item.dueOn <= today);
  const upcoming = sorted.filter((item) => item.dueOn > today);
  const topUp = upcoming.slice(0, Math.max(0, min - due.length));
  return [...due, ...topUp].slice(0, max);
}
