import { createStore } from './store';

/**
 * Whether the player has started exploring. It lives outside the world module so the HUD
 * can read it without pulling three.js into the first download.
 */
export const worldState = createStore<{ hasMoved: boolean }>({ hasMoved: false });
