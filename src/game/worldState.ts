import { createStore } from './store';

export type ZoneId = 'campus' | 'gitworld' | 'machine';

/**
 * Where the player is and whether they have started exploring. It lives outside the
 * world module so the HUD can read it without pulling three.js into the first download.
 */
export const worldState = createStore<{
  zone: ZoneId;
  hasMoved: boolean;
  /** How many pixels of the view's left edge a HUD panel covers, so the camera can frame around it. */
  leftInset: number;
  // Counters for the tutorial. Each goes up once per action (a walk, not every step of it),
  // so the HUD re-renders on a key press rather than on every frame.
  walks: number;
  jumps: number;
  looks: number;
}>({
  zone: 'campus',
  hasMoved: false,
  leftInset: 0,
  walks: 0,
  jumps: 0,
  looks: 0,
});
