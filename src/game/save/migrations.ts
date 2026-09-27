import { CURRENT_SCHEMA_VERSION, saveDataSchema, type SaveData } from './schema';

/**
 * Upgrading old saves.
 *
 * Every time the save shape changes, CURRENT_SCHEMA_VERSION goes up by one and a new step is
 * added to MIGRATIONS. Loading a save then replays only the steps it missed, in order, and
 * checks the result against the current schema. Old saves keep working forever, and each
 * step only has to know about two neighboring versions.
 */

/** Save data whose shape we have not checked yet. Migrations only see plain JSON objects. */
type UncheckedSave = Readonly<Record<string, unknown>>;

/** One upgrade step. It must be pure: return a new object and never modify its input. */
type Migration = (save: UncheckedSave) => UncheckedSave;

/** The save says it comes from a newer game. Loading it here could lose fields we don't know. */
export class FutureSaveVersionError extends Error {
  readonly version: number;

  constructor(version: number) {
    super(
      `Save schema version ${String(version)} is newer than this game supports (${String(CURRENT_SCHEMA_VERSION)}).`,
    );
    this.name = 'FutureSaveVersionError';
    this.version = version;
  }
}

/** The save is not in a shape this game can use, even after migrating. */
export class InvalidSaveError extends Error {
  /** One readable line per problem, such as "profile.xp: Too small: expected number to be >=0". */
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Save data is invalid: ${issues.join('; ')}`);
    this.name = 'InvalidSaveError';
    this.issues = issues;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Version 0 to 1. No released game ever wrote a version 0 save: it is a sample "before"
 * shape (no schemaVersion field, `xp` at the top level) that keeps the migration pipeline
 * exercised and tested until the first real schema change adds a real step. It also means a
 * save missing schemaVersion entirely still loads.
 */
function moveXpIntoProfile(save: UncheckedSave): UncheckedSave {
  const { xp, ...rest } = save;
  const profile = isPlainObject(rest.profile) ? rest.profile : {};
  // If the legacy xp is missing, keep whatever the profile had rather than inventing a value.
  // Validation afterwards reports it if xp is missing from both places.
  const movedXp = xp === undefined ? {} : { xp };
  return { ...rest, schemaVersion: 1, profile: { ...profile, ...movedXp } };
}

/**
 * Version 1 to 2: the first-run tutorial arrived. Saves from before it have never seen the
 * tutorial, so it starts as not done and runs once for them too.
 */
function addTutorial(save: UncheckedSave): UncheckedSave {
  return { ...save, schemaVersion: 2, tutorial: { completedAt: null } };
}

/** MIGRATIONS[n] upgrades a version n save to version n + 1. */
export const MIGRATIONS: readonly Migration[] = [moveXpIntoProfile, addTutorial];

function readSchemaVersion(save: UncheckedSave): number {
  const version = save.schemaVersion;
  // Saves from before versioning existed have no schemaVersion at all.
  if (version === undefined) return 0;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw new InvalidSaveError([
      `schemaVersion: expected a whole number, got ${JSON.stringify(version)}`,
    ]);
  }
  return version;
}

/** Checks data against the current schema. Returns the clean data or throws InvalidSaveError. */
export function validateSave(candidate: unknown): SaveData {
  const result = saveDataSchema.safeParse(candidate);
  if (!result.success) {
    throw new InvalidSaveError(
      result.error.issues.map((issue) => {
        const path = issue.path.map(String).join('.');
        return path === '' ? issue.message : `${path}: ${issue.message}`;
      }),
    );
  }
  return result.data;
}

/**
 * Turns stored data of any known version into a valid current save.
 *
 * Throws FutureSaveVersionError for saves from a newer game, and InvalidSaveError for
 * anything that is not a valid save once migrated.
 */
export function migrate(raw: unknown): SaveData {
  if (!isPlainObject(raw)) {
    throw new InvalidSaveError(['The save must be a JSON object.']);
  }
  const version = readSchemaVersion(raw);
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new FutureSaveVersionError(version);
  }
  // A version 0 save runs every step. A current save runs none and is only validated.
  const upgraded = MIGRATIONS.slice(version).reduce<UncheckedSave>((save, step) => step(save), raw);
  return validateSave(upgraded);
}
