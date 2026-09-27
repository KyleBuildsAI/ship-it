import { expect, test } from '@playwright/test';
import { collectConsoleProblems } from './consoleProblems';

test('the first-run tutorial moves on as the player does each thing', async ({ page }) => {
  // Six steps and a reload: CI renders the 3D world in software, so allow extra time.
  test.slow();
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  await expect(page.getByLabel('Developer status')).toContainText(/WebGPU|WebGL2 fallback/, {
    timeout: 15_000,
  });
  const card = page.getByRole('complementary', { name: 'Tutorial' });
  const canvas = page.locator('#scene canvas');
  await expect(card).toContainText('step 1 of 6');

  await canvas.click({ position: { x: 5, y: 5 } });
  await page.keyboard.down('w');
  await expect(card).toContainText('step 2 of 6');
  await page.keyboard.up('w');

  await page.keyboard.press('Space');
  await expect(card).toContainText('step 3 of 6');

  const box = await canvas.boundingBox();
  if (!box) throw new Error('the 3D canvas has no size');
  await page.mouse.move(box.x + 200, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 340, box.y + 140, { steps: 8 });
  await page.mouse.up();
  await expect(card).toContainText('step 4 of 6');

  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.type('pwd');
  await page.keyboard.press('Enter');
  await expect(card).toContainText('step 5 of 6');

  await page.keyboard.press('Control+Backquote');
  await page.keyboard.press('Control+Backquote');
  await expect(card).toContainText('step 6 of 6');

  await page.getByRole('button', { name: 'Act 2' }).click();
  await expect(card).toContainText('You know the controls');

  // Finishing is saved: after a reload the tutorial stays away.
  await page.reload();
  await expect(page.getByLabel('Developer status')).toContainText('saved');
  await expect(card).toBeHidden();
  expect(problems).toEqual([]);
});

test('the tutorial can be skipped, and replayed from Settings', async ({ page }) => {
  test.slow();
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  await expect(page.getByLabel('Developer status')).toContainText('saved');
  const card = page.getByRole('complementary', { name: 'Tutorial' });

  await card.getByRole('button', { name: 'Skip tutorial' }).click();
  await expect(card).toBeHidden();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Replay tutorial' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
  await expect(card).toContainText('step 1 of 6');
  expect(problems).toEqual([]);
});
