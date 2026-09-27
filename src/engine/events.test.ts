import { describe, expect, it, vi } from 'vitest';
import { Emitter } from './events';

type TestEvent = { type: 'staged'; paths: string[] } | { type: 'committed'; id: string };

describe('Emitter', () => {
  it('delivers each event to every listener', () => {
    const emitter = new Emitter<TestEvent>();
    const first = vi.fn();
    const second = vi.fn();
    emitter.on(first);
    emitter.on(second);

    emitter.emit({ type: 'staged', paths: ['app.ts'] });

    expect(first).toHaveBeenCalledWith({ type: 'staged', paths: ['app.ts'] });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops delivering after unsubscribe', () => {
    const emitter = new Emitter<TestEvent>();
    const listener = vi.fn();
    const off = emitter.on(listener);
    off();
    emitter.emit({ type: 'committed', id: 'abc' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('still reaches every listener when one unsubscribes during an emit', () => {
    const emitter = new Emitter<TestEvent>();
    const later = vi.fn();
    const off = emitter.on(() => {
      off();
    });
    emitter.on(later);
    emitter.emit({ type: 'committed', id: 'abc' });
    expect(later).toHaveBeenCalledTimes(1);
  });
});
