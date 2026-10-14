import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { collectConsoleProblems } from './consoleProblems';

/**
 * Mission 2.1's first step, directed: Kyle picks a card, allows Otto's git init at its
 * gate, and confirms the check. Nothing is typed, and the terminal stays closed.
 */
async function makeTheRepository(page: Page): Promise<void> {
  await expect(page.getByText('Step 1 of 3', { exact: true })).toBeVisible();
  await page
    .getByRole('list', { name: 'Request cards' })
    .getByRole('button', { name: /Turn this folder into a git repository/ })
    .click();
  await page
    .getByRole('group', { name: "Approve Otto's action" })
    .getByRole('button', { name: 'Allow' })
    .click();
  await page
    .getByRole('group', { name: "Check Otto's claim" })
    .getByRole('button', { name: /A new repository/ })
    .click();
  await expect(page.getByText('Confirmed.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Terminal/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.getByText('Step 2 of 3', { exact: true })).toBeVisible();
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
  await makeTheRepository(page);

  // Closing the browser mid-mission loses nothing: the save is in IndexedDB.
  await page.reload();
  await expect(page.getByLabel('Developer status')).toContainText('saved');
  await openAct2(page);
  await expect(missionRow(page, 'Three Rooms')).toContainText('In progress');
  // ...and Play picks it up at the step reached, on the repository git init made.
  await missionRow(page, 'Three Rooms').getByRole('button', { name: 'Play' }).click();
  await expect(page.getByText('Step 2 of 3', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip briefing' })).toHaveCount(0);
  expect(problems).toEqual([]);
});

test("Act 2's placement test is answered by clicking, with the terminal closed", async ({
  page,
}) => {
  test.slow();
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  await expect(page.getByLabel('Developer status')).toContainText('saved');

  await openAct2(page);
  await page
    .getByRole('region', { name: 'Missions' })
    .getByRole('listitem')
    .filter({ hasText: 'Placement test' })
    .getByRole('button', { name: 'Take' })
    .click();
  await page.getByRole('button', { name: 'Start 1 of 12' }).click();
  // Every drill it borrows is a judgment drill: Kyle picks an answer, nothing is typed.
  await expect(page.getByRole('group', { name: 'Judgment drill' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Your answer' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Terminal/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
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
  await makeTheRepository(page);

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
