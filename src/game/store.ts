export type Listener = () => void;

export interface Store<T extends object> {
  get: () => Readonly<T>;
  update: (patch: Partial<T>) => void;
  subscribe: (listener: Listener) => () => void;
}

/**
 * A tiny observable store: one immutable snapshot plus change listeners.
 *
 * React reads stores through useSyncExternalStore, which re-renders only when
 * get() returns a different object. So update() replaces the snapshot instead
 * of mutating it, and skips the replacement when nothing actually changed.
 */
export function createStore<T extends object>(initial: T): Store<T> {
  let snapshot = initial;
  const listeners = new Set<Listener>();

  return {
    get: () => snapshot,
    update: (patch) => {
      const changed = (Object.keys(patch) as (keyof T)[]).some(
        (key) => !Object.is(snapshot[key], patch[key]),
      );
      if (!changed) return;
      snapshot = { ...snapshot, ...patch };
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
