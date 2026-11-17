import { expect, test } from './fixtures';
import { collectConsoleProblems } from './consoleProblems';

/** An Act's own content file in the build, like act2-<hash>.js or lessonAct-<hash>.js. */
const ACT_CHUNK = /\/assets\/(act\d|lessonAct)-[^/]*\.js$/;

test('the Trophy Wall draws the skill tree without downloading an Act', async ({ page }) => {
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  await expect(page.getByLabel('Developer status')).toContainText('saved');

  // From here on, nothing may fetch an Act: the tree reads the summaries and the save.
  const actChunks: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (ACT_CHUNK.test(pathname)) actChunks.push(pathname);
  });

  await page.getByRole('button', { name: 'Trophies', exact: true }).click();
  const tree = page.getByRole('region', { name: 'Skill tree' });
  // A row per Act, each a <details>, and the first Act's open for a new player.
  await expect(tree.getByRole('group')).toHaveCount(8);
  await expect(tree.getByText('Act 8 · The Loop', { exact: true })).toBeVisible();
  await expect(tree.getByRole('listitem').filter({ hasText: 'Where Things Live' })).toContainText(
    'Not played yet',
  );
  expect(actChunks).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(tree).toHaveCount(0);
  expect(problems).toEqual([]);
});
