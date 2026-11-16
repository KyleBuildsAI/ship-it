import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DevStatusModule from './devStatus';
import type * as ProgressModule from './progress';
import {
  createSimulatedBrowser,
  type Route,
  type SimulatedBrowser,
  type SimulatedTab,
} from './simulatedBrowser';

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

  it('a tab that took the save by stealing ignores an ask it hears late', async () => {
    // b reaches the lock first, but its ask takes 3 s to reach a: by then a's wait ran
    // out, a took the lock, and b stepped aside. That ask is from before a took the save.
    const browser = createSimulatedBrowser({
      latency: latency((route) => {
        if (route.tab !== 'a') return undefined;
        if (route.pipe === 'locks' && route.direction === 'up') return 5;
        if (route.pipe === 'channel' && route.direction === 'down') return 3000;
        return undefined;
      }),
    });
    const a = browser.openTab('a');
    const b = browser.openTab('b');
    start(first, a);
    start(second, b);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(badges()).toEqual(['saving', 'elsewhere']);
    expect(browser.lockHolder()).toBe('a');
  });

  it('a tab ignores an ask from before its steal that arrives while the steal is on its way', async () => {
    // a's wait runs out at 1.5 s and it asks to steal. b's ask arrives at 1.7 s, and the
    // stolen lock reaches a at 2 s.
    const browser = createSimulatedBrowser({
      latency: latency((route) => {
        if (route.tab !== 'a') return undefined;
        if (route.pipe === 'locks') return route.direction === 'up' ? 5 : 500;
        if (route.pipe === 'channel' && route.direction === 'down') return 1700;
        return undefined;
      }),
    });
    const a = browser.openTab('a');
    const b = browser.openTab('b');
    start(first, a);
    start(second, b);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(badges()).toEqual(['saving', 'elsewhere']);
    expect(browser.lockHolder()).toBe('a');
  });
});

/** Mulberry32, as in judgment.ts: the same seed always gives the same numbers. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Plays one random opening of two tabs to the end. Returns what went wrong, or null when
 * exactly one tab saves (and holds the lock) and the other says the save is elsewhere.
 */
async function playRandomOpening(seed: number): Promise<string | null> {
  const random = seededRandom(seed);
  const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));
  // Mostly quick messages, and now and then one held up for seconds, as on a starved machine.
  const browser: SimulatedBrowser = createSimulatedBrowser({
    latency: () => (random() < 0.03 ? between(100, 3000) : between(0, 5)),
  });
  const tabs = [browser.openTab('a'), browser.openTab('b')] as const;
  const games = [first, second] as const;
  for (const game of games) game.devStatus.update({ save: 'none' });

  // Usually "the same moment", sometimes the second tab opens a few seconds later.
  const gap = random() < 0.8 ? between(0, 20) : between(0, 4000);
  start(first, tabs[0]);
  setTimeout(() => {
    start(second, tabs[1]);
  }, gap);
  // Long tasks at random moments: parsing the bundle, starting the GPU, a starved frame.
  for (const tab of tabs) {
    for (let task = between(0, 3); task > 0; task--) {
      const length = between(50, 5000);
      setTimeout(
        () => {
          tab.busyFor(length);
        },
        between(0, 4000),
      );
    }
  }

  await vi.advanceTimersByTimeAsync(60_000);
  vi.clearAllTimers();

  // Each tab as "status/badge": the save's state, and what the dev badge shows.
  const states = games.map((game) => `${game.progress.progress.get().status}/${badge(game)}`);
  const saver = tabs[states.indexOf('ready/saving')];
  const oneSaving = states.toSorted().join(' ') === 'elsewhere/elsewhere ready/saving';
  if (oneSaving && browser.lockHolder() === saver?.name) return null;
  return `gap ${String(gap)} ms: tabs ${states.join(' and ')}, lock held by ${String(browser.lockHolder())}`;
}

describe('two tabs opened together, any timing', () => {
  it('end with exactly one tab saving, holding the lock', async () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 400; seed++) {
      const problem = await playRandomOpening(seed);
      if (problem !== null) failures.push(`seed ${String(seed)}: ${problem}`);
    }
    expect(failures).toEqual([]);
  });
});
