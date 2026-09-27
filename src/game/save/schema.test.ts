import { describe, expect, it } from 'vitest';
import {
  createActProgress,
  createDefaultSave,
  createDefaultSettings,
  createMissionProgress,
  CURRENT_SCHEMA_VERSION,
  DRILL_HISTORY_LIMIT,
  saveDataSchema,
  type SaveData,
} from './schema';
import { createSampleSave, TEST_NOW } from './testFixtures';

function isValid(save: unknown): boolean {
  return saveDataSchema.safeParse(save).success;
}

/** Builds a sample save with one section replaced, to test a single rule at a time. */
function sampleWith(patch: Partial<Record<keyof SaveData, unknown>>): unknown {
  return { ...createSampleSave(), ...patch };
}

describe('createDefaultSave', () => {
  it('builds a valid, empty game at the current schema version', () => {
    const save = createDefaultSave(TEST_NOW);

    expect(isValid(save)).toBe(true);
    expect(save.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(save.profile).toEqual({ xp: 0, createdAt: TEST_NOW.toISOString(), practiceDays: [] });
    expect(save.missions).toEqual({});
    expect(save.acts).toEqual({});
    expect(save.drillHistory).toEqual([]);
    expect(save.reviewQueue).toEqual([]);
    expect(save.fieldMissions).toEqual({});
  });

  it('uses mentor-server model defaults and follows the system reduced-motion setting', () => {
    const { settings } = createDefaultSave(TEST_NOW);

    expect(settings.mentorModels).toEqual({ hint: null, grade_question: null });
    expect(settings.reducedMotion).toBe('system');
    expect(settings.textSize).toBe('normal');
  });

  it('returns separate objects each time, so editing one save never leaks into another', () => {
    const first = createDefaultSave(TEST_NOW);
    const second = createDefaultSave(TEST_NOW);

    first.settings.mentorModels.hint = 'changed';
    first.profile.practiceDays.push('2026-09-27');

    expect(second.settings.mentorModels.hint).toBeNull();
    expect(second.profile.practiceDays).toEqual([]);
  });
});

describe('progress factories', () => {
  it('creates valid, fresh mission, act, and settings entries', () => {
    const save = createDefaultSave(TEST_NOW);
    save.missions['2.1'] = createMissionProgress();
    save.acts['2'] = createActProgress();
    save.settings = createDefaultSettings();

    expect(isValid(save)).toBe(true);
    expect(createMissionProgress()).not.toBe(createMissionProgress());
    expect(createActProgress().placement).not.toBe(createActProgress().placement);
  });
});

describe('saveDataSchema', () => {
  it('accepts a save with progress in every section', () => {
    expect(isValid(createSampleSave())).toBe(true);
  });

  it('rejects any other schema version', () => {
    expect(isValid(sampleWith({ schemaVersion: 2 }))).toBe(false);
    expect(isValid(sampleWith({ schemaVersion: undefined }))).toBe(false);
  });

  it('drops unknown top-level fields instead of keeping them', () => {
    const parsed = saveDataSchema.parse({ ...createSampleSave(), cheatMode: true });

    expect(parsed).not.toHaveProperty('cheatMode');
  });

  describe('profile', () => {
    const profileWith = (patch: object) =>
      sampleWith({ profile: { ...createSampleSave().profile, ...patch } });

    it('rejects negative or fractional XP', () => {
      expect(isValid(profileWith({ xp: -1 }))).toBe(false);
      expect(isValid(profileWith({ xp: 1.5 }))).toBe(false);
    });

    it('rejects a createdAt that is not an ISO timestamp', () => {
      expect(isValid(profileWith({ createdAt: 'yesterday' }))).toBe(false);
      expect(isValid(profileWith({ createdAt: '2026-09-27' }))).toBe(false);
    });

    it('accepts leap days only in leap years', () => {
      expect(isValid(profileWith({ practiceDays: ['2024-02-29'] }))).toBe(true);
      expect(isValid(profileWith({ practiceDays: ['2000-02-29'] }))).toBe(true);
      expect(isValid(profileWith({ practiceDays: ['2023-02-29'] }))).toBe(false);
      expect(isValid(profileWith({ practiceDays: ['2100-02-29'] }))).toBe(false);
    });

    it('rejects impossible or badly formatted days', () => {
      expect(isValid(profileWith({ practiceDays: ['2026-04-31'] }))).toBe(false);
      expect(isValid(profileWith({ practiceDays: ['2026-9-27'] }))).toBe(false);
    });

    it('requires practice days to be sorted and unique', () => {
      expect(isValid(profileWith({ practiceDays: ['2026-09-27', '2026-09-25'] }))).toBe(false);
      expect(isValid(profileWith({ practiceDays: ['2026-09-27', '2026-09-27'] }))).toBe(false);
    });
  });

  describe('missions and acts', () => {
    it('rejects an unknown mission status', () => {
      const save = createSampleSave();
      const missions = { '2.1': { ...createMissionProgress(), status: 'done' } };

      expect(isValid({ ...save, missions })).toBe(false);
    });

    it('rejects drill scores outside 0 to 100', () => {
      const missions = { '2.1': { ...createMissionProgress(), bestDrillScore: 101 } };

      expect(isValid(sampleWith({ missions }))).toBe(false);
    });

    it('rejects a fractional step index', () => {
      const missions = { '2.1': { ...createMissionProgress(), stepIndex: 0.5 } };

      expect(isValid(sampleWith({ missions }))).toBe(false);
    });

    it('only accepts Acts "1" through "8" as keys', () => {
      expect(isValid(sampleWith({ acts: { '8': createActProgress() } }))).toBe(true);
      expect(isValid(sampleWith({ acts: { '9': createActProgress() } }))).toBe(false);
      expect(isValid(sampleWith({ acts: { '0': createActProgress() } }))).toBe(false);
      expect(isValid(sampleWith({ acts: { two: createActProgress() } }))).toBe(false);
    });
  });

  describe('drills and reviews', () => {
    it(`keeps at most ${String(DRILL_HISTORY_LIMIT)} drill attempts`, () => {
      const attempt = { drillId: 'd', correct: true, seconds: 5, at: TEST_NOW.toISOString() };
      const full = Array.from({ length: DRILL_HISTORY_LIMIT }, () => attempt);

      expect(isValid(sampleWith({ drillHistory: full }))).toBe(true);
      expect(isValid(sampleWith({ drillHistory: [...full, attempt] }))).toBe(false);
    });

    it('rejects negative drill times', () => {
      const attempt = { drillId: 'd', correct: true, seconds: -1, at: TEST_NOW.toISOString() };

      expect(isValid(sampleWith({ drillHistory: [attempt] }))).toBe(false);
    });

    it('rejects easiness below the SM-2 floor of 1.3', () => {
      const item = {
        drillId: 'd',
        easiness: 1.2,
        repetitions: 0,
        intervalDays: 0,
        dueOn: '2026-09-27',
      };

      expect(isValid(sampleWith({ reviewQueue: [item] }))).toBe(false);
    });

    it('rejects the same drill appearing twice in the review queue', () => {
      const item = {
        drillId: 'd',
        easiness: 2.5,
        repetitions: 0,
        intervalDays: 0,
        dueOn: '2026-09-27',
      };

      expect(isValid(sampleWith({ reviewQueue: [item, { ...item }] }))).toBe(false);
    });
  });

  describe('settings', () => {
    const settingsWith = (patch: object) =>
      sampleWith({ settings: { ...createDefaultSettings(), ...patch } });

    it('keeps audio volume between 0 and 1', () => {
      expect(isValid(settingsWith({ audioVolume: 0 }))).toBe(true);
      expect(isValid(settingsWith({ audioVolume: 1 }))).toBe(true);
      expect(isValid(settingsWith({ audioVolume: 1.1 }))).toBe(false);
      expect(isValid(settingsWith({ audioVolume: -0.1 }))).toBe(false);
    });

    it('rejects unknown option values', () => {
      expect(isValid(settingsWith({ graphicsQuality: 'ultra' }))).toBe(false);
      expect(isValid(settingsWith({ reducedMotion: true }))).toBe(false);
      expect(isValid(settingsWith({ textSize: 'huge' }))).toBe(false);
    });

    it('rejects an empty model name (null is how you pick the server default)', () => {
      expect(isValid(settingsWith({ mentorModels: { hint: '', grade_question: null } }))).toBe(
        false,
      );
    });
  });
});
