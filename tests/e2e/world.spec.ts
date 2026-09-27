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

test('Space jumps, even right after clicking a HUD button', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  await expect(page.getByLabel('Developer status')).toContainText(/WebGPU|WebGL2 fallback/, {
    timeout: 15_000,
  });
  // The world's test hooks exist only under automation (see src/game/world/testHooks.ts).
  const height = () =>
    page.evaluate(
      () =>
        (
          window as { __shipItTest?: { avatarHeight: () => number } }
        ).__shipItTest?.avatarHeight() ?? -1,
    );
  const aJump = { intervals: [25], timeout: 5_000 };
  await expect.poll(height).toBe(0);

  await page.locator('#scene canvas').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Space');
  await expect.poll(height, aJump).toBeGreaterThan(0);
  await expect.poll(height).toBe(0);

  // A mouse click leaves no focus on the button, so Space jumps instead of pressing it again.
  const actButton = page.getByRole('button', { name: 'Act 2', exact: true });
  await actButton.click();
  await expect(actButton).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect.poll(height, aJump).toBeGreaterThan(0);
  await expect(actButton).toHaveAttribute('aria-pressed', 'true');
  expect(problems).toEqual([]);
});
