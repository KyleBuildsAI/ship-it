export type Listener<Event> = (event: Event) => void;

/**
 * A minimal typed event emitter. The engine announces what happened; the 3D world
 * and HUD listen. The engine never knows who is listening, which keeps it pure.
 */
export class Emitter<Event> {
  private readonly listeners = new Set<Listener<Event>>();

  on(listener: Listener<Event>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: Event): void {
    // Copy first so a listener that unsubscribes mid-emit doesn't skip its neighbours.
    for (const listener of [...this.listeners]) listener(event);
  }
}
