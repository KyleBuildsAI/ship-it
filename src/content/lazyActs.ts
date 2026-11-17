import type { ActSummary } from '../game/play/actSummary';
import type { ActContent, LazyAct } from '../game/play/catalog';
import { LAPTOP_NOTICE, LAPTOP_SANDBOX } from './act1/laptop';
import { ACT_SUMMARIES } from './actSummaries.generated';

/*
 * The catalog the game runs on (main.tsx hands it to setLazyCatalog). Each Act comes as
 * its summary, which ships in the first download, and a loader. Every loader is an
 * import() with a fixed path, and the build turns each one into a file of its own
 * (act1-<hash>.js to act8-<hash>.js), fetched only when a menu or a Play button asks.
 *
 * Nothing else in the game may import an Act's folder directly: one static import would
 * pull that Act back into the first download. vite.config.ts fails the build if one does.
 * The one exception is Act 1's laptop.ts (and shared.ts, which builds it), imported just
 * below: the preview menu opens the laptop from the first screen, so it must load up front.
 * vite.config.ts allows exactly those two files (ACT_FILES_ALLOWED_UP_FRONT).
 */

/** The generated summary of Act `act`. The game can't draw its menus without one. */
function summaryOf(act: number): ActSummary {
  const summary = ACT_SUMMARIES.find((entry) => entry.act.act === act);
  if (summary === undefined) {
    throw new Error(
      `Act ${String(act)} has no summary in actSummaries.generated.ts. ` +
        'Run npm run content:summaries, then commit the file.',
    );
  }
  return summary;
}

/** An Act whose loader brings back exactly the content src/content/index.ts lists. */
function lazyAct(act: number, load: () => Promise<ActContent>): LazyAct {
  return { summary: summaryOf(act), load };
}

/** Every shipped Act, in play order, as the game downloads them. */
export const LAZY_ACTS: readonly LazyAct[] = [
  {
    // Act 1's laptop sandbox is fixture code, not JSON, so it can't be in the generated
    // summary. The preview menu imports it statically anyway, so it costs no extra download.
    summary: { ...summaryOf(1), freePlay: { steps: LAPTOP_SANDBOX, notice: LAPTOP_NOTICE } },
    load: async () => {
      const { act1, act1Missions, act1Lessons } = await import('./act1');
      return { act: act1, missions: act1Missions, lessons: act1Lessons };
    },
  },
  lazyAct(2, async () => {
    const { act2, act2Missions, act2Lessons } = await import('./act2');
    return { act: act2, missions: act2Missions, lessons: act2Lessons };
  }),
  lazyAct(3, async () => (await import('./act3')).act3),
  lazyAct(4, async () => (await import('./act4')).act4),
  lazyAct(5, async () => (await import('./act5')).act5),
  lazyAct(6, async () => (await import('./act6')).act6),
  lazyAct(7, async () => (await import('./act7')).act7),
  lazyAct(8, async () => (await import('./act8')).act8),
];
