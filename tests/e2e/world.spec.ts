import { expect, test } from '@playwright/test';
import { collectConsoleProblems } from './consoleProblems';

test('WASD walks the avatar, but typing in the terminal does not', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  await expect(page.getByLabel('Developer status')).toContainText(/WebGPU|WebGL2 fallback/, {
    timeout: 15_000,
  });
  const title = page.getByRole('heading', { name: 'SHIP IT' });

  // Typing "wasd" into the terminal is text, not movement: the big title stays.
  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.insertText('wasd');
  await page.keyboard.down('w');
  await page.waitForTimeout(300);
  await page.keyboard.up('w');
  await expect(title).toBeVisible();

  // With the world focused, W walks, and the title steps aside for the zone name.
  await page.locator('#scene canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.down('w');
  await expect(page.getByRole('heading', { name: 'Campus' })).toBeVisible();
  await page.keyboard.up('w');
  expect(problems).toEqual([]);
});
