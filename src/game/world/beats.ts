import type { ActIslandZone } from '../worldState';
import { zoneForAct } from './zones';

/*
 * Lesson scenes (DESIGN.md section 5.5): a lesson card can name a "beat", a short moment
 * its Act's island plays while the card is on screen, so the idea is shown as well as told.
 *
 * This file is the list of beats each island knows, as plain data with no three.js, so the
 * lesson schema can refuse a card that names a beat its island can't play. The island side
 * (src/game/world/islands/) must implement every id listed here: its beat table is typed
 * as Record<BeatId<zone>, Beat>, so a missing or extra beat fails the typecheck.
 */

export const ISLAND_BEATS = {
  act3: [
    'branch-splits',
    'commit-on-branch',
    'switch-branch',
    'fast-forward',
    'merge-commit',
    'rebase-replay',
    'conflict-clash',
    'cherry-pick',
    'branch-deleted',
    'tag-release',
    'bisect-search',
  ],
  act4: [
    'sync-origin',
    'push-behind',
    'main-protected',
    'issue-pinned',
    'pr-opened',
    'review-changes',
    'checks-gate',
    'release-tag',
  ],
  act5: [],
  act6: [],
  act7: [],
  act8: [],
} as const satisfies Record<ActIslandZone, readonly string[]>;

/** The beats one island can play, as a union of their ids. */
export type BeatId<Zone extends ActIslandZone> = (typeof ISLAND_BEATS)[Zone][number];

/** The island zone an Act's beats play on, or null for an Act with no beat island. */
export function beatZoneForAct(act: number): ActIslandZone | null {
  const zone = zoneForAct(act);
  return zone !== null && zone in ISLAND_BEATS ? (zone as ActIslandZone) : null;
}

/** The beat ids an Act's lessons may name. Acts without an Act island have none. */
export function beatsForAct(act: number): readonly string[] {
  const zone = beatZoneForAct(act);
  return zone === null ? [] : ISLAND_BEATS[zone];
}
