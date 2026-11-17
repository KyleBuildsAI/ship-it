import { describe, expect, it, vi } from 'vitest';
import { webSaveLocks, type WebLocks } from './webLocks';

const SAVE_LOCK = 'ship-it-save';

/**
 * A browser's `navigator.locks` as one tab sees it. The browser lists every held lock with the
 * id of the tab holding it; this tab's id is 'this-tab'. `saveHolder` is the tab holding the
 * save lock, or null when nobody does.
 */
function browserLocks(saveHolder: 'this-tab' | 'other-tab' | null) {
  const heldHere = new Set<string>();
  const locks: WebLocks = {
    request: async (name, _options, callback) => {
      heldHere.add(name);
      try {
        await callback();
      } finally {
        heldHere.delete(name);
      }
    },
    query: () =>
      Promise.resolve({
        held: [
          ...[...heldHere].map((name) => ({ name, clientId: 'this-tab' })),
          ...(saveHolder === null ? [] : [{ name: SAVE_LOCK, clientId: saveHolder }]),
        ],
      }),
  };
  return { locks, heldHere };
}

describe('webSaveLocks', () => {
  it('passes lock requests straight to the browser', async () => {
    const { locks } = browserLocks(null);
    const request = vi.spyOn(locks, 'request');
    const callback = () => Promise.resolve();
    const options = { steal: true };
    await webSaveLocks(locks).request(SAVE_LOCK, options, callback);
    expect(request).toHaveBeenCalledWith(SAVE_LOCK, options, callback);
  });

  it.each([
    ['this tab', 'this-tab', true],
    ['another tab', 'other-tab', false],
    ['nobody', null, false],
  ] as const)(
    'says whether this tab holds the lock when %s does',
    async (_case, saveHolder, holding) => {
      const { locks } = browserLocks(saveHolder);
      expect(await webSaveLocks(locks).isHolding(SAVE_LOCK)).toBe(holding);
    },
  );

  it('lets go of the lock it used to find itself in the answer', async () => {
    const { locks, heldHere } = browserLocks('this-tab');
    await webSaveLocks(locks).isHolding(SAVE_LOCK);
    expect(heldHere.size).toBe(0);
  });

  it('says no when the browser leaves out which tab holds what', async () => {
    const { locks, heldHere } = browserLocks('this-tab');
    // Two locks with no tab named aren't two locks of the same tab.
    locks.query = () =>
      Promise.resolve({ held: [...heldHere, SAVE_LOCK].map((name) => ({ name })) });
    expect(await webSaveLocks(locks).isHolding(SAVE_LOCK)).toBe(false);
  });
});
