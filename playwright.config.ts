import { defineConfig } from '@playwright/test';

const PORT = '4173';
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // Hard ceilings so a stuck browser fails the run instead of hanging it forever.
  timeout: 30_000,
  globalTimeout: 5 * 60_000,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    // Smoke tests run against the production build, served the way GitHub Pages serves it.
    baseURL: `http://localhost:${PORT}/ship-it/`,
    // The installed Google Chrome, not a downloaded test browser: Kyle's machine and
    // GitHub's Ubuntu runners both already have it, so nothing extra gets installed.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/ship-it/`,
    reuseExistingServer: !isCI,
  },
});
