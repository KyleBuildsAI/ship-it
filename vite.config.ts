import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// GitHub Pages serves this repo from https://kylebuildsai.github.io/ship-it/, so
// production builds need that path prefix or every asset URL 404s. `vite preview`
// serves the production build, so it must use the same prefix. Dev stays at "/".
const PAGES_BASE = '/ship-it/';

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  plugins: [react()],
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
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx'],
      reporter: ['text', 'html'],
      // CLAUDE.md: the engine is graded like production code. Dropping below 90% fails the run.
      thresholds: {
        'src/engine/**': { statements: 90, branches: 90, functions: 90, lines: 90 },
      },
    },
  },
}));
