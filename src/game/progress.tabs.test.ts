import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DevStatusModule from './devStatus';
import type * as ProgressModule from './progress';
import { createDefaultSave, type SaveData } from './save/schema';
import {
  createSimulatedBrowser,
  type Route,
  type SimulatedBrowser,
  type SimulatedTab,
} from './simulatedBrowser';

/*
 * Whole tabs of the game sharing one simulated browser (simulatedBrowser.ts), for #104:
 * "two tabs opened at the same moment" sometimes left one tab loading. progress.test.ts
 * plays the other tab by hand; here every tab runs the real progress.ts, so any ordering
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
let third: Game;
let fourth: Game;

beforeAll(async () => {
  first = await loadGame();
  second = await loadGame();
  third = await loadGame();
  fourth = await loadGame();
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
  for (const game of [first, second, third, fourth]) game.devStatus.update({ save: 'none' });
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

/** A change the player makes: here, one that sets the XP, so every change can be told apart. */
function setXp(xp: number): (save: SaveData) => SaveData {
  return (save) => ({ ...save, profile: { ...save.profile, xp } });
}

/** Moves time on 10 ms at a time until `done()`, for at most `limit` ms. */
async function advanceUntil(done: () => boolean, limit = 20_000): Promise<void> {
  for (let waited = 0; !done() && waited < limit; waited += 10) {
    await vi.advanceTimersByTimeAsync(10);
  }
}

/** What a tab logs when it drops a change on purpose (handOver in progress.ts). */
const DROPPED_WARNING =
  '[ship-it] another tab took the save first, so this tab dropped its last change';

/** Keeps the dropped-change warning out of the test output, and lets a test check for it. */
function quietWarnings() {
  return vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}

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

    // b has the lock, but its open waits behind a's, which can't finish while a is blocked.
    // That is the reading #104 reported (one tab elsewhere, one loading), so it's one way
    // the e2e test could have failed on a starved machine. It's a likely cause, not a proven
    // one: here the reading clears by itself, and the e2e test waited 20 s.
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

describe('a third tab', () => {
  it('that asks while another tab steals the save never takes it by stealing in turn', async () => {
    const browser = createSimulatedBrowser({
      latency: latency((route, index) => {
        if (route.tab !== 'b') return undefined;
        // b's steal (after its first lock request) takes 50 ms to reach the lock, so c's ask
        // reaches b in between. b's writes after its load take 20 ms to reach IndexedDB.
        if (route.pipe === 'locks' && route.direction === 'up' && index > 0) return 50;
        if (route.pipe === 'idb' && route.direction === 'up' && index >= 2) return 20;
        return undefined;
      }),
    });
    const players = [
      { tab: browser.openTab('f'), game: first },
      { tab: browser.openTab('b'), game: second },
      { tab: browser.openTab('c'), game: third },
    ] as const;
    const [f, b, c] = players;
    // f has the save, then freezes for a minute. b opens and, after its 1.5 s wait, steals.
    start(f.game, f.tab);
    await vi.advanceTimersByTimeAsync(100);
    f.tab.busyFor(60_000);
    start(b.game, b.tab);
    // c opens just after b's wait runs out, while b's steal is on its way.
    await vi.advanceTimersByTimeAsync(1505);
    start(c.game, c.tab);
    // The player finishes a step in whichever tab saves by now, just before c's wait ends.
    await vi.advanceTimersByTimeAsync(1400);
    for (const { tab, game } of players) {
      tab.run(() => {
        game.progress.updateSave((save) => ({ ...save, profile: { ...save.profile, xp: 77 } }));
      });
    }
    await vi.advanceTimersByTimeAsync(70_000);

    // Exactly one tab saves, holding the lock, and its copy is the one in IndexedDB: no tab
    // wrote after losing the save, so nothing it stored can be overwritten or go missing.
    const saving = players.filter(({ game }) => badge(game) === 'saving');
    expect(saving.map(({ tab }) => tab.name)).toEqual([browser.lockHolder()]);
    expect(saving[0]?.game.progress.progress.get().save).toEqual(browser.stored());
    expect(players.filter(({ game }) => badge(game) === 'elsewhere')).toHaveLength(2);
  });

  it('that took the lock from a steal its owner had not seen yet keeps the save (#223)', async () => {
    // The news that b's steal went through (the first lock message down to b) takes 3 s.
    const browser = createSimulatedBrowser({
      latency: latency((route, index) =>
        route.tab === 'b' && route.pipe === 'locks' && route.direction === 'down' && index === 0
          ? 3000
          : undefined,
      ),
    });
    const players = [
      { tab: browser.openTab('a'), game: first },
      { tab: browser.openTab('b'), game: second },
      { tab: browser.openTab('c'), game: third },
    ] as const;
    const [a, b, c] = players;
    // a has the save, then freezes for a minute, so it never answers an ask.
    start(a.game, a.tab);
    setTimeout(() => {
      a.tab.busyFor(60_000);
    }, 50);
    // b opens, and when its wait runs out at 1.6 s it steals the lock from a. The browser
    // grants that at once, but b won't hear so until 4.6 s.
    setTimeout(() => {
      start(b.game, b.tab);
    }, 100);
    // c opens meanwhile. Nobody answers its ask either, so at 3.2 s it steals the lock from
    // b's unseen grant, says it took the save, and loads it.
    setTimeout(() => {
      start(c.game, c.tab);
    }, 1700);
    await vi.advanceTimersByTimeAsync(4000);
    expect(browser.lockHolder()).toBe('c');
    expect(badge(c.game)).toBe('saving');

    // At 4.6 s b sees its old grant and says it took the save, after c did. Then it hears the
    // lock was taken from it. c must not hand the save to b, which no longer has the lock.
    await vi.advanceTimersByTimeAsync(1000);
    c.tab.run(() => {
      c.game.progress.saveProgressNow(setXp(40));
    });
    await vi.advanceTimersByTimeAsync(70_000);
    const saving = players.filter(({ game }) => badge(game) === 'saving');
    expect(saving.map(({ tab }) => tab.name)).toEqual(['c']);
    expect(browser.lockHolder()).toBe('c');
    expect(badge(a.game)).toBe('elsewhere');
    expect(badge(b.game)).toBe('elsewhere');
    expect(browser.stored()?.profile.xp).toBe(40);
  });
});

describe('a fourth tab', () => {
  it('still waiting when a steal turns out to be old news saves once it gets the lock (#223)', async () => {
    // As above: b's steal goes through at 1.6 s, b hears so only at 4.6 s, and c takes the lock
    // from that unseen grant at 3.2 s. d's first lock request takes 50 ms to reach the browser.
    const browser = createSimulatedBrowser({
      latency: latency((route, index) => {
        if (route.pipe !== 'locks' || index !== 0) return undefined;
        if (route.tab === 'b' && route.direction === 'down') return 3000;
        return route.tab === 'd' && route.direction === 'up' ? 50 : undefined;
      }),
    });
    const players = [
      { tab: browser.openTab('a'), game: first, opensAt: 0 },
      { tab: browser.openTab('b'), game: second, opensAt: 100 },
      { tab: browser.openTab('c'), game: third, opensAt: 1700 },
      { tab: browser.openTab('d'), game: fourth, opensAt: 4580 },
    ] as const;
    for (const { tab, game, opensAt } of players) {
      setTimeout(() => {
        start(game, tab);
      }, opensAt);
    }
    setTimeout(() => {
      players[0].tab.busyFor(60_000);
    }, 50);
    // d asks at 4.58 s and c hands over, freeing the lock. Before d's request reaches it, b
    // sees its old grant and says it took the save, after d asked. Then d gets the free lock.
    await vi.advanceTimersByTimeAsync(70_000);
    expect(browser.lockHolder()).toBe('d');
    expect(players.map(({ game }) => badge(game))).toEqual([
      'elsewhere',
      'elsewhere',
      'elsewhere',
      'saving',
    ]);
  });
});

describe('a tab that loses the save (#198)', () => {
  it('never writes a change it had not stored yet over the new owner’s progress', async () => {
    const warnings = quietWarnings();
    // b's ask takes 3 s to reach a, so a never answers and b takes the lock when its 1.5 s
    // wait runs out. The news that a lost the lock then takes 200 ms to reach a.
    const browser = createSimulatedBrowser({
      latency: latency((route) => {
        if (route.tab !== 'a' || route.direction !== 'down') return undefined;
        if (route.pipe === 'channel') return 3000;
        return route.pipe === 'locks' ? 200 : undefined;
      }),
    });
    const a = browser.openTab('a');
    const b = browser.openTab('b');
    start(first, a);
    await vi.advanceTimersByTimeAsync(1000);
    expect(badges()).toEqual(['saving', 'loading']);
    start(second, b);

    // Just before b's wait runs out, the player changes a setting in a. It waits out the
    // autosave delay, so it isn't stored yet when b takes the save.
    await vi.advanceTimersByTimeAsync(1400);
    a.run(() => {
      first.progress.updateSave(setXp(5));
    });
    // b has loaded the save before a hears it lost it, and the player finishes a step there.
    await vi.advanceTimersByTimeAsync(150);
    expect(browser.lockHolder()).toBe('b');
    expect(second.progress.progress.get().status).toBe('ready');
    b.run(() => {
      second.progress.saveProgressNow(setXp(40));
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(badges()).toEqual(['elsewhere', 'saving']);
    expect(browser.stored()?.profile.xp).toBe(40);
    // a's change was dropped, and a says so.
    expect(first.progress.progress.get().problem).toBe(first.progress.CHANGE_DROPPED);
    expect(warnings).toHaveBeenCalledWith(DROPPED_WARNING);
  });

  it('that hears an ask only after the asker took the save stores nothing more', async () => {
    const warnings = quietWarnings();
    // b's ask takes 2 s to reach a, so b's wait runs out first and it takes the lock. The
    // news that a lost the lock is slower still: a hears the late ask first.
    const browser = createSimulatedBrowser({
      latency: latency((route) => {
        if (route.tab !== 'a' || route.direction !== 'down') return undefined;
        if (route.pipe === 'channel') return 2000;
        return route.pipe === 'locks' ? 1000 : undefined;
      }),
    });
    const a = browser.openTab('a');
    const b = browser.openTab('b');
    start(first, a);
    await vi.advanceTimersByTimeAsync(2000);
    expect(badges()).toEqual(['saving', 'loading']);
    start(second, b);

    // b takes the save at 3.5 s, and the player finishes a step there.
    await vi.advanceTimersByTimeAsync(1600);
    expect(browser.lockHolder()).toBe('b');
    b.run(() => {
      second.progress.saveProgressNow(setXp(40));
    });
    // Just before b's ask reaches a, the player changes a setting in a. It's still waiting
    // out the autosave delay when the ask arrives.
    await vi.advanceTimersByTimeAsync(300);
    a.run(() => {
      first.progress.updateSave(setXp(5));
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(badges()).toEqual(['elsewhere', 'saving']);
    expect(browser.stored()?.profile.xp).toBe(40);
    expect(first.progress.progress.get().problem).toBe(first.progress.CHANGE_DROPPED);
    expect(warnings).toHaveBeenCalledWith(DROPPED_WARNING);
  });

  it('that heard the ask in time starts no write after the asker took the save', async () => {
    const warnings = quietWarnings();
    // b asks at 1 s and takes the save at 2.5 s if a hasn't let go. Its ask reaches a at
    // 2.4 s, in time, but the news that b took the lock (the 2nd message down, after the
    // grant) takes 3 s to reach a. On a's IndexedDB pipe, the result of a's finished step
    // (the 4th result, after opening, reading and storing the new game) comes back slowly,
    // and the write after it (the 9th message up) is slow to arrive.
    const browser = createSimulatedBrowser({
      latency: latency((route, index) => {
        if (route.tab !== 'a' || (route.pipe !== 'idb' && route.direction === 'up')) {
          return undefined;
        }
        if (route.pipe === 'channel') return 1400;
        if (route.pipe === 'locks') return index === 1 ? 3000 : undefined;
        if (route.direction === 'down') return index === 3 ? 300 : undefined;
        return index === 8 ? 500 : undefined;
      }),
    });
    const a = browser.openTab('a');
    const b = browser.openTab('b');
    start(first, a);
    await vi.advanceTimersByTimeAsync(1000);
    start(second, b);

    // The player finishes a step in a, then changes a setting. a hears b's ask at 2.4 s and
    // hands over, but its write of the setting waits behind the step's until 2.6 s.
    await vi.advanceTimersByTimeAsync(1300);
    a.run(() => {
      first.progress.saveProgressNow(setXp(5));
    });
    await vi.advanceTimersByTimeAsync(50);
    a.run(() => {
      first.progress.updateSave(setXp(6));
    });
    await vi.advanceTimersByTimeAsync(400);
    expect(second.progress.progress.get().status).toBe('ready');
    b.run(() => {
      second.progress.saveProgressNow(setXp(40));
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(badges()).toEqual(['elsewhere', 'saving']);
    expect(browser.stored()?.profile.xp).toBe(40);
    expect(browser.lateWrites()).toEqual([]);
    expect(first.progress.progress.get().problem).toBe(first.progress.CHANGE_DROPPED);
    expect(warnings).toHaveBeenCalledWith(DROPPED_WARNING);
  });

  it('that hears the stealing tab ask again before the news of the steal stores nothing more', async () => {
    const warnings = quietWarnings();
    // b asks first, but its lock request takes 1 s to arrive, so a, opened 10 ms later, gets
    // the free lock. a wasn't listening yet when b asked, and a's ask takes 3 s to reach b,
    // so b takes the lock when its wait runs out, and asks again. That ask is the first a
    // hears from b, and the news that b took the lock takes 1 s more to reach a. a's writes
    // after loading (from the 5th message up its IndexedDB pipe) take 500 ms to arrive.
    const browser = createSimulatedBrowser({
      latency: latency((route, index) => {
        const { tab, pipe, direction } = route;
        if (tab === 'b' && pipe === 'locks' && direction === 'up') return index === 0 ? 1000 : 1;
        if (tab === 'b' && pipe === 'channel' && direction === 'down') return 3000;
        if (tab === 'a' && pipe === 'locks' && direction === 'down') return index > 0 ? 1000 : 1;
        if (tab === 'a' && pipe === 'idb' && direction === 'up') return index >= 4 ? 500 : 1;
        return undefined;
      }),
      stored: { save: createDefaultSave(NOW), fromOlderVersion: false },
    });
    const a = browser.openTab('a');
    const b = browser.openTab('b');
    start(second, b);
    setTimeout(() => {
      start(first, a);
    }, 10);

    // The player changes a setting in a just before b takes the lock at 1.5 s.
    await vi.advanceTimersByTimeAsync(1400);
    expect(badges()).toEqual(['saving', 'loading']);
    a.run(() => {
      first.progress.updateSave(setXp(5));
    });
    // b already holds the lock when it asks again, so that ask's deadline is now: a must
    // write nothing more, though it hasn't heard of the steal. The player plays on in b.
    await vi.advanceTimersByTimeAsync(200);
    expect(browser.lockHolder()).toBe('b');
    expect(second.progress.progress.get().status).toBe('ready');
    b.run(() => {
      second.progress.saveProgressNow(setXp(40));
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(badges()).toEqual(['elsewhere', 'saving']);
    expect(browser.stored()?.profile.xp).toBe(40);
    expect(browser.lateWrites()).toEqual([]);
    expect(first.progress.progress.get().problem).toBe(first.progress.CHANGE_DROPPED);
    expect(warnings).toHaveBeenCalledWith(DROPPED_WARNING);
  });

  it.each([
    [
      'a finished step',
      (xp: number) => {
        first.progress.saveProgressNow(setXp(xp));
      },
    ],
    [
      'a settings change',
      (xp: number) => {
        first.progress.updateSave(setXp(xp));
      },
    ],
  ])('reports %s it drops as a dropped change, not as an error', async (_case, change) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnings = quietWarnings();
    // b's ask never reaches a in time, so b takes the save at 2.5 s. The result of a's
    // finished step (a's 4th IndexedDB result) takes 1 s to come back, so the next write
    // waits behind it until after a hears it lost the lock.
    const browser = createSimulatedBrowser({
      latency: latency((route, index) => {
        if (route.tab !== 'a' || route.direction !== 'down') return undefined;
        if (route.pipe === 'channel') return 5000;
        return route.pipe === 'idb' && index === 3 ? 1000 : undefined;
      }),
    });
    const a = browser.openTab('a');
    const b = browser.openTab('b');
    start(first, a);
    await vi.advanceTimersByTimeAsync(1000);
    start(second, b);
    await vi.advanceTimersByTimeAsync(900);
    a.run(() => {
      first.progress.saveProgressNow(setXp(5));
    });
    // A settings change waits out the autosave delay, so its write starts at 2.45 s.
    await vi.advanceTimersByTimeAsync(50);
    a.run(() => {
      change(6);
    });

    await vi.advanceTimersByTimeAsync(10_000);
    expect(badges()).toEqual(['elsewhere', 'saving']);
    expect(browser.stored()?.profile.xp).toBe(5);
    expect(first.progress.progress.get().problem).toBe(first.progress.CHANGE_DROPPED);
    // The notice tells the player, and a developer sees a warning. A console error would say
    // something broke.
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).toHaveBeenCalledWith(DROPPED_WARNING);
  });

  it.each([
    ['a first launch', undefined],
    [
      'a save from an older version',
      { save: setXp(20)(createDefaultSave(NOW)), fromOlderVersion: true },
    ],
  ])(
    'that hands over while loading never stores the save it loaded over the new owner’s (%s)',
    async (_case, stored) => {
      // a's read takes 100 ms to come back, so b's ask arrives first and a hands over before
      // it has the save in hand. Anything a then writes takes 3 s to reach IndexedDB: index
      // 4 on its pipe, after opening and reading sent two messages up each (the request,
      // then "handled the result").
      const browser = createSimulatedBrowser({
        latency: latency((route, index) => {
          if (route.tab !== 'a' || route.pipe !== 'idb') return undefined;
          if (route.direction === 'down') return index === 1 ? 100 : undefined;
          return index >= 4 ? 3000 : undefined;
        }),
        stored,
      });
      const a = browser.openTab('a');
      const b = browser.openTab('b');
      start(first, a);
      setTimeout(() => {
        start(second, b);
      }, 10);

      // The player finishes a step in b as soon as b has the save.
      await vi.advanceTimersByTimeAsync(1000);
      await advanceUntil(() => second.progress.progress.get().status === 'ready');
      b.run(() => {
        second.progress.saveProgressNow(setXp(40));
      });

      await vi.advanceTimersByTimeAsync(10_000);
      expect(badges()).toEqual(['elsewhere', 'saving']);
      expect(browser.stored()?.profile.xp).toBe(40);
      // Not even one that b wrote over later: a stored nothing once b had the lock.
      expect(browser.lateWrites()).toEqual([]);
    },
  );
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
 * Plays one random opening of two or three tabs to the end. Returns what went wrong, or null
 * when exactly one tab saves (and holds the lock) and every other says the save is elsewhere.
 */
async function playRandomOpening(seed: number, tabCount: 2 | 3): Promise<string | null> {
  const random = seededRandom(seed);
  const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));
  // Mostly quick messages, and now and then one held up for seconds, as on a starved machine.
  const browser: SimulatedBrowser = createSimulatedBrowser({
    latency: () => (random() < 0.03 ? between(100, 3000) : between(0, 5)),
  });
  const games = [first, second, third].slice(0, tabCount);
  const tabs = games.map((_, index) => browser.openTab(['a', 'b', 'c'][index] ?? 'extra'));
  for (const game of games) game.devStatus.update({ save: 'none' });

  // Usually "the same moment", sometimes a later tab opens a few seconds after the first.
  const gaps = games.map((_, index) =>
    index === 0 ? 0 : random() < 0.8 ? between(0, 20) : between(0, 4000),
  );
  for (const [index, game] of games.entries()) {
    const tab = tabs[index];
    if (tab === undefined) continue;
    if (index === 0) start(game, tab);
    else
      setTimeout(() => {
        start(game, tab);
      }, gaps[index]);
  }
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
  const saving = states.filter((state) => state === 'ready/saving');
  const elsewhere = states.filter((state) => state === 'elsewhere/elsewhere');
  const saver = tabs[states.indexOf('ready/saving')];
  if (saving.length === 1 && elsewhere.length === tabCount - 1) {
    if (browser.lockHolder() === saver?.name) return null;
  }
  return `gaps ${gaps.join('/')} ms: tabs ${states.join(' and ')}, lock held by ${String(browser.lockHolder())}`;
}

/**
 * Room for a loop of hundreds of seeded sessions. Alone, each loop takes well under a second,
 * but a busy machine can stretch it past Vitest's 5 s default. A loop stopped there keeps
 * running in the background on the same tab modules, and breaks whichever test runs next.
 */
const SEEDED_LOOP_TIMEOUT_MS = 60_000;

describe('tabs opened together, any timing', () => {
  it.each([2, 3] as const)(
    'end with exactly one of %i tabs saving, holding the lock',
    async (tabCount) => {
      const failures: string[] = [];
      for (let seed = 1; seed <= 400; seed++) {
        const problem = await playRandomOpening(seed, tabCount);
        if (problem !== null) failures.push(`seed ${String(seed)}: ${problem}`);
      }
      expect(failures).toEqual([]);
    },
    SEEDED_LOOP_TIMEOUT_MS,
  );
});

/** What IndexedDB holds when a random session starts: a first launch, an old save or a current one. */
function randomStartingSave(
  random: () => number,
): { save: SaveData; fromOlderVersion: boolean } | undefined {
  const pick = random();
  if (pick < 1 / 3) return undefined;
  return { save: setXp(1)(createDefaultSave(NOW)), fromOlderVersion: pick < 2 / 3 };
}

/**
 * How a random session ended:
 * - 'stored': IndexedDB holds exactly the copy of the one tab that saves.
 * - 'unseen race': it doesn't, because what it holds came from a write that landed late,
 *   sent before its tab could know the lock had gone (LateWrite in simulatedBrowser.ts).
 *   progress.ts explains why no tab can stop that one (#224).
 * - Anything else says what went wrong.
 */
type SessionEnd = 'stored' | 'unseen race' | { readonly problem: string };

/**
 * Plays one random session of two or three tabs: openings, long tasks, and the player changing
 * the save in any tab at random moments, so changes land before, during and after handovers.
 * Settings changes wait out the autosave delay; finished steps are stored at once.
 */
async function playRandomSession(seed: number, tabCount: 2 | 3): Promise<SessionEnd> {
  const random = seededRandom(seed);
  const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));
  const browser: SimulatedBrowser = createSimulatedBrowser({
    latency: () => (random() < 0.03 ? between(100, 3000) : between(0, 5)),
    stored: randomStartingSave(random),
  });
  const games = [first, second, third].slice(0, tabCount);
  const tabs = games.map((_, index) => browser.openTab(['a', 'b', 'c'][index] ?? 'extra'));
  for (const game of games) game.devStatus.update({ save: 'none' });

  // Later tabs open together with the first, or while the player is already playing in it.
  for (const [index, game] of games.entries()) {
    const tab = tabs[index];
    if (tab === undefined) continue;
    const opensAt = index === 0 ? 0 : between(0, 8000);
    setTimeout(() => {
      start(game, tab);
    }, opensAt);
    for (let task = between(0, 3); task > 0; task--) {
      const length = between(50, 5000);
      setTimeout(
        () => {
          tab.busyFor(length);
        },
        between(0, 10_000),
      );
    }
    // Every change sets a different XP, so the save shows whose change was stored last. A
    // tab's changes come after it opens: before that, its module still holds the last session.
    for (let change = between(2, 6); change > 0; change--) {
      const xp = 100 * (index + 1) + change;
      const finishedStep = random() < 0.5;
      setTimeout(
        () => {
          tab.run(() => {
            if (finishedStep) game.progress.saveProgressNow(setXp(xp));
            else game.progress.updateSave(setXp(xp));
          });
        },
        opensAt + between(0, 12_000),
      );
    }
  }

  await vi.advanceTimersByTimeAsync(60_000);
  vi.clearAllTimers();

  // Never allowed: a write sent once its tab had let go of the lock, or knew it was going.
  const late = browser.lateWrites();
  const knowing = late.find((write) => write.knew);
  if (knowing !== undefined) return { problem: `${knowing.tab} wrote after it lost the save` };

  const states = games.map((game) => `${game.progress.progress.get().status}/${badge(game)}`);
  const ownerIndex = states.indexOf('ready/saving');
  const ownerName = tabs[ownerIndex]?.name;
  const oneOwner =
    states.filter((state) => state === 'ready/saving').length === 1 &&
    states.filter((state) => state === 'elsewhere/elsewhere').length === tabCount - 1 &&
    browser.lockHolder() === ownerName;
  if (!oneOwner) {
    const holder = String(browser.lockHolder());
    return { problem: `not one tab saving: tabs ${states.join(' and ')}, lock held by ${holder}` };
  }

  // Compared whole: the owner's copy must be exactly what IndexedDB holds.
  const owner = games[ownerIndex]?.progress.progress.get().save;
  if (JSON.stringify(owner) === JSON.stringify(browser.stored())) return 'stored';
  // Only the late write itself excuses this, not one earlier that the owner wrote over.
  if (late.some((write) => write.save === browser.stored())) return 'unseen race';
  const ownerXp = String(owner?.profile.xp);
  const storedXp = String(browser.stored()?.profile.xp);
  return { problem: `${ownerName} has XP ${ownerXp}, but IndexedDB holds XP ${storedXp}` };
}

const SESSIONS = 1000;

describe('the player changing the save while tabs hand it over, any timing (#198)', () => {
  it.each([2, 3] as const)(
    'ends with IndexedDB holding exactly the copy of the one of %i tabs that saves',
    async (tabCount) => {
      // Dozens of sessions drop a change on purpose, each with a warning that would flood the
      // test output.
      quietWarnings();
      const problems: string[] = [];
      let unseenRaces = 0;
      for (let seed = 1; seed <= SESSIONS; seed++) {
        const end = await playRandomSession(seed, tabCount);
        if (end === 'unseen race') unseenRaces += 1;
        else if (typeof end === 'object') problems.push(`seed ${String(seed)}: ${end.problem}`);
      }
      expect(problems).toEqual([]);
      // Rare: about 1 session in 1,000 here, all on a starved machine. Far more would mean
      // a tab writes when it could know better, and these sessions are hiding it.
      expect(unseenRaces).toBeLessThanOrEqual(SESSIONS / 100);
    },
    SEEDED_LOOP_TIMEOUT_MS,
  );
});
