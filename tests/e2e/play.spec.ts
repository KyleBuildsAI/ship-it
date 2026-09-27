import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { collectConsoleProblems } from './consoleProblems';

async function run(page: Page, ...commands: string[]): Promise<void> {
  const input = page.locator('.xterm-helper-textarea');
  await input.focus();
  for (const command of commands) {
    await page.keyboard.insertText(command);
    await page.keyboard.press('Enter');
  }
}

async function openAct2(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Act 2', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Act 2 · Git Core' })).toBeVisible();
}

function missionRow(page: Page, title: string) {
  return page.getByRole('region', { name: 'Missions' }).getByRole('listitem').filter({
    hasText: title,
  });
}

test('a mission step is graded by state and survives a reload', async ({ page }) => {
  // Several screens and a reload: CI renders the 3D world in software, so allow extra time.
  test.slow();
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  await expect(page.getByLabel('Developer status')).toContainText('saved');

  await openAct2(page);
  await missionRow(page, 'Three Rooms').getByRole('button', { name: 'Play' }).click();
  await page.getByRole('button', { name: 'Skip briefing' }).click();
  await expect(page.getByText('Step 1 of 5')).toBeVisible();

  await run(page, 'git init');
  await expect(page.getByText('Step 2 of 5')).toBeVisible();

  // Closing the browser mid-mission loses nothing: the save is in IndexedDB.
  await page.reload();
  await expect(page.getByLabel('Developer status')).toContainText('saved');
  await openAct2(page);
  await expect(missionRow(page, 'Three Rooms')).toContainText('In progress');
  expect(problems).toEqual([]);
});

test('an exported save imports back after starting over', async ({ page }) => {
  test.slow();
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  await expect(page.getByLabel('Developer status')).toContainText('saved');

  await openAct2(page);
  await missionRow(page, 'Three Rooms').getByRole('button', { name: 'Play' }).click();
  await page.getByRole('button', { name: 'Skip briefing' }).click();
  await run(page, 'git init');
  await expect(page.getByText('Step 2 of 5')).toBeVisible();

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export save' }).click();
  const file = await (await downloading).path();
  const exported = JSON.parse(await readFile(file, 'utf8')) as { format: string };
  expect(exported.format).toBe('ship-it-save');

  await page.getByRole('button', { name: 'Start over' }).click();
  await page.getByRole('button', { name: 'Yes, erase my progress' }).click();
  await page.getByRole('button', { name: 'Close Settings' }).click();
  // Starting over leaves the mission; the Act 2 menu (still open) shows a fresh Act.
  await expect(page.getByRole('heading', { name: 'Act 2 · Git Core' })).toBeVisible();
  await expect(missionRow(page, 'Three Rooms')).not.toContainText('In progress');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByText('Save imported.')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Close Settings' }).click();
  await expect(missionRow(page, 'Three Rooms')).toContainText('In progress');
  expect(problems).toEqual([]);
});
