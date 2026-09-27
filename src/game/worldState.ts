import { createStore } from './store';

export type ZoneId = 'campus' | 'gitworld';

/**
 * Where the player is and whether they have started exploring. It lives outside the
 * world module so the HUD can read it without pulling three.js into the first download.
 */
export const worldState = createStore<{
  zone: ZoneId;
  hasMoved: boolean;
  /** How many pixels of the view's left edge a HUD panel covers, so the camera can frame around it. */
  leftInset: number;
}>({
  zone: 'campus',
  hasMoved: false,
  leftInset: 0,
});
