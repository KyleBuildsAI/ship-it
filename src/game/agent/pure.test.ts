import { expect, it, vi } from 'vitest';
import * as store from '../store';

// game/agent/ is pure (docs/act1-directed.md section 5.6): graders and tests use it
// anywhere, so importing it must not build the app's live stores as a side effect, like
// the one that holds the player's sandbox.
it("builds none of the app's stores when imported", async () => {
  const createStore = vi.fn(store.createStore);
  vi.doMock('../store', () => ({ ...store, createStore }));
  await import('./replay');
  await import('./transcript');
  expect(createStore).not.toHaveBeenCalled();
});
