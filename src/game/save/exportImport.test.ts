import { describe, expect, it } from 'vitest';
import { exportSave, ImportError, importSave, SAVE_FILE_FORMAT } from './exportImport';
import { CURRENT_SCHEMA_VERSION, createDefaultSave } from './schema';
import { createLegacyV0Save, createSampleSave, TEST_NOW } from './testFixtures';

/** Runs an import that must fail and returns the ImportError it threw. */
function importError(text: string): ImportError {
  try {
    importSave(text);
  } catch (error) {
    if (error instanceof ImportError) return error;
    throw error;
  }
  throw new Error('Expected importSave to throw, but it returned a save.');
}

function envelopeText(data: unknown, format: unknown = SAVE_FILE_FORMAT): string {
  return JSON.stringify({ format, exportedAt: TEST_NOW.toISOString(), data });
}

describe('exportSave', () => {
  it('wraps the save in a tagged envelope with the export time', () => {
    const text = exportSave(createSampleSave(), TEST_NOW);

    expect(JSON.parse(text)).toEqual({
      format: 'ship-it-save',
      exportedAt: '2026-09-27T12:00:00.000Z',
      data: createSampleSave(),
    });
  });

  it('indents the JSON so the file is readable', () => {
    const text = exportSave(createDefaultSave(TEST_NOW), TEST_NOW);

    expect(text).toContain('\n  "format": "ship-it-save"');
  });
});

describe('importSave', () => {
  it('round-trips an exported save exactly', () => {
    const save = createSampleSave();

    expect(importSave(exportSave(save, TEST_NOW))).toEqual(save);
  });

  it('round-trips a brand-new game', () => {
    const save = createDefaultSave(TEST_NOW);

    expect(importSave(exportSave(save, TEST_NOW))).toEqual(save);
  });

  it('migrates a save exported by an older version of the game', () => {
    expect(importSave(envelopeText(createLegacyV0Save()))).toEqual(createSampleSave());
  });

  it.each(['', 'not json at all', '{"format": "ship-it-save",'])(
    'rejects %j as not JSON',
    (text) => {
      const error = importError(text);

      expect(error.reason).toBe('not-json');
      expect(error.message).toMatch(/isn't valid JSON/);
      expect(error.cause).toBeInstanceOf(SyntaxError);
    },
  );

  it.each([
    ['a JSON array', '[]'],
    ['a JSON string', '"ship-it-save"'],
    ['null', 'null'],
    ['a bare save with no envelope', JSON.stringify(createSampleSave())],
    ['a file from another app', envelopeText(createSampleSave(), 'photo-album')],
    ['an envelope with no data', JSON.stringify({ format: SAVE_FILE_FORMAT })],
  ])('rejects %s as the wrong format', (_label, text) => {
    const error = importError(text);

    expect(error.reason).toBe('wrong-format');
    expect(error.message).toMatch(/Pick a file you exported from Settings/);
  });

  it('rejects a save from a newer game with advice to update', () => {
    const future = { ...createSampleSave(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };

    const error = importError(envelopeText(future));

    expect(error.reason).toBe('newer-version');
    expect(error.message).toMatch(/newer version of SHIP IT/);
  });

  it('rejects invalid fields and keeps the specifics in details', () => {
    const save = createSampleSave();
    const edited = { ...save, profile: { ...save.profile, xp: 'lots' } };

    const error = importError(envelopeText(edited));

    expect(error.reason).toBe('invalid-data');
    expect(error.name).toBe('ImportError');
    expect(error.message).toMatch(/damaged or was edited/);
    expect(error.details).toHaveLength(1);
    expect(error.details[0]).toMatch(/^profile\.xp: /);
  });

  it('rejects a data field that is not an object', () => {
    expect(importError(envelopeText('my save')).reason).toBe('invalid-data');
  });
});
