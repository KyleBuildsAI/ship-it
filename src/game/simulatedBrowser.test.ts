import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveLocks, TabChannel } from './progress';
import { createDefaultSave } from './save/schema';
import { createSimulatedBrowser, type Route, type SimulatedTab } from './simulatedBrowser';

/*
 * The simulated browser's record of late writes, driven by hand instead of by progress.ts, so
 * every message lands exactly where a test puts it. The random tests in progress.tabs.test.ts
 * trust `LateWrite.knew` to tell a bug (a tab wrote when it could know the save had gone)
 * from a race no tab can see (#224), so a mistake here would hide real bugs.
 */

const SAVE_LOCK = 'ship-it-save';
const save = createDefaultSave(new Date('2026-11-17T12:00:00.000Z'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

function locksOf(tab: SimulatedTab): SaveLocks {
  const { locks } = tab.coordination;
  if (locks === null) throw new Error('the simulated browser always has Web Locks');
  return locks;
}

function channelOf(tab: SimulatedTab): TabChannel {
  const { openChannel } = tab.coordination;
  if (openChannel === null) throw new Error('the simulated browser always has BroadcastChannel');
  return openChannel();
}

/** `tab` takes the save lock (by stealing it, if `steal`) and keeps it until it's taken away. */
function takeLock(tab: SimulatedTab, steal: boolean): void {
  locksOf(tab)
    .request(SAVE_LOCK, { steal }, () => new Promise<void>(() => undefined))
    .catch(() => undefined);
}

/** An ask for the save made now, as progress.ts posts it. A steal's wait is already over. */
function askNow(stole: boolean) {
  const at = Date.now();
  return { ask: 'ship-it-handover', at, nonce: 0, takesAt: stole ? at : at + 1500, stole };
}

/** Moves time on 10 ms: every message takes 1 ms unless a test slows it down. */
async function step(): Promise<void> {
  await vi.advanceTimersByTimeAsync(10);
}

/**
 * Tab c holds the save, and at 20 ms b says it stole the lock. That's old news: b's steal went
 * through before c took the lock from it, as in #223. At 30 ms c asks the browser, which
 * answers that the lock is still c's.
 */
async function ownerHearsOldNewsSteal(slow: (route: Route, index: number) => number) {
  const browser = createSimulatedBrowser({ latency: slow });
  const [b, c, d] = ['b', 'c', 'd'].map((name) => browser.openTab(name)) as [
    SimulatedTab,
    SimulatedTab,
    SimulatedTab,
  ];
  const channels = { b: channelOf(b), c: channelOf(c), d: channelOf(d) };
  takeLock(c, false);
  await step();
  channels.c.postMessage(askNow(false));
  await step();
  channels.b.postMessage(askNow(true));
  await step();
  void locksOf(c).isHolding(SAVE_LOCK);
  return { browser, c, d, channels };
}

describe('a late write', () => {
  it('is not counted as known because of a steal the browser has called old news', async () => {
    // c's write after opening IndexedDB (its 3rd message up that pipe) takes 1 s to arrive.
    const { browser, c, d } = await ownerHearsOldNewsSteal((route, index) =>
      route.tab === 'c' && route.pipe === 'idb' && route.direction === 'up' && index === 2
        ? 1000
        : 1,
    );
    // Once c has the answer, it starts a write. While that's on its way, d really steals.
    await step();
    void c.storage.write(save);
    await step();
    takeLock(d, true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(browser.lockHolder()).toBe('d');
    expect(browser.lateWrites()).toEqual([{ tab: 'c', knew: false, save }]);
  });

  it('is counted as known after a real steal heard while "still yours" was on its way', async () => {
    // The browser's answer to c (c's 2nd lock message down, after its grant) takes 500 ms,
    // and the news that d took the lock (the 3rd) 2 s.
    const { browser, c, d, channels } = await ownerHearsOldNewsSteal((route, index) => {
      if (route.tab !== 'c' || route.pipe !== 'locks' || route.direction !== 'down') return 1;
      if (index === 1) return 500;
      return index === 2 ? 2000 : 1;
    });
    // After the browser has answered, but before c hears it, d steals the lock and says so.
    await step();
    takeLock(d, true);
    await step();
    expect(browser.lockHolder()).toBe('d');
    channels.d.postMessage(askNow(true));
    // "Still yours" reaches c after d's ask, and c writes before it hears the lock is gone.
    await vi.advanceTimersByTimeAsync(500);
    void c.storage.write(save);
    await step();
    expect(browser.lateWrites()).toEqual([{ tab: 'c', knew: true, save }]);
  });
});
