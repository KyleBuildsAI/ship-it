import { expect, test } from './fixtures';
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
  const actButton = page.getByRole('button', { name: 'Acts', exact: true });
  await actButton.click();
  await expect(actButton).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect.poll(height, aJump).toBeGreaterThan(0);
  await expect(actButton).toHaveAttribute('aria-pressed', 'true');
  expect(problems).toEqual([]);
});

test('clicking the Act 2 portal walks through it into the Git World', async ({ page }) => {
  // A walk across Campus: CI renders the 3D world in software, so allow extra time.
  test.slow();
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  const badge = page.getByLabel('Developer status');
  await expect(badge).toContainText('saved', { timeout: 15_000 });
  await expect(badge).toContainText(/WebGPU|WebGL2 fallback/, { timeout: 15_000 });
  // The tutorial card would sit between the mouse and the portal.
  await page.getByRole('button', { name: 'Skip tutorial' }).click();

  // Each function below runs inside the page, so it reads the hooks there itself.
  interface Hooks {
    zone: () => string;
    portalPoint: (act: number) => { x: number; y: number } | null;
  }
  const portalPoint = () =>
    page.evaluate(() => (window as { __shipItTest?: Hooks }).__shipItTest?.portalPoint(2) ?? null);
  // The hooks arrive with the 3D world, which loads after the page.
  await expect.poll(portalPoint).not.toBeNull();
  const portal = await portalPoint();
  if (!portal) throw new Error('the Act 2 portal is not on screen from the spawn point');
  await page.mouse.click(portal.x, portal.y);

  await expect
    .poll(
      () =>
        page.evaluate(() => (window as { __shipItTest?: Hooks }).__shipItTest?.zone() ?? 'none'),
      { timeout: 60_000 },
    )
    .toBe('gitworld');
  await expect(page.getByRole('heading', { name: 'Git World' })).toBeVisible();
  expect(problems).toEqual([]);
});
