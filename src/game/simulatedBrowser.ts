import type { ProgressStorage, SaveLocks, TabChannel, TabCoordination } from './progress';
import { createDefaultSave, type SaveData } from './save/schema';

/**
 * A pretend browser for testing how tabs share the save (progress.ts). A real browser can't
 * be paused at the exact moment a race happens, so this one runs on Vitest's fake timers and
 * lets a test choose how long every message takes and when a tab is too busy to answer.
 *
 * It copies the parts of Chrome that matter for the handover:
 * - Each tab has one main thread. While it's busy (a long task, or waiting on a starved
 *   GPU), nothing else in that tab runs: messages, timers and IndexedDB results queue up.
 * - Tabs talk to the browser over pipes that keep messages in order, each way.
 * - Web Locks: one holder, a queue, `signal` to stop waiting, `steal` to take the lock.
 * - BroadcastChannel: a message reaches the channels connected when it gets to the browser.
 * - IndexedDB: one operation at a time, and each only finishes once the tab that made it
 *   has handled the result. So a busy tab holds up every other tab's reads and writes.
 *   That is stricter than Chrome on purpose. Chrome holds other tabs up like this only for
 *   the first open, which creates the database, and for transactions that write the same
 *   table; reads run side by side. Here a busy tab holds the others up more often, so a
 *   test finds out whether the handover still ends with one tab saving when it does.
 */

export type Pipe = 'locks' | 'channel' | 'idb';

/** Which way a message travels: up from a tab to the browser, or down to a tab. */
export interface Route {
  readonly tab: string;
  readonly pipe: Pipe;
  readonly direction: 'up' | 'down';
}

export interface SimulatedBrowserOptions {
  /**
   * How long a message takes, in ms. `index` counts earlier messages on the same route, so
   * a test can make, say, a tab's first channel message (connecting) quick and its ask slow.
   * Default: 1 ms for everything.
   */
  latency?: (route: Route, index: number) => number;
}

export interface SimulatedTab {
  readonly name: string;
  readonly coordination: TabCoordination;
  readonly storage: ProgressStorage;
  /** Runs `task` on this tab's main thread: now, or once the tasks before it have run. */
  run: (task: () => void) => void;
  /** Blocks this tab's main thread for `ms` from now, as a long task would. */
  busyFor: (ms: number) => void;
}

export interface SimulatedBrowser {
  openTab: (name: string) => SimulatedTab;
  /** The tab whose request holds the save lock right now, or null when nobody does. */
  lockHolder: () => string | null;
  /** What IndexedDB holds. */
  stored: () => SaveData | undefined;
}

type Task = () => void;

/** A tab's single main thread: tasks run one at a time, in the order they arrived. */
function createMainThread() {
  let busyUntil = 0;
  const tasks: Task[] = [];
  let wake: ReturnType<typeof setTimeout> | null = null;

  function schedule(delay: number): void {
    wake ??= setTimeout(next, delay);
  }
  // Each task gets its own timer, so its promise callbacks run before the next task starts,
  // just as microtasks do between tasks in a real event loop.
  function next(): void {
    wake = null;
    const wait = busyUntil - Date.now();
    if (wait > 0) {
      schedule(wait);
      return;
    }
    tasks.shift()?.();
    if (tasks.length > 0) schedule(0);
  }

  return {
    run: (task: Task): void => {
      tasks.push(task);
      schedule(0);
    },
    busyFor: (ms: number): void => {
      busyUntil = Math.max(busyUntil, Date.now() + ms);
    },
  };
}

interface TabInternals {
  readonly name: string;
  readonly run: (task: Task) => void;
  /** Sends a task to the browser, which runs it on arrival: the browser is never busy. */
  readonly up: Record<Pipe, (task: Task) => void>;
  /** Sends a task to this tab, which runs it on its main thread. */
  readonly down: Record<Pipe, (task: Task) => void>;
}

interface LockRequest {
  readonly tab: TabInternals;
  readonly steal: boolean;
  readonly callback: () => Promise<void>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  /** The tab saw the grant and called the callback. */
  granted: boolean;
  /** The promise `request()` returned has resolved or rejected. */
  settled: boolean;
  /** The tab stopped waiting (its signal aborted) before it saw a grant. */
  cancelled: boolean;
}

function settle(request: LockRequest, finish: () => void): void {
  if (request.settled) return;
  request.settled = true;
  finish();
}

interface ChannelEnd {
  readonly tab: TabInternals;
  readonly listeners: ((event: { data: unknown }) => void)[];
  open: boolean;
}

interface IdbOperation {
  readonly tab: TabInternals;
  /** Does the work in the browser, and returns what hands the result to the tab. */
  readonly perform: () => Task;
}

export function createSimulatedBrowser(options: SimulatedBrowserOptions = {}): SimulatedBrowser {
  const latency = options.latency ?? (() => 1);

  function createPipe(route: Route, deliver: (task: Task) => void): (task: Task) => void {
    let sent = 0;
    let lastArrival = 0;
    return (task) => {
      // A pipe keeps order: a message never overtakes one sent before it.
      const arrival = Math.max(Date.now() + latency(route, sent), lastArrival);
      sent += 1;
      lastArrival = arrival;
      setTimeout(() => {
        deliver(task);
      }, arrival - Date.now());
    };
  }

  // --- Web Locks: one lock, the save's ---------------------------------------------------
  let holder: LockRequest | null = null;
  const waiting: LockRequest[] = [];

  function grant(request: LockRequest): void {
    holder = request;
    request.tab.down.locks(() => {
      // It stopped waiting first; the browser frees the lock when that news arrives.
      if (request.cancelled) return;
      request.granted = true;
      request.callback().then(
        (value) => {
          finish(request, () => {
            request.resolve(value);
          });
        },
        (error: unknown) => {
          finish(request, () => {
            request.reject(error);
          });
        },
      );
    });
  }

  function finish(request: LockRequest, done: () => void): void {
    settle(request, done);
    request.tab.up.locks(() => {
      release(request);
    });
  }

  function release(request: LockRequest): void {
    if (holder !== request) return;
    holder = null;
    const next = waiting.shift();
    if (next !== undefined) grant(next);
  }

  function arrive(request: LockRequest): void {
    if (request.steal) {
      const robbed = holder;
      if (robbed !== null) {
        robbed.tab.down.locks(() => {
          settle(robbed, () => {
            robbed.reject(new DOMException('Lock broken by another request', 'AbortError'));
          });
        });
      }
      grant(request);
      return;
    }
    if (holder === null) grant(request);
    else waiting.push(request);
  }

  function cancel(request: LockRequest): void {
    const index = waiting.indexOf(request);
    if (index >= 0) waiting.splice(index, 1);
    release(request);
  }

  function locksFor(tab: TabInternals): SaveLocks {
    return {
      request: (_name, { steal = false, signal }, callback) =>
        new Promise((resolve, reject) => {
          const request: LockRequest = {
            tab,
            steal,
            callback,
            resolve,
            reject,
            granted: false,
            settled: false,
            cancelled: false,
          };
          signal?.addEventListener(
            'abort',
            () => {
              // The timeout is a timer in the tab, so it waits for the tab's main thread too.
              tab.run(() => {
                if (request.granted || request.settled) return;
                request.cancelled = true;
                settle(request, () => {
                  request.reject(signal.reason);
                });
                tab.up.locks(() => {
                  cancel(request);
                });
              });
            },
            { once: true },
          );
          tab.up.locks(() => {
            arrive(request);
          });
        }),
    };
  }

  // --- BroadcastChannel ----------------------------------------------------------------
  const channels = new Set<ChannelEnd>();

  function broadcast(from: ChannelEnd, data: unknown): void {
    for (const end of channels) {
      if (end === from) continue;
      end.tab.down.channel(() => {
        if (!end.open) return;
        for (const listener of [...end.listeners]) listener({ data });
      });
    }
  }

  function openChannelFor(tab: TabInternals): () => TabChannel {
    return () => {
      const end: ChannelEnd = { tab, listeners: [], open: true };
      tab.up.channel(() => {
        if (end.open) channels.add(end);
      });
      return {
        postMessage: (message) => {
          const data = structuredClone(message);
          tab.up.channel(() => {
            broadcast(end, data);
          });
        },
        addEventListener: (_type, listener) => {
          end.listeners.push(listener);
        },
        close: () => {
          end.open = false;
          tab.up.channel(() => {
            channels.delete(end);
          });
        },
      };
    };
  }

  // --- IndexedDB -------------------------------------------------------------------------
  let stored: SaveData | undefined;
  const operations: IdbOperation[] = [];
  let running: IdbOperation | null = null;

  function startNextOperation(): void {
    if (running !== null) return;
    const operation = operations.shift();
    if (operation === undefined) return;
    running = operation;
    const handResult = operation.perform();
    operation.tab.down.idb(() => {
      handResult();
      // It finishes once the tab has handled the result. Until then, every other tab's
      // operation waits behind it, however long this tab's main thread is busy.
      operation.tab.up.idb(() => {
        running = null;
        startNextOperation();
      });
    });
  }

  function idb<T>(tab: TabInternals, work: () => T): Promise<T> {
    return new Promise((resolve) => {
      tab.up.idb(() => {
        operations.push({
          tab,
          perform: () => {
            const result = work();
            return () => {
              resolve(result);
            };
          },
        });
        startNextOperation();
      });
    });
  }

  function storageFor(tab: TabInternals): ProgressStorage {
    // The first use opens the database (creating it, on a first launch), as Dexie does.
    let opening: Promise<void> | null = null;
    const open = () => (opening ??= idb(tab, () => undefined));
    return {
      // Like loadSave: read the save, or store a new game when there isn't one.
      load: async (now) => {
        await open();
        const found = await idb(tab, () => stored);
        if (found !== undefined) return found;
        const fresh = createDefaultSave(now);
        await idb(tab, () => {
          stored = fresh;
        });
        return fresh;
      },
      write: async (save) => {
        await open();
        await idb(tab, () => {
          stored = save;
        });
      },
    };
  }

  return {
    openTab(name) {
      const thread = createMainThread();
      const pipes = (direction: Route['direction'], deliver: (task: Task) => void) => ({
        locks: createPipe({ tab: name, pipe: 'locks', direction }, deliver),
        channel: createPipe({ tab: name, pipe: 'channel', direction }, deliver),
        idb: createPipe({ tab: name, pipe: 'idb', direction }, deliver),
      });
      const tab: TabInternals = {
        name,
        run: thread.run,
        up: pipes('up', (task) => {
          task();
        }),
        down: pipes('down', thread.run),
      };
      return {
        name,
        coordination: { locks: locksFor(tab), openChannel: openChannelFor(tab) },
        storage: storageFor(tab),
        run: thread.run,
        busyFor: thread.busyFor,
      };
    },
    lockHolder: () => holder?.tab.name ?? null,
    stored: () => stored,
  };
}
