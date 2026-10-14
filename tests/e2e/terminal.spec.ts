import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { collectConsoleProblems } from './consoleProblems';

async function run(page: Page, ...commands: string[]): Promise<void> {
  // The terminal starts put away; open it when it isn't already.
  const toggle = page.getByRole('button', { name: /Terminal/ });
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  const input = page.locator('.xterm-helper-textarea');
  await input.focus();
  for (const command of commands) {
    // insertText delivers the whole command in one input event, like a paste, instead of
    // one key at a time; much faster on slow CI machines and just as real for the terminal.
    await page.keyboard.insertText(command);
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

test('edits a file with code and git sees the change', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  await run(
    page,
    'git init',
    'git add .',
    'git commit -m "feat: first commit"',
    'code src/config.ts',
  );

  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('export const HOST = "localhost";');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.editor-panel__header')).toContainText('Saved');

  await run(page, 'git status -s');
  await expect(page.locator('.xterm-rows')).toContainText('M src/config.ts');
  await page.getByRole('button', { name: 'Close editor' }).click();
  await expect(page.locator('.editor-panel')).toHaveCount(0);
  expect(problems).toEqual([]);
});

test('toggles the terminal with Ctrl+backquote', async ({ page }) => {
  await page.goto('./');
  const button = page.getByRole('button', { name: /Terminal/ });
  // It starts put away: most of the game needs no typing.
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Control+Backquote');
  await expect(page.getByRole('region', { name: 'Terminal' })).toBeVisible();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+Backquote');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
});
