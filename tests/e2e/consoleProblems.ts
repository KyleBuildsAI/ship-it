import type { Page } from '@playwright/test';

/**
 * Warnings Chrome itself prints about a machine with no GPU, like GitHub's CI runners:
 * the WebGPU probe finding no adapter, and the software renderer (SwiftShader) noting
 * it had to read the canvas back. They describe the environment, not our code, and never
 * appear on a machine with a real GPU. Anything else still fails the test.
 */
const NO_GPU_ENVIRONMENT_WARNINGS = [
  /^No available adapters\.$/,
  /^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels/,
];

/**
 * Collects everything DESIGN.md section 14 counts as a failure: console errors,
 * console warnings, uncaught exceptions, and failed requests. Attach it before
 * navigating so nothing from the first load is missed.
 */
export function collectConsoleProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    const type = message.type();
    if (type !== 'error' && type !== 'warning') return;
    const text = message.text();
    if (type === 'warning' && NO_GPU_ENVIRONMENT_WARNINGS.some((pattern) => pattern.test(text))) {
      return;
    }
    problems.push(`console.${type}: ${text}`);
  });
  page.on('pageerror', (error) => {
    problems.push(`uncaught: ${error.message}`);
  });
  page.on('requestfailed', (request) => {
    problems.push(
      `request failed: ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      problems.push(`HTTP ${String(response.status())}: ${response.url()}`);
    }
  });
  return problems;
}
