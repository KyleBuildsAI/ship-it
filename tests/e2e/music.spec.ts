import { collectConsoleProblems } from './consoleProblems';
import { expect, test } from './fixtures';

// Starting a piece waits on the browser's media pipeline, which is slow on a busy machine
// and in CI's software rendering; allow it time.
const STARTS = { timeout: 20_000 };

test('music waits for a click, then plays, and the Music button mutes it', async ({ page }) => {
  test.slow();
  const problems = collectConsoleProblems(page);
  const musicRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://upload.wikimedia.org/'))
      musicRequests.push(request.url());
  });
  await page.goto('./');
  const musicRow = page
    .getByLabel('Developer status')
    .locator('.status-badge__row')
    .filter({ hasText: 'Music' });

  // Browsers block sound until the player interacts, so nothing even downloads before then.
  await expect(musicRow).toContainText('click to start', { timeout: 15_000 });
  expect(musicRequests).toEqual([]);

  await page.locator('#scene canvas').click({ position: { x: 5, y: 5 } });
  await expect(musicRow).toContainText('playing', STARTS);
  expect(musicRequests.length).toBeGreaterThan(0);

  const button = page.getByRole('button', { name: 'Music', exact: true });
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(musicRow).toContainText('off');

  await button.click();
  await expect(musicRow).toContainText('playing', STARTS);
  expect(problems).toEqual([]);
});

test('Settings shows the volume, what is playing, and the credits', async ({ page }) => {
  test.slow();
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  await expect(page.getByLabel('Developer status')).toContainText('saved');
  await page.getByRole('button', { name: 'Settings' }).click();

  const volume = page.getByRole('slider', { name: 'Music volume' });
  await expect(volume).toHaveValue('70');
  // Clicking Settings was the first interaction, so the music has started.
  await expect(page.getByText(/^Now playing: /)).toBeVisible(STARTS);

  await volume.fill('0');
  await expect(page.getByText('Music is off. Raise the volume to hear it.')).toBeVisible();

  await page.getByText('Music credits').click();
  await expect(
    page.getByText(/Clair de lune\. Performed by Laurens Goedhart\. CC BY 3\.0/),
  ).toBeVisible();
  expect(problems).toEqual([]);
});
