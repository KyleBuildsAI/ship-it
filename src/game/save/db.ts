import { Dexie, type EntityTable } from 'dexie';
import { migrate, validateSave } from './migrations';
import { CURRENT_SCHEMA_VERSION, createDefaultSave, type SaveData } from './schema';

/**
 * Saving to IndexedDB, the browser's built-in database. Unlike memory, it survives closing
 * the tab, restarting the browser, and rebooting. Dexie is a thin library that gives
 * IndexedDB a friendlier, promise-based API.
 */

export const DATABASE_NAME = 'ship-it';

/** There is one save slot today. Keying rows by slot leaves room for more without a new table. */
export const SAVE_SLOT = 'main';

/**
 * One row in the "saves" table. `data` is `unknown` on purpose: a stored row may have been
 * written by an older version of the game, so it goes through migrate() before anything trusts it.
 */
export interface SaveRow {
  slot: string;
  data: unknown;
}

export type SaveDatabase = Dexie & { saves: EntityTable<SaveRow, 'slot'> };

let database: SaveDatabase | null = null;

function openSaveDatabase(): SaveDatabase {
  // Dexie creates the `saves` property at runtime from stores() below, where TypeScript can't
  // see it. The cast describes that table. It is the typing pattern Dexie's own docs use.
  const db = new Dexie(DATABASE_NAME) as SaveDatabase;
  // This version is the database layout (tables and keys), not the save's schemaVersion.
  // The save's shape is versioned inside the data, so it can change without touching this.
  db.version(1).stores({ saves: 'slot' });
  return db;
}

/** The shared connection. Created on first use, so merely importing this file never opens IndexedDB. */
export function getSaveDatabase(): SaveDatabase {
  database ??= openSaveDatabase();
  return database;
}

/** Closes the connection. The next call opens a fresh one, which is how tests simulate a restart. */
export function closeSaveDatabase(): void {
  database?.close();
  database = null;
}

function storedSchemaVersion(data: unknown): unknown {
  return typeof data === 'object' && data !== null && 'schemaVersion' in data
    ? data.schemaVersion
    : undefined;
}

/**
 * Validates and stores the save. Validating on the way in means a bug elsewhere can never
 * write a save that would then fail to load.
 */
export async function writeSave(data: SaveData): Promise<void> {
  const checked = validateSave(data);
  await getSaveDatabase().saves.put({ slot: SAVE_SLOT, data: checked });
}

/**
 * Loads the save, creating and storing a new game on first launch.
 *
 * A damaged save (InvalidSaveError) or one from a newer game (FutureSaveVersionError) is
 * thrown to the caller and left untouched in the database. Replacing it with a new game
 * here would wipe real progress without asking; the UI should offer import or reset instead.
 */
export async function loadSave(now: Date): Promise<SaveData> {
  const row = await getSaveDatabase().saves.get(SAVE_SLOT);
  if (row === undefined) {
    const fresh = createDefaultSave(now);
    await writeSave(fresh);
    return fresh;
  }
  const save = migrate(row.data);
  if (storedSchemaVersion(row.data) !== CURRENT_SCHEMA_VERSION) {
    // Store the upgraded copy so the next load doesn't have to migrate again.
    await writeSave(save);
  }
  return save;
}

/** Deletes the save. The next loadSave() starts a new game. */
export async function clearSave(): Promise<void> {
  await getSaveDatabase().saves.delete(SAVE_SLOT);
}

/** The one StorageManager method we use. It is optional because not every browser has it. */
export interface PersistableStorage {
  persist?: () => Promise<boolean>;
}

function browserStorage(): PersistableStorage | undefined {
  // The DOM types promise that `navigator.storage` always exists, but it is missing in older
  // browsers, on plain-http pages, and in Node. Reading it through an honest type makes
  // TypeScript insist on the checks below.
  const { navigator } = globalThis as { navigator?: { storage?: PersistableStorage } };
  return navigator?.storage;
}

/**
 * Asks the browser not to delete our data when the disk runs low. Without this, the browser
 * may treat IndexedDB as a cache and evict it. Resolves true if the browser agreed, and false
 * if it refused or can't be asked. If the browser's persist() call itself fails, this rejects
 * with that error so the caller can report it.
 */
export async function requestPersistentStorage(
  storage: PersistableStorage | undefined = browserStorage(),
): Promise<boolean> {
  if (storage?.persist === undefined) return false;
  return storage.persist();
}
