import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
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
  await page.getByRole('button', { name: 'Acts', exact: true }).click();
  // Every Act is unlocked by default, and the menu opens on Act 1.
  await page.getByRole('tab', { name: 'Act 2' }).click();
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

// Both tabs render the 3D world in software on CI, so cross-tab checks get extra time.
const CROSS_TAB = { timeout: 20_000 };
const NOTICE = 'SHIP IT is open in another tab';

test('only the newest tab saves, and the other one can take it back', async ({ context }) => {
  test.slow();
  const first = await context.newPage();
  const firstProblems = collectConsoleProblems(first);
  await first.goto('./');
  await expect(first.getByLabel('Developer status')).toContainText('saved', CROSS_TAB);

  const second = await context.newPage();
  const secondProblems = collectConsoleProblems(second);
  await second.goto('./');
  await expect(second.getByLabel('Developer status')).toContainText('saved', CROSS_TAB);

  // The older tab hands over instead of racing the newer one for the save.
  await expect(first.getByRole('heading', { name: NOTICE })).toBeVisible(CROSS_TAB);
  await expect(first.getByLabel('Developer status')).toContainText('other tab', CROSS_TAB);
  await expect(second.getByRole('heading', { name: NOTICE })).toHaveCount(0);

  await first.getByRole('button', { name: 'Play here instead' }).click();
  await expect(second.getByRole('heading', { name: NOTICE })).toBeVisible(CROSS_TAB);
  await expect(first.getByLabel('Developer status')).toContainText('saved', CROSS_TAB);
  await expect(first.getByRole('heading', { name: NOTICE })).toHaveCount(0);
  expect(firstProblems).toEqual([]);
  expect(secondProblems).toEqual([]);
});

test('two tabs opened at the same moment end with exactly one saving', async ({ context }) => {
  test.slow();
  const tabs = [await context.newPage(), await context.newPage()];
  await Promise.all(tabs.map((tab) => tab.goto('./')));
  // Whichever asked last owns the save; the other says so. Never both, never neither.
  await expect
    .poll(async () => {
      const states = await Promise.all(
        tabs.map((tab) => tab.getByLabel('Developer status').innerText()),
      );
      return states
        .map((text) =>
          text.includes('other tab') ? 'elsewhere' : text.includes('saved') ? 'saving' : 'loading',
        )
        .toSorted();
    }, CROSS_TAB)
    .toEqual(['elsewhere', 'saving']);
});
