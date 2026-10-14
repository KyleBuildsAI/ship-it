import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { collectConsoleProblems } from './consoleProblems';

/*
 * The Act menu and every activity share one scroll box (PlayPanel.tsx). At 1280x800 with
 * the terminal open that box is short, so reaching Act 2's final means scrolling the menu
 * down. The final must still open at its top, title and clock in sight, and starting it
 * must not need the terminal: it's answered by clicking.
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

test('a final opened from a scrolled Act menu starts at its top', async ({ page }) => {
  test.slow();
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  await expect(page.getByLabel('Developer status')).toContainText('saved');
  // An open terminal makes the panel short enough that the final needs scrolling to.
  await page.keyboard.press('Control+Backquote');
  await openAct2(page);

  const play = panel(page)
    .getByRole('listitem')
    .filter({ hasText: '2.6 Final: The Dirty Tree' })
    .getByRole('button', { name: 'Play' });
  await play.scrollIntoViewIfNeeded();
  expect(await panel(page).evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await play.click();

  await expect(page.getByRole('heading', { name: 'The Dirty Tree' })).toBeInViewport();
  await expect(page.getByText('Final challenge')).toBeInViewport();
  expect(await panel(page).evaluate((element) => element.scrollTop)).toBe(0);
  expect(problems).toEqual([]);
});
