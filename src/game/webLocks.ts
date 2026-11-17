import type { SaveLocks } from './progress';

/** The parts of the browser's `navigator.locks` that the save uses. */
export interface WebLocks {
  request: SaveLocks['request'];
  query: () => Promise<{ held?: readonly { name?: string; clientId?: string }[] }>;
}

/**
 * The save's lock calls, made with the browser's Web Locks.
 *
 * `isHolding` asks the browser which tab holds a lock. The browser names each tab by an id
 * (`clientId`) that a page can't read for itself. So the tab briefly holds a second lock that
 * no other tab uses, and finds its own id under that lock's name in the same answer.
 */
export function webSaveLocks(locks: WebLocks): SaveLocks {
  return {
    request: (name, options, callback) => locks.request(name, options, callback),
    isHolding: async (name) => {
      const marker = `${name}-check-${Math.random().toString(36).slice(2)}`;
      let holding = false;
      await locks.request(marker, {}, async () => {
        const { held = [] } = await locks.query();
        const self = held.find((lock) => lock.name === marker)?.clientId;
        holding =
          self !== undefined && held.some((lock) => lock.name === name && lock.clientId === self);
      });
      return holding;
    },
  };
}
