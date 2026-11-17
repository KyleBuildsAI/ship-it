import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { collectConsoleProblems } from './consoleProblems';

/*
 * Each Campus portal wears a ring of segments, one per part of its Act, lit where that
 * part's skill tree node is lit (DESIGN.md section 4, Campus). The test reads the ring
 * through the world's test hooks (src/game/world/testHooks.ts), never from pixels.
 */

interface Hooks {
  portalShare: (act: number) => { lit: number; parts: number } | null;
}

const ACTS = [1, 2, 3, 4, 5, 6, 7, 8];
/** Act 3's first lesson. A ★★★ run (90%+ right on the first try) lights its node. */
const LESSON = 'branches-are-pointers';

/** What every portal's ring shows, Act 1 first. Runs in the page, which holds the hooks. */
function shares(page: Page) {
  return page.evaluate(
    (acts) =>
      acts.map(
        (act) => (window as { __shipItTest?: Hooks }).__shipItTest?.portalShare(act) ?? null,
      ),
    ACTS,
  );
}

/**
 * The player's save with LESSON finished at 100%, as a save file to import. It starts from
 * the game's own export, so every other field stays exactly as the game wrote it.
 */
async function saveWithLessonMastered(page: Page): Promise<Buffer> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export save' }).click();
  const file = await (await downloading).path();
  const envelope = JSON.parse(await readFile(file, 'utf8')) as {
    data: { missions: Record<string, object> };
  };
  envelope.data.missions[LESSON] = {
    status: 'completed',
    stepIndex: 0,
    completedSteps: [],
    bestDrillScore: 100,
    completedAt: new Date().toISOString(),
    xpEarned: 0,
    resume: null,
  };
  return Buffer.from(JSON.stringify(envelope));
}

test("each portal shows its Act's lit share, and a node lighting shows at once", async ({
  page,
}) => {
  // An export, an import and the 3D world: CI renders in software, so allow extra time.
  test.slow();
  const problems = collectConsoleProblems(page);
  await page.goto('./');
  const badge = page.getByLabel('Developer status');
  await expect(badge).toContainText('saved', { timeout: 15_000 });
  await expect(badge).toContainText(/WebGPU|WebGL2 fallback/, { timeout: 15_000 });

  // A new save: every portal is open and has a segment for each part of its Act, none lit.
  await expect.poll(() => shares(page)).not.toContain(null);
  const fresh = await shares(page);
  for (const share of fresh) {
    expect(share?.parts).toBeGreaterThan(0);
    expect(share?.lit).toBe(0);
  }

  // Finish Act 3's first lesson at ★★★ and load that save, as the game would after a run.
  const lit = await saveWithLessonMastered(page);
  await page.locator('input[type=file]').setInputFiles({
    name: 'lesson-mastered.json',
    mimeType: 'application/json',
    buffer: lit,
  });
  await expect(page.getByText('Save imported.')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Close Settings' }).click();

  // Act 3's portal lights one segment of the same ring; every other portal is unchanged.
  const expected = fresh.map((share, index) =>
    ACTS[index] === 3 && share !== null ? { ...share, lit: 1 } : share,
  );
  await expect.poll(() => shares(page)).toEqual(expected);
  expect(problems).toEqual([]);
});
