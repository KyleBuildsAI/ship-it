import { createStore } from './store';

/** The themed islands of Acts 3 to 8, each built by actIsland.ts from the same kit. */
export type ActIslandZone = 'act3' | 'act4' | 'act5' | 'act6' | 'act7' | 'act8';

export type ZoneId = 'campus' | 'gitworld' | 'machine' | ActIslandZone;

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
