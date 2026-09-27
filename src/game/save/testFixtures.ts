import {
  createActProgress,
  createDefaultSave,
  createMissionProgress,
  type SaveData,
} from './schema';

/** Fixed clock for tests, so saved timestamps are the same on every run. */
export const TEST_NOW = new Date('2026-09-27T12:00:00.000Z');

/**
 * A save with something in every section. Tests use it to prove that real progress
 * (not just an empty new game) survives validation, storage, migration, and export.
 */
export function createSampleSave(): SaveData {
  const save = createDefaultSave(TEST_NOW);
  return {
    ...save,
    profile: {
      xp: 435,
      createdAt: save.profile.createdAt,
      practiceDays: ['2026-09-25', '2026-09-27'],
    },
    missions: {
      '2.1': {
        ...createMissionProgress(),
        status: 'completed',
        stepIndex: 4,
        completedSteps: ['briefing', 'sim', 'drill', 'questions'],
        bestDrillScore: 80,
        completedAt: '2026-09-26T20:15:00.000Z',
        xpEarned: 235,
      },
      '2.2': { ...createMissionProgress(), status: 'in-progress', stepIndex: 1 },
    },
    acts: {
      '1': {
        ...createActProgress(),
        placement: { attempts: 1, bestPercent: 92, testedOut: true },
        completedAt: '2026-09-25T18:00:00.000Z',
      },
    },
    drillHistory: [
      { drillId: 'stage-one-file', correct: true, seconds: 12.5, at: '2026-09-26T20:01:00.000Z' },
      { drillId: 'unstage-file', correct: false, seconds: 40, at: '2026-09-26T20:02:00.000Z' },
    ],
    reviewQueue: [
      {
        drillId: 'unstage-file',
        easiness: 2.5,
        repetitions: 0,
        intervalDays: 0,
        dueOn: '2026-09-26',
      },
    ],
    fieldMissions: {
      'act2-dirty-tree': {
        checklist: { 'clean-status': true, gitignore: false },
        verifiedAt: null,
      },
    },
    settings: {
      ...save.settings,
      graphicsQuality: 'medium',
      mentorModels: { hint: 'claude-sonnet-5', grade_question: null },
    },
  };
}

/** A save as the earliest prototype wrote it: no schemaVersion, and xp at the top level. */
export function createLegacyV0Save(): Record<string, unknown> {
  const { profile, ...current } = createSampleSave();
  const legacy: Record<string, unknown> = {
    ...current,
    xp: profile.xp,
    profile: { createdAt: profile.createdAt, practiceDays: profile.practiceDays },
  };
  delete legacy.schemaVersion;
  return legacy;
}
