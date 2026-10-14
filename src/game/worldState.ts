import { createStore } from './store';

/** The themed islands of Acts 3 to 8, each built by actIsland.ts from the same kit. */
export type ActIslandZone = 'act3' | 'act4' | 'act5' | 'act6' | 'act7' | 'act8';

export type ZoneId = 'campus' | 'gitworld' | 'machine' | ActIslandZone;

/**
 * A lesson scene the game asked an Act island to play (see src/game/world/beats.ts). The
 * nonce changes on every new card, so two cards in a row with the same beat replay it.
 */
export interface IslandBeat {
  readonly zone: ActIslandZone;
  readonly id: string;
  readonly nonce: number;
}

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
  /** An island the game asked the world to travel to, cleared once the world takes it up. */
  destination: ZoneId | null;
  /** The lesson scene playing now, or null when no lesson card asks for one. */
  beat: IslandBeat | null;
}>({
  zone: 'campus',
  hasMoved: false,
  leftInset: 0,
  walks: 0,
  jumps: 0,
  looks: 0,
  destination: null,
  beat: null,
});

/**
 * Takes the player to an island, as stepping through its portal would. Starting a mission
 * from a menu does this so the player sees the world react to it (Otto's crates moving in
 * the Git World, the laptop's terraces growing) instead of staying on Campus.
 */
export function travelTo(zone: ZoneId | null): void {
  if (zone === null || zone === worldState.get().zone) return;
  worldState.update({ destination: zone });
}
