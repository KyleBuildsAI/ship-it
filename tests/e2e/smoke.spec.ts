import { expect, test, type Page } from '@playwright/test';
import { collectConsoleProblems } from './consoleProblems';

/** Waits until the renderer has started and reports which backend it chose. */
async function waitForRenderer(page: Page): Promise<string> {
  const badge = page.getByLabel('Developer status');
  await expect(badge).toContainText(/WebGPU|WebGL2 fallback/, { timeout: 15_000 });
  await expect(badge).toContainText('r184');
  await expect(page.locator('#scene canvas')).toBeVisible();
  return (await badge.innerText()).includes('WebGPU') ? 'WebGPU' : 'WebGL2';
}

test('boots the 3D world and HUD with a clean console', async ({ page }, testInfo) => {
  const problems = collectConsoleProblems(page);

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'SHIP IT' })).toBeVisible();
  const backend = await waitForRenderer(page);
  testInfo.annotations.push({ type: 'backend', description: backend });

  // Give late warnings (shader compiles, deferred effects) a moment to surface.
  await page.waitForTimeout(1500);
  expect(problems).toEqual([]);
});

test('falls back to WebGL2 cleanly when forced', async ({ page }) => {
  const problems = collectConsoleProblems(page);

  await page.goto('./?backend=webgl2');
  expect(await waitForRenderer(page)).toBe('WebGL2');

  await page.waitForTimeout(1500);
  expect(problems).toEqual([]);
});

test('the render loop is live: frames change over time', async ({ page }, testInfo) => {
  await page.goto('./');
  await waitForRenderer(page);

  const first = await page.screenshot();
  await page.waitForTimeout(1500);
  const second = await page.screenshot();
  await testInfo.attach('frame-1', { body: first, contentType: 'image/png' });
  await testInfo.attach('frame-2', { body: second, contentType: 'image/png' });

  expect(first.equals(second)).toBe(false);
});
