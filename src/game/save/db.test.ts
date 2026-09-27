// Must be the first import: it installs an in-memory IndexedDB before Dexie looks for one.
import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSave,
  closeSaveDatabase,
  getSaveDatabase,
  loadSave,
  requestPersistentStorage,
  SAVE_SLOT,
  writeSave,
} from './db';
import { FutureSaveVersionError, InvalidSaveError } from './migrations';
import { CURRENT_SCHEMA_VERSION, createDefaultSave } from './schema';
import { createLegacyV0Save, createSampleSave, TEST_NOW } from './testFixtures';

const LATER = new Date('2026-10-01T09:30:00.000Z');

async function readStoredRow() {
  return getSaveDatabase().saves.get(SAVE_SLOT);
}

beforeEach(async () => {
  await clearSave();
});

afterAll(() => {
  closeSaveDatabase();
});

describe('loadSave', () => {
  it('creates, stores, and returns a new game on first launch', async () => {
    const save = await loadSave(TEST_NOW);

    expect(save).toEqual(createDefaultSave(TEST_NOW));
    expect((await readStoredRow())?.data).toEqual(save);
  });

  it('returns the stored save instead of starting over on later launches', async () => {
    await loadSave(TEST_NOW);

    const second = await loadSave(LATER);

    expect(second.profile.createdAt).toBe(TEST_NOW.toISOString());
  });

  it('returns progress that was written earlier', async () => {
    await writeSave(createSampleSave());

    expect(await loadSave(LATER)).toEqual(createSampleSave());
  });

  it('keeps progress after the database connection closes, like a browser restart', async () => {
    await writeSave(createSampleSave());
    closeSaveDatabase();

    expect(await loadSave(LATER)).toEqual(createSampleSave());
  });

  it('migrates a legacy save and stores the upgraded copy', async () => {
    await getSaveDatabase().saves.put({ slot: SAVE_SLOT, data: createLegacyV0Save() });

    const save = await loadSave(LATER);

    expect(save).toEqual(createSampleSave());
    expect((await readStoredRow())?.data).toEqual(createSampleSave());
  });

  it('leaves a current save alone instead of rewriting it on every load', async () => {
    await writeSave(createSampleSave());
    const put = vi.spyOn(getSaveDatabase().saves, 'put');

    await loadSave(LATER);

    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
  });

  it('throws on a damaged save and does not overwrite it', async () => {
    const damaged = { ...createSampleSave(), profile: 'oops' };
    await getSaveDatabase().saves.put({ slot: SAVE_SLOT, data: damaged });

    await expect(loadSave(LATER)).rejects.toBeInstanceOf(InvalidSaveError);
    expect((await readStoredRow())?.data).toEqual(damaged);
  });

  it('throws on a save from a newer game and does not overwrite it', async () => {
    const future = { ...createSampleSave(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    await getSaveDatabase().saves.put({ slot: SAVE_SLOT, data: future });

    await expect(loadSave(LATER)).rejects.toBeInstanceOf(FutureSaveVersionError);
    expect((await readStoredRow())?.data).toEqual(future);
  });
});

describe('writeSave', () => {
  it('replaces the previous save in the same slot', async () => {
    await writeSave(createDefaultSave(TEST_NOW));
    await writeSave(createSampleSave());

    expect(await getSaveDatabase().saves.count()).toBe(1);
    expect((await readStoredRow())?.data).toEqual(createSampleSave());
  });

  it('refuses to store invalid data', async () => {
    const invalid = {
      ...createSampleSave(),
      settings: { ...createSampleSave().settings, audioVolume: 5 },
    };

    await expect(writeSave(invalid)).rejects.toBeInstanceOf(InvalidSaveError);
    expect(await readStoredRow()).toBeUndefined();
  });
});

describe('clearSave', () => {
  it('deletes the save so the next load starts a new game', async () => {
    await writeSave(createSampleSave());

    await clearSave();

    expect(await readStoredRow()).toBeUndefined();
    expect(await loadSave(LATER)).toEqual(createDefaultSave(LATER));
  });
});

describe('requestPersistentStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with the browser answer when persist() exists', async () => {
    await expect(requestPersistentStorage({ persist: () => Promise.resolve(true) })).resolves.toBe(
      true,
    );
    await expect(requestPersistentStorage({ persist: () => Promise.resolve(false) })).resolves.toBe(
      false,
    );
  });

  it('resolves false when the browser has no storage manager or no persist()', async () => {
    await expect(requestPersistentStorage(undefined)).resolves.toBe(false);
    await expect(requestPersistentStorage({})).resolves.toBe(false);
  });

  it('uses navigator.storage by default', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    vi.stubGlobal('navigator', { storage: { persist } });

    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('resolves false where there is no navigator at all', async () => {
    vi.stubGlobal('navigator', undefined);

    await expect(requestPersistentStorage()).resolves.toBe(false);
  });

  it('passes a browser failure on to the caller instead of hiding it', async () => {
    const failure = new Error('SecurityError');

    await expect(requestPersistentStorage({ persist: () => Promise.reject(failure) })).rejects.toBe(
      failure,
    );
  });
});
