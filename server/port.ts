/*
 * Which port Sage listens on. Both the server (config.ts) and Vite's /api proxy
 * (vite.config.ts) read MENTOR_PORT through this file, so the proxy always points where
 * Sage actually is, even when .env has a typo. It imports nothing on purpose: vite.config.ts
 * loads it directly, without the rest of the server.
 */

// Above 15000 on purpose. Windows reserves random blocks of ports for Hyper-V and WSL inside
// its dynamic port range, and tools like Docker often widen that range down to 1024. Ports
// in those blocks fail with EACCES, so the default stays above where they usually land.
export const DEFAULT_PORT = 18787;

/**
 * The port MENTOR_PORT asks for. Blank or missing means the default. Returns null when the
 * value isn't a whole number from 1 to 65535, so the caller can warn and use the default.
 */
export function parsePort(raw: string | undefined): number | null {
  const text = raw?.trim() ?? '';
  if (text === '') return DEFAULT_PORT;
  const port = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}
