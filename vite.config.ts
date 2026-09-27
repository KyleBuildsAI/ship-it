import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin, type ProxyOptions } from 'vite';
import { defineConfig } from 'vitest/config';
// With the .ts extension, because Vite's upcoming native config loader requires one.
import { DEFAULT_PORT, GAME_PORT, parsePort } from './server/port.ts';

// GitHub Pages serves this repo from https://kylebuildsai.github.io/ship-it/, so
// production builds need that path prefix or every asset URL 404s. `vite preview`
// serves the production build, so it must use the same prefix. Dev stays at "/".
const PAGES_BASE = '/ship-it/';

/**
 * Where Sage listens. MENTOR_PORT goes through the server's own parser, so a typo in .env
 * sends the proxy to the same fallback port Sage uses (Sage prints the warning).
 */
function sageUrl(mode: string): string {
  const raw = loadEnv(mode, process.cwd(), 'MENTOR_PORT').MENTOR_PORT;
  return `http://127.0.0.1:${String(parsePort(raw) ?? DEFAULT_PORT)}`;
}

// When the Sage server isn't running (say, only `npm run dev:web`), answer the game the way
// Sage answers without a key: offline. Status 200 on purpose, because Chrome logs every
// 4xx/5xx response as a console error and DESIGN.md section 14 wants a clean console.
// Vite still prints the proxy error in the terminal, where it's useful.
const answerOfflineWhenSageIsDown: ProxyOptions['configure'] = (proxy) => {
  proxy.on('error', (_error, _request, response) => {
    if (!('writeHead' in response) || response.headersSent) return;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ offline: true, error: 'The Sage server is not running.' }));
  });
};

/**
 * Answers /__ship-it/checkout with this checkout's folder, in dev only. start-ship-it.bat
 * uses it to tell "SHIP IT from this folder is already running" apart from any other app
 * (or another copy of the repo) holding the port.
 */
function identifyCheckout(): Plugin {
  return {
    name: 'ship-it-identify-checkout',
    configureServer(server) {
      server.middlewares.use('/__ship-it/checkout', (_request, response) => {
        response.setHeader('content-type', 'text/plain; charset=utf-8');
        response.end(process.cwd());
      });
    },
  };
}

export default defineConfig(({ command, mode, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  plugins: [react(), identifyCheckout()],
  server: {
    // Always the same port, never a fallback: the save lives in the browser under this exact
    // address, so another port would open an empty game. Better to fail loudly.
    port: GAME_PORT,
    strictPort: true,
    // The game calls /api/...; in dev, Vite forwards those to the local Sage server.
    proxy: {
      '/api': { target: sageUrl(mode), configure: answerOfflineWhenSageIsDown },
    },
  },
  resolve: {
    // three.js addons import from 'three'. Point that at the WebGPU build our code uses,
    // so only one copy of the three.js core loads (two copies break instanceof checks).
    alias: [{ find: /^three$/, replacement: 'three/webgpu' }],
  },
  build: {
    // The three.js WebGPU core alone is over the 500 kB default. It loads in its own
    // lazy chunk after the HUD, so the warning would only be noise.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
      // Entry points only wire real modules together; the modules they wire are tested.
      exclude: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'src/main.tsx', 'server/index.ts'],
      reporter: ['text', 'html'],
      // CLAUDE.md: the engine is graded like production code. Dropping below 90% fails the run.
      thresholds: {
        'src/engine/**': { statements: 90, branches: 90, functions: 90, lines: 90 },
      },
    },
  },
}));
