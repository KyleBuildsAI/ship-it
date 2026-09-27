import { z } from 'zod';

/**
 * The shape of the save file, checked at runtime.
 *
 * TypeScript types vanish when the code runs, but save data comes from outside the code:
 * IndexedDB, or a JSON file the player picked. zod checks that data for real, and the
 * TypeScript types below are generated from the same schemas, so the two can never drift.
 */

/** Bump this and add a step to MIGRATIONS in migrations.ts whenever the saved shape changes. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Capped so the save, which is rewritten on every autosave, stays small forever. */
export const DRILL_HISTORY_LIMIT = 200;

/** SM-2 never lets easiness drop below this, or a hard item would come back every single day. */
export const MIN_EASINESS = 1.3;

/** A calendar day such as "2026-09-27". zod rejects impossible dates like February 30th. */
export const dayStringSchema = z.iso.date();

/** A moment in time as written by Date.toISOString(), such as "2026-09-27T14:03:00.000Z". */
export const timestampSchema = z.iso.datetime();

const idSchema = z.string().min(1);
const countSchema = z.number().int().nonnegative();
const percentSchema = z.number().min(0).max(100);

function isSortedAndUnique(values: readonly string[]): boolean {
  const normalized = [...new Set(values)].toSorted();
  return (
    normalized.length === values.length &&
    normalized.every((value, index) => value === values[index])
  );
}

export const profileSchema = z.object({
  xp: countSchema,
  createdAt: timestampSchema,
  // Kept sorted and unique so "days practiced" is simply the length and the latest day is last.
  practiceDays: z
    .array(dayStringSchema)
    .refine(isSortedAndUnique, 'practiceDays must be sorted with no repeated days'),
});

export const missionStatusSchema = z.enum(['available', 'in-progress', 'completed', 'tested-out']);

export const missionProgressSchema = z.object({
  status: missionStatusSchema,
  // Where to resume: the index into the mission's steps list.
  stepIndex: countSchema,
  completedSteps: z.array(idSchema),
  // Best No-AI Drill result for this mission, as a percent from 0 to 100.
  bestDrillScore: percentSchema.nullable(),
  completedAt: timestampSchema.nullable(),
  xpEarned: countSchema,
});

export const actProgressSchema = z.object({
  placement: z.object({
    attempts: countSchema,
    bestPercent: percentSchema.nullable(),
    testedOut: z.boolean(),
  }),
  bossCompletedAt: timestampSchema.nullable(),
  fieldMissionCompletedAt: timestampSchema.nullable(),
  completedAt: timestampSchema.nullable(),
});

// Object keys are always strings in JSON, so Act 3 is stored under the key "3".
const actKeySchema = z.string().regex(/^[1-8]$/, 'Act keys must be "1" through "8"');

export const drillAttemptSchema = z.object({
  drillId: idSchema,
  correct: z.boolean(),
  seconds: z.number().nonnegative(),
  at: timestampSchema,
});

/** One missed drill waiting in the review queue, scheduled with SM-2 (see reviewQueue.ts). */
export const reviewItemSchema = z.object({
  drillId: idSchema,
  // How easy this item is for the player. Higher means longer gaps between reviews.
  easiness: z.number().min(MIN_EASINESS),
  // Correct reviews in a row. A wrong answer resets it to 0.
  repetitions: countSchema,
  // Days between the last review and dueOn. 0 means "never reviewed yet".
  intervalDays: countSchema,
  dueOn: dayStringSchema,
});

const reviewQueueSchema = z
  .array(reviewItemSchema)
  .refine(
    (items) => new Set(items.map((item) => item.drillId)).size === items.length,
    'reviewQueue must not list the same drill twice',
  );

export const fieldMissionProgressSchema = z.object({
  checklist: z.record(idSchema, z.boolean()),
  verifiedAt: timestampSchema.nullable(),
});

export const settingsSchema = z.object({
  graphicsQuality: z.enum(['low', 'medium', 'high']),
  audioVolume: z.number().min(0).max(1),
  mentorEnabled: z.boolean(),
  // One entry per mentor mode. null means "use the model the mentor server is configured with".
  mentorModels: z.object({
    hint: idSchema.nullable(),
    grade_question: idSchema.nullable(),
  }),
  // 'system' follows the operating system's reduced-motion preference.
  reducedMotion: z.enum(['system', 'on', 'off']),
  textSize: z.enum(['normal', 'large', 'x-large']),
});

export const saveDataSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  profile: profileSchema,
  missions: z.record(idSchema, missionProgressSchema),
  acts: z.record(actKeySchema, actProgressSchema),
  drillHistory: z.array(drillAttemptSchema).max(DRILL_HISTORY_LIMIT),
  reviewQueue: reviewQueueSchema,
  fieldMissions: z.record(idSchema, fieldMissionProgressSchema),
  settings: settingsSchema,
});

export type SaveData = z.infer<typeof saveDataSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type MissionStatus = z.infer<typeof missionStatusSchema>;
export type MissionProgress = z.infer<typeof missionProgressSchema>;
export type ActProgress = z.infer<typeof actProgressSchema>;
export type DrillAttempt = z.infer<typeof drillAttemptSchema>;
export type ReviewItem = z.infer<typeof reviewItemSchema>;
export type FieldMissionProgress = z.infer<typeof fieldMissionProgressSchema>;
export type Settings = z.infer<typeof settingsSchema>;

// The factories below return brand-new objects on every call. A shared default object would
// be risky: one accidental mutation would silently change every save created afterwards.

export function createDefaultSettings(): Settings {
  return {
    // The game targets a desktop NVIDIA GPU, so start at full quality and let the player lower it.
    graphicsQuality: 'high',
    audioVolume: 0.7,
    // On by default: with no API key or server, Sage falls back to pre-written hints anyway.
    mentorEnabled: true,
    mentorModels: { hint: null, grade_question: null },
    reducedMotion: 'system',
    textSize: 'normal',
  };
}

export function createMissionProgress(): MissionProgress {
  return {
    status: 'available',
    stepIndex: 0,
    completedSteps: [],
    bestDrillScore: null,
    completedAt: null,
    xpEarned: 0,
  };
}

export function createActProgress(): ActProgress {
  return {
    placement: { attempts: 0, bestPercent: null, testedOut: false },
    bossCompletedAt: null,
    fieldMissionCompletedAt: null,
    completedAt: null,
  };
}

/** A brand-new game. `now` is passed in (not read from the clock) so tests are repeatable. */
export function createDefaultSave(now: Date): SaveData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profile: { xp: 0, createdAt: now.toISOString(), practiceDays: [] },
    missions: {},
    acts: {},
    drillHistory: [],
    reviewQueue: [],
    fieldMissions: {},
    settings: createDefaultSettings(),
  };
}
