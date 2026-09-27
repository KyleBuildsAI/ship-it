/**
 * Where the server writes status lines. Modules take a Logger instead of calling console
 * directly, so tests can capture or silence output without patching globals.
 */
export interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

/** Prefixes every line so Sage's output is easy to spot next to Vite's in `npm run dev`. */
export const consoleLogger: Logger = {
  info: (message) => {
    console.info(`[sage] ${message}`);
  },
  warn: (message) => {
    console.warn(`[sage] ${message}`);
  },
  error: (message) => {
    console.error(`[sage] ${message}`);
  },
};
