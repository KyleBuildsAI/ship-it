import { useSyncExternalStore } from 'react';
import type { Store } from '../game/store';

/** Subscribes a component to a store and re-renders it when the snapshot changes. */
export function useStore<T extends object>(store: Store<T>): Readonly<T> {
  return useSyncExternalStore(store.subscribe, store.get);
}
