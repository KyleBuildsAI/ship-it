import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DevStatusModule from './devStatus';
import type * as ProgressModule from './progress';
import { createSimulatedBrowser, type Route, type SimulatedTab } from './simulatedBrowser';

/*
 * Two whole tabs of the game sharing one simulated browser (simulatedBrowser.ts), for #104:
 * "two tabs opened at the same moment" sometimes left one tab loading. progress.test.ts
 * plays the other tab by hand; here both tabs run the real progress.ts, so every ordering
 * of locks, asks and IndexedDB work between them can be replayed exactly.
 */

const NOW = new Date('2026-11-16T12:00:00.000Z');

/** One tab's copy of the game. Each real tab runs its own progress.ts, so each gets one. */
interface Game {
  readonly progress: typeof ProgressModule;
  readonly devStatus: typeof DevStatusModule.devStatus;
}

async function loadGame(): Promise<Game> {
  // Forget every module loaded so far, so this tab's save state starts out its own.
  vi.resetModules();
  const progress = await import('./progress');
  const { devStatus } = await import('./devStatus');
  return { progress, devStatus };
}

let first: Game;
let second: Game;

beforeAll(async () => {
  first = await loadGame();
  second = await loadGame();
});

beforeEach(() => {
  // Real timers stay for loading modules (above); from here on, time moves only when told.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  // Node's AbortSignal.timeout ignores fake timers. This one runs on them.
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort(new DOMException('The wait for the lock timed out', 'TimeoutError'));
    }, ms);
    return controller.signal;
  });
  for (const game of [first, second]) game.devStatus.update({ save: 'none' });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Starts the game in `tab` the way main.tsx does, as a task on that tab's main thread. */
function start(game: Game, tab: SimulatedTab): void {
  tab.run(() => {
    void game.progress.startProgress(tab.storage, NOW, tab.coordination);
  });
}

/** What the e2e test reads off a tab's dev badge. */
function badge(game: Game): 'saving' | 'elsewhere' | 'loading' {
  const { save } = game.devStatus.get();
  if (save === 'elsewhere') return 'elsewhere';
  return save === 'saved' ? 'saving' : 'loading';
}

function badges(): string[] {
  return [first, second].map(badge);
}

/** Every message takes `ms`, unless `slow` picks it out for a different time. */
function latency(
  slow: (route: Route, index: number) => number | undefined,
  ms = 1,
): (route: Route, index: number) => number {
  return (route, index) => slow(route, index) ?? ms;
}

const isChannelAsk = (route: Route, index: number) =>
  route.pipe === 'channel' && route.direction === 'up' && index > 0;

/** IndexedDB takes 50 ms to answer, so a tab's load is still going for a while. */
const slowDisk = latency((route) =>
  route.pipe === 'idb' && route.direction === 'down' ? 50 : undefined,
);

describe('two tabs opened at the same moment', () => {
  it.each(['a', 'b'])(
    'that hear each other ask end with the newer one saving (%s reaches the lock first)',
    async (firstToLock) => {
      // Connecting to the channel is quick but asks take 5 ms, so each tab is listening
      // before the other's ask arrives: both hear each other.
      const browser = createSimulatedBrowser({
        latency: latency((route, index) => {
          if (isChannelAsk(route, index)) return 5;
          if (route.pipe === 'locks' && route.direction === 'up' && route.tab !== firstToLock) {
            return 3;
          }
          return undefined;
        }),
      });
      const a = browser.openTab('a');
      const b = browser.openTab('b');
      start(first, a);
      start(second, b);
      await vi.advanceTimersByTimeAsync(10_000);
      // b asked last, so b keeps the save; a hands over, or steps aside without the lock.
      expect(badges()).toEqual(['elsewhere', 'saving']);
      expect(browser.lockHolder()).toBe('b');
    },
  );

  it('a blocked open: the new tab loads only once the old tab is free to finish its own load', async () => {
    // Tab a gets the lock, starts loading, hears b ask, and hands over. Then a long task
    // (or a starved GPU) blocks a's main thread for 8 s.
    const browser = createSimulatedBrowser({ latency: slowDisk });
    const a = browser.openTab('a');
    const b = browser.openTab('b');
    start(first, a);
    start(second, b);
    setTimeout(() => {
      a.busyFor(8000);
    }, 10);

    // b has the lock, but its open waits behind a's, which can't finish while a is
    // blocked. This is exactly what the e2e test saw: one tab elsewhere, one loading.
    await vi.advanceTimersByTimeAsync(5000);
    expect(browser.lockHolder()).toBe('b');
    expect(badges()).toEqual(['elsewhere', 'loading']);

    // Once a's main thread is free again, b finishes loading by itself.
    await vi.advanceTimersByTimeAsync(5000);
    expect(badges()).toEqual(['elsewhere', 'saving']);
    expect(second.progress.progress.get().status).toBe('ready');
  });

  it('a steal while the other tab is mid-load ends with the stealing tab saving', async () => {
    const browser = createSimulatedBrowser({ latency: slowDisk });
    const a = browser.openTab('a');
    const b = browser.openTab('b');
    start(first, a);
    // a gets the lock and starts loading, then blocks before it can hear b ask.
    setTimeout(() => {
      a.busyFor(8000);
    }, 4);
    setTimeout(() => {
      start(second, b);
    }, 5);

    // b's wait runs out, so it takes the lock. Its load still waits for a's IndexedDB work.
    await vi.advanceTimersByTimeAsync(5000);
    expect(browser.lockHolder()).toBe('b');
    expect(second.progress.progress.get().status).toBe('loading');

    await vi.advanceTimersByTimeAsync(5000);
    expect(badges()).toEqual(['elsewhere', 'saving']);
  });

  it('a steal while the other tab is mid-save keeps the change it was saving', async () => {
    const browser = createSimulatedBrowser({ latency: slowDisk });
    const a = browser.openTab('a');
    const b = browser.openTab('b');
    start(first, a);
    await vi.advanceTimersByTimeAsync(1000);
    expect(badges()).toEqual(['saving', 'loading']);

    // A finished step is being written when a long task blocks a, and b opens meanwhile.
    a.run(() => {
      first.progress.saveProgressNow((save) => ({ ...save, profile: { ...save.profile, xp: 40 } }));
      a.busyFor(8000);
    });
    start(second, b);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(badges()).toEqual(['elsewhere', 'saving']);
    // b's load waited for a's write, so the step a saved isn't lost.
    expect(second.progress.progress.get().save?.profile.xp).toBe(40);
    expect(browser.stored()?.profile.xp).toBe(40);
  });
});
