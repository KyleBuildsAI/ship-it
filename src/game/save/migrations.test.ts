import { describe, expect, it } from 'vitest';
import {
  FutureSaveVersionError,
  InvalidSaveError,
  migrate,
  MIGRATIONS,
  validateSave,
} from './migrations';
import { CURRENT_SCHEMA_VERSION, createDefaultSave } from './schema';
import { createSampleSave, TEST_NOW } from './testFixtures';

/** A save as the earliest prototype wrote it: no schemaVersion, and xp at the top level. */
function createLegacyV0Save(): Record<string, unknown> {
  const { profile, ...current } = createSampleSave();
  const legacy: Record<string, unknown> = {
    ...current,
    xp: profile.xp,
    profile: { createdAt: profile.createdAt, practiceDays: profile.practiceDays },
  };
  delete legacy.schemaVersion;
  return legacy;
}

/** Runs `action` and returns what it threw, so a test can check the error's fields. */
function thrownBy(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the action to throw, but it returned normally.');
}

describe('MIGRATIONS', () => {
  it('has exactly one step for every version before the current one', () => {
    expect(MIGRATIONS).toHaveLength(CURRENT_SCHEMA_VERSION);
  });
});

describe('migrate', () => {
  it('returns a current save unchanged', () => {
    const save = createSampleSave();

    expect(migrate(save)).toEqual(save);
  });

  it('returns a new game unchanged', () => {
    const save = createDefaultSave(TEST_NOW);

    expect(migrate(save)).toEqual(save);
  });

  describe('from version 0', () => {
    it('moves the top-level xp into the profile and stamps the current version', () => {
      const migrated = migrate(createLegacyV0Save());

      expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(migrated.profile.xp).toBe(435);
      expect(migrated).not.toHaveProperty('xp');
    });

    it('keeps every other piece of progress', () => {
      expect(migrate(createLegacyV0Save())).toEqual(createSampleSave());
    });

    it('treats an explicit schemaVersion of 0 the same as a missing one', () => {
      const legacy = { ...createLegacyV0Save(), schemaVersion: 0 };

      expect(migrate(legacy)).toEqual(createSampleSave());
    });

    it('does not modify the object it was given', () => {
      const legacy = createLegacyV0Save();
      const before = structuredClone(legacy);

      migrate(legacy);

      expect(legacy).toEqual(before);
    });

    it('keeps an xp already inside the profile when the top-level one is missing', () => {
      const legacy = createLegacyV0Save();
      delete legacy.xp;
      legacy.profile = { ...(legacy.profile as object), xp: 12 };

      expect(migrate(legacy).profile.xp).toBe(12);
    });

    it('reports missing xp instead of guessing a value', () => {
      const legacy = createLegacyV0Save();
      delete legacy.xp;

      const error = thrownBy(() => migrate(legacy));

      expect(error).toBeInstanceOf(InvalidSaveError);
      expect((error as InvalidSaveError).issues.join('\n')).toContain('profile.xp');
    });

    it('reports a missing profile instead of crashing', () => {
      const legacy = createLegacyV0Save();
      delete legacy.profile;

      const error = thrownBy(() => migrate(legacy));

      expect(error).toBeInstanceOf(InvalidSaveError);
      expect((error as InvalidSaveError).issues.join('\n')).toContain('profile.createdAt');
    });
  });

  describe('errors', () => {
    it('refuses saves from a newer game version', () => {
      const future = { ...createSampleSave(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };

      const error = thrownBy(() => migrate(future));

      expect(error).toBeInstanceOf(FutureSaveVersionError);
      expect((error as FutureSaveVersionError).version).toBe(CURRENT_SCHEMA_VERSION + 1);
      expect((error as Error).name).toBe('FutureSaveVersionError');
    });

    it.each([
      ['null', null],
      ['a string', 'save'],
      ['a number', 42],
      ['an array', [createSampleSave()]],
    ])('refuses %s because a save must be an object', (_label, raw) => {
      expect(() => migrate(raw)).toThrow(InvalidSaveError);
    });

    it.each(['1', 1.5, -1, null])('refuses a schemaVersion of %j', (schemaVersion) => {
      const error = thrownBy(() => migrate({ ...createSampleSave(), schemaVersion }));

      expect(error).toBeInstanceOf(InvalidSaveError);
      expect((error as InvalidSaveError).issues[0]).toContain('schemaVersion');
    });

    it('lists every problem with the path to the bad field', () => {
      const save = createSampleSave();
      const broken = { ...save, profile: { ...save.profile, xp: -5 }, settings: 'loud' };

      const error = thrownBy(() => migrate(broken));

      expect(error).toBeInstanceOf(InvalidSaveError);
      const { issues, name } = error as InvalidSaveError;
      expect(name).toBe('InvalidSaveError');
      expect(issues).toHaveLength(2);
      expect(issues[0]).toMatch(/^profile\.xp: /);
      expect(issues[1]).toMatch(/^settings: /);
    });
  });
});

describe('validateSave', () => {
  it('returns the checked data for a valid save', () => {
    const save = createSampleSave();

    expect(validateSave(save)).toEqual(save);
  });

  it('reports a problem at the root without a path prefix', () => {
    const error = thrownBy(() => validateSave('not a save'));

    expect(error).toBeInstanceOf(InvalidSaveError);
    expect((error as InvalidSaveError).issues[0]).toMatch(/^Invalid input/);
  });
});
