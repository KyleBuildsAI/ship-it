import { expect, test } from './fixtures';
import { collectConsoleProblems } from './consoleProblems';

test('every Act is open, and Act 1 opens a PowerShell laptop', async ({ page }) => {
  // Several screens: CI renders the 3D world in software, so allow extra time.
  test.slow();
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  await expect(page.getByLabel('Developer status')).toContainText('saved');

  // A new save shows all eight Acts, starting at Act 1.
  await page.getByRole('button', { name: 'Acts', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Act 1 · The Machine' })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(8);

  await page
    .getByRole('listitem')
    .filter({ hasText: 'Laptop sandbox' })
    .getByRole('button', { name: 'Open' })
    .click();

  // The terminal is PowerShell on the laptop now: listing home shows a Windows home folder.
  // (The opening notice names quillwork, so check for a folder only the listing prints.)
  const terminal = page.locator('.xterm-rows');
  await expect(terminal).toContainText('PS C:\\Users\\kyle>');
  await page.locator('.xterm-helper-textarea').focus();
  await page.keyboard.insertText('ls');
  await page.keyboard.press('Enter');
  await expect(terminal).toContainText('Downloads');

  // Act 2's boss is open without playing its missions first.
  await page.getByRole('button', { name: 'Acts', exact: true }).click();
  await page.getByRole('tab', { name: 'Act 2' }).click();
  await expect(page.getByRole('button', { name: 'Fight' })).toBeEnabled();
  expect(problems).toEqual([]);
});

test('Mission 1.1 plays in the terminal, graded by where things really are', async ({ page }) => {
  test.slow();
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  await expect(page.getByLabel('Developer status')).toContainText('saved');

  await page.getByRole('button', { name: 'Acts', exact: true }).click();
  await page
    .getByRole('region', { name: 'Missions' })
    .getByRole('listitem')
    .filter({ hasText: 'Where Things Live' })
    .getByRole('button', { name: 'Play' })
    .click();
  await page.getByRole('button', { name: 'Skip briefing' }).click();
  await expect(page.getByText('Step 1 of 4')).toBeVisible();

  // A bare name from home fails; the full path works.
  const input = page.locator('.xterm-helper-textarea');
  await input.focus();
  await page.keyboard.insertText('cd api');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Step 1 of 4')).toBeVisible();
  await page.keyboard.insertText('cd C:\\Users\\kyle\\quillwork\\api');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Step 2 of 4')).toBeVisible();
  expect(problems).toEqual([]);
});
