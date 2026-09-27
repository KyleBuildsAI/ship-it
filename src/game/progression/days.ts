/**
 * Calendar days written as "YYYY-MM-DD" strings, and the date math on them.
 *
 * Plain strings survive JSON and IndexedDB unchanged, and because every part is zero-padded,
 * comparing them as text gives the same answer as comparing the dates: "2026-09-27" < "2026-10-01".
 *
 * All math runs in UTC on purpose. A UTC day is always exactly 24 hours long, so adding days
 * can never land on the wrong date because of a daylight-saving change in the player's timezone.
 */

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Midnight UTC at the start of `day`, or NaN if it is not a real calendar day. */
function utcMidnight(day: string): number {
  if (!DAY_PATTERN.test(day)) return Number.NaN;
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const dayOfMonth = Number(day.slice(8, 10));
  const time = Date.UTC(year, month - 1, dayOfMonth);
  // Date.UTC quietly rolls impossible dates over (February 30th becomes March 2nd), so turn
  // the result back into text: if it changed, the input wasn't a real day.
  return formatUtcDay(time) === day ? time : Number.NaN;
}

function formatUtcDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** True for a real calendar day in "YYYY-MM-DD" form, leap days included. */
export function isDayString(value: string): boolean {
  return !Number.isNaN(utcMidnight(value));
}

/** Throws a RangeError unless `value` is a real "YYYY-MM-DD" day. */
export function assertDayString(value: string): void {
  if (!isDayString(value)) {
    throw new RangeError(`Expected a day like "2026-09-27", got "${value}".`);
  }
}

/** The day `count` days after `day`. A negative count goes back in time. */
export function addDays(day: string, count: number): string {
  assertDayString(day);
  if (!Number.isInteger(count)) {
    throw new RangeError(`Days to add must be a whole number, got ${String(count)}.`);
  }
  return formatUtcDay(utcMidnight(day) + count * MS_PER_DAY);
}

/** Sort helper: negative if `a` is earlier, positive if later, 0 for the same day. */
export function compareDays(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * The player's calendar day for a moment in time, in their own timezone. Practicing at
 * 11pm on Tuesday counts as Tuesday, even though it is already Wednesday in UTC.
 */
export function localDay(moment: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = String(moment.getFullYear()).padStart(4, '0');
  return `${year}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
}
