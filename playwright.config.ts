import { defineConfig } from '@playwright/test';
import { PREVIEW_PORT } from './server/port.ts';

const PORT = String(PREVIEW_PORT);
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/e2e',
  // One test at a time, everywhere. Every test draws the 3D world, and Playwright keeps
  // every tab "visible", so nothing pauses its rendering the way a real background tab
  // would. Parallel workers fight over one GPU (or, on CI's GPU-less runners, two CPU
  // cores), and a starved tab can take minutes to answer: that was the flaky cross-tab
  // test in #151. One worker is reliable, and on Kyle's machine it's faster too.
  workers: 1,
  // Hard ceilings so a stuck browser fails the run instead of hanging it forever. Software
  // rendering makes CI several times slower: a multi-screen test there takes 1-2 minutes.
  timeout: isCI ? 120_000 : 30_000,
  // The suite outgrew 15 minutes on CI; 22 stays under the job's 25-minute limit.
  globalTimeout: isCI ? 22 * 60_000 : 5 * 60_000,
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
