import { Emitter } from '../../engine/events';
import type { Reveal } from './pace';

/**
 * Otto's feed on its way to the terminal. The game plays the feed at Otto's pace
 * (pace.ts) and sends what each drawn frame reveals; the terminal prints it. It's an event
 * rather than a store, because a store keeps only its latest value and React may skip a
 * value between two renders, while every frame's keys must reach the screen.
 */
const frames = new Emitter<readonly Reveal[]>();

/** Sends one frame's reveals to the terminal. A frame that revealed nothing sends nothing. */
export function showInTerminal(reveals: readonly Reveal[]): void {
  if (reveals.length > 0) frames.emit(reveals);
}

/** The terminal listens here. Returns a function that stops listening. */
export function onTerminalFeed(listener: (reveals: readonly Reveal[]) => void): () => void {
  return frames.on(listener);
}
