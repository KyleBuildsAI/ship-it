import { FutureSaveVersionError, InvalidSaveError, migrate } from './migrations';
import type { SaveData } from './schema';

/**
 * Save files the player downloads from Settings and can import again later, or on another
 * machine. The save is wrapped in a small envelope with a `format` tag, so importing a random
 * JSON file fails with a clear message instead of a wall of validation errors.
 */

export const SAVE_FILE_FORMAT = 'ship-it-save';

export interface SaveFileEnvelope {
  format: typeof SAVE_FILE_FORMAT;
  exportedAt: string;
  data: SaveData;
}

export type ImportErrorReason = 'not-json' | 'wrong-format' | 'newer-version' | 'invalid-data';

/**
 * Why an import failed. `message` is written for the player and is safe to show in the UI.
 * `details` holds the technical specifics for the invalid-data case.
 */
export class ImportError extends Error {
  readonly reason: ImportErrorReason;
  readonly details: readonly string[];

  constructor(
    reason: ImportErrorReason,
    message: string,
    options: { details?: readonly string[]; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ImportError';
    this.reason = reason;
    this.details = options.details ?? [];
  }
}

/** Turns a save into the text of a .json file. Indented so a curious player can read it. */
export function exportSave(data: SaveData, now: Date): string {
  const envelope: SaveFileEnvelope = {
    format: SAVE_FILE_FORMAT,
    exportedAt: now.toISOString(),
    data,
  };
  return JSON.stringify(envelope, null, 2);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ImportError('not-json', "That file isn't a SHIP IT save. It isn't valid JSON.", {
      cause: error,
    });
  }
}

/**
 * Reads the text of an exported save file and returns a valid, current save.
 * Older saves are migrated. Every failure is thrown as an ImportError with a friendly message.
 */
export function importSave(text: string): SaveData {
  const parsed = parseJson(text);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('format' in parsed) ||
    parsed.format !== SAVE_FILE_FORMAT ||
    !('data' in parsed)
  ) {
    throw new ImportError(
      'wrong-format',
      "That file isn't a SHIP IT save. Pick a file you exported from Settings.",
    );
  }
  try {
    return migrate(parsed.data);
  } catch (error) {
    if (error instanceof FutureSaveVersionError) {
      throw new ImportError(
        'newer-version',
        'That save comes from a newer version of SHIP IT. Update the game, then import it again.',
        { cause: error },
      );
    }
    if (error instanceof InvalidSaveError) {
      throw new ImportError(
        'invalid-data',
        "That save file is damaged or was edited, so it can't be loaded. Your current progress wasn't changed.",
        { details: error.issues, cause: error },
      );
    }
    // Anything else is a bug in our code, not a problem with the file, so let it surface as-is.
    throw error;
  }
}
