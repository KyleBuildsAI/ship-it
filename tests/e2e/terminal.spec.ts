import { expect, test, type Page } from '@playwright/test';
import { collectConsoleProblems } from './consoleProblems';

async function run(page: Page, ...commands: string[]): Promise<void> {
  const input = page.locator('.xterm-helper-textarea');
  await input.focus();
  for (const command of commands) {
    await page.keyboard.type(command);
    await page.keyboard.press('Enter');
  }
}

test('runs git in the in-game terminal', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await page.goto('./');

  await run(
    page,
    'git init',
    'git add .',
    'git commit -m "feat: first commit"',
    'git log --oneline',
  );

  const screen = page.locator('.xterm-rows');
  await expect(screen).toContainText('Initialized empty Git repository');
  await expect(screen).toContainText('(HEAD -> main) feat: first commit');
  expect(problems).toEqual([]);
});

test('toggles the terminal with Ctrl+backquote', async ({ page }) => {
  await page.goto('./');
  const panel = page.getByRole('region', { name: 'Terminal' });
  await expect(panel).toBeVisible();
  await page.keyboard.press('Control+Backquote');
  await expect(page.getByRole('button', { name: /Terminal/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.keyboard.press('Control+Backquote');
  await expect(page.getByRole('button', { name: /Terminal/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
