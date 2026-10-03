import type { ZoneId } from '../worldState';
import type { Flat } from './movement';

/**
 * The islands as data: where each one is, where you arrive, how the camera frames it, and
 * the portals out of it. world.ts builds one Zone per island and reads these instead of
 * asking "Campus or the Git World?" in every function, so a new island is one more entry.
 */

/** How high and how far behind the avatar the camera starts on an island. */
export interface CameraRig {
  readonly height: number;
  readonly back: number;
}

/** A portal: its ring stands at `at` on the ground, and it leads `to` an island. */
export interface Doorway {
  readonly at: Flat;
  readonly to: ZoneId;
}

export interface Zone {
  readonly id: ZoneId;
  readonly center: Flat;
  /** How far from the centre the avatar may walk. */
  readonly radius: number;
  readonly spawn: Flat;
  readonly rig: CameraRig;
  readonly doorways: readonly Doorway[];
}

/** The Git World needs a wider view than Campus so the Workbench, Dock, and Vault all fit. */
export const CAMERA_RIGS: Readonly<Record<ZoneId, CameraRig>> = {
  campus: { height: 5.5, back: 10 },
  gitworld: { height: 8, back: 13.5 },
  // The terraces climb away from the player, so stand back and higher to see them all.
  machine: { height: 9, back: 15 },
};

/** The island each playable Act lives on. An Act with an island gets an open portal. */
export const ZONE_FOR_ACT: Readonly<Partial<Record<number, ZoneId>>> = {
  1: 'machine',
  2: 'gitworld',
};

export function zoneForAct(act: number): ZoneId | null {
  return ZONE_FOR_ACT[act] ?? null;
}

/** The Act an island belongs to, or null for Campus, which belongs to every Act. */
export function actForZone(zone: ZoneId): number | null {
  const entry = Object.entries(ZONE_FOR_ACT).find(([, island]) => island === zone);
  return entry === undefined ? null : Number(entry[0]);
}

/** The Acts whose Campus portals are open. */
export function openActs(): ReadonlySet<number> {
  return new Set(Object.keys(ZONE_FOR_ACT).map(Number));
}

/** Walking this close to a portal's ring steps through it. */
export const STEP_THROUGH_DISTANCE = 0.9;

/** The portal the avatar is stepping through, if any: the nearest one within reach. */
export function doorwayAt(position: Flat, doorways: readonly Doorway[]): Doorway | null {
  let nearest: Doorway | null = null;
  let nearestDistance = STEP_THROUGH_DISTANCE;
  for (const doorway of doorways) {
    const distance = Math.hypot(doorway.at.x - position.x, doorway.at.z - position.z);
    if (distance <= nearestDistance) {
      nearest = doorway;
      nearestDistance = distance;
    }
  }
  return nearest;
}
