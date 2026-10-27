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

// Each Act's list sits under its own comment line, so branches that grow two Acts' lists
// side by side merge without a conflict.
export const ISLAND_BEATS = {
  // Act 3, islands/branches.ts
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
  // Act 4, islands/town.ts
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
  // Act 5, islands/gates.ts
  act5: [
    'change-passes',
    'gate-blocks',
    'red-to-green',
    'change-reverted',
    'gate-bypassed',
    'bug-slips-through',
    'flaky-check',
    'test-layers',
    'secret-vault',
    'secret-withheld',
    'key-revoked',
  ],
  // Act 6, islands/servers.ts
  act6: [
    'request-response',
    'auth-gate',
    'forbidden-door',
    'database-query',
    'cache-hit',
    'queue-worker',
    'log-trail',
    'connections-run-out',
    'incident-rollback',
  ],
  // Act 7, islands/workshop.ts
  act7: [
    'brief-handed',
    'agent-loop',
    'diff-inspected',
    'test-gate',
    'gate-bent',
    'eval-scores',
    'guardrails-up',
    'agent-halted',
  ],
  // Act 8, islands/hall.ts
  act8: [
    'think-aloud',
    'spot-the-bug',
    'trace-evidence',
    'cache-the-reads',
    'queue-slow-work',
    'listen-first',
    'tell-your-story',
    'agent-loop',
  ],
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
