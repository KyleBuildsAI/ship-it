import { describe, expect, it, vi } from 'vitest';
import { createStore } from './store';

describe('createStore', () => {
  it('returns the initial snapshot', () => {
    const store = createStore({ count: 0 });
    expect(store.get()).toEqual({ count: 0 });
  });

  it('replaces the snapshot and notifies listeners on a real change', () => {
    const store = createStore({ count: 0, name: 'sage' });
    const before = store.get();
    const listener = vi.fn();
    store.subscribe(listener);

    store.update({ count: 1 });

    expect(store.get()).toEqual({ count: 1, name: 'sage' });
    expect(store.get()).not.toBe(before);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps the same snapshot and stays quiet when the patch changes nothing', () => {
    const store = createStore({ count: 0 });
    const before = store.get();
    const listener = vi.fn();
    store.subscribe(listener);

    store.update({ count: 0 });
    store.update({});

    expect(store.get()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const store = createStore({ count: 0 });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.update({ count: 1 });

    expect(listener).not.toHaveBeenCalled();
  });
});
