/**
 * Where the server writes status lines. Modules take a Logger instead of calling console
 * directly, so tests can capture or silence output without patching globals.
 */
export interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Plain console output. No prefix of its own: `npm run dev` already labels every line
 * from this process with [sage], next to Vite's [web] lines.
 */
export const consoleLogger: Logger = {
  info: (message) => {
    console.info(message);
  },
  warn: (message) => {
    console.warn(message);
  },
  error: (message) => {
    console.error(message);
  },
};
