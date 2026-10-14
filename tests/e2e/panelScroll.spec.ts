import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { collectConsoleProblems } from './consoleProblems';

/*
 * The Act menu and every activity share one scroll box (PlayPanel.tsx). At 1280x800 with
 * the terminal open that box is short, so reaching Fight means scrolling the menu down.
 * The boss view must still open at its top, title and clock in sight.
 */
test.use({ viewport: { width: 1280, height: 800 } });

async function openAct2(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Acts', exact: true }).click();
  await page.getByRole('tab', { name: 'Act 2' }).click();
  await expect(page.getByRole('heading', { name: 'Act 2 · Git Core' })).toBeVisible();
}

function panel(page: Page) {
  return page.getByRole('region', { name: 'Missions' });
}

test('a boss fight opened from a scrolled Act menu starts at its top', async ({ page }) => {
  test.slow();
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  await expect(page.getByLabel('Developer status')).toContainText('saved');
  // An open terminal makes the panel short enough that Fight needs scrolling to.
  await page.keyboard.press('Control+Backquote');
  await openAct2(page);

  const fight = page.getByRole('button', { name: 'Fight' });
  await fight.scrollIntoViewIfNeeded();
  expect(await panel(page).evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await fight.click();

  // "Dex deploys in" appears twice (the clock and Dex's message), so check the first one.
  await expect(page.getByText('Dex deploys in').first()).toBeInViewport();
  expect(await panel(page).evaluate((element) => element.scrollTop)).toBe(0);
  expect(problems).toEqual([]);
});
