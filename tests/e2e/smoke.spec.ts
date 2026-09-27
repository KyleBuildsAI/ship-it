import { expect, test } from '@playwright/test';
import { collectConsoleProblems } from './consoleProblems';

test('loads the HUD with a clean console', async ({ page }) => {
  const problems = collectConsoleProblems(page);

  await page.goto('./');

  await expect(page.getByRole('heading', { name: 'SHIP IT' })).toBeVisible();
  const badge = page.getByLabel('Developer status');
  await expect(badge).toContainText('Sage');
  await expect(badge).toContainText('Save');

  // Give late warnings (lazy chunks, deferred effects) a moment to surface.
  await page.waitForTimeout(1500);
  expect(problems).toEqual([]);
});

test('the first frames are already moving', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'SHIP IT' })).toBeVisible();

  const first = await page.screenshot();
  await page.waitForTimeout(1500);
  const second = await page.screenshot();

  expect(first.equals(second)).toBe(false);
});
