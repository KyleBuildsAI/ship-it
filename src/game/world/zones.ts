import type { ActIslandZone, ZoneId } from '../worldState';
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

/** The props an Act's island is dressed with, so it reads as that Act's place at a glance. */
export type IslandTheme = 'branches' | 'town' | 'gates' | 'servers' | 'workshop' | 'hall';

/**
 * Acts 3 to 8 each get a themed island from one kit (actIsland.ts). This is that kit's
 * data: which Act, its accent colour, where it floats, and what the title card says there.
 * Islands sit 140 units apart, far enough that the fog hides each from the others.
 */
export interface ActIsland {
  readonly act: number;
  readonly zone: ActIslandZone;
  readonly title: string;
  readonly theme: IslandTheme;
  /** The accent for the title, the props' glow and the rim, as 0xRRGGBB. */
  readonly accent: number;
  readonly center: Flat;
  /** The title card's line on this island: what the place is, and where to start. */
  readonly hint: string;
}

export const ACT_ISLANDS: readonly ActIsland[] = [
  {
    act: 3,
    zone: 'act3',
    title: 'Branching',
    theme: 'branches',
    accent: 0x7ee2a8,
    center: { x: 0, z: 140 },
    hint: 'Paths split into branches and merge back. Its lessons are in the menu.',
  },
  {
    act: 4,
    zone: 'act4',
    title: 'GitHub Team Flow',
    theme: 'town',
    accent: 0xffb347,
    center: { x: 0, z: -140 },
    hint: 'The town square: issues on the board, PRs to review. Its lessons are in the menu.',
  },
  {
    act: 5,
    zone: 'act5',
    title: 'Quality Gates',
    theme: 'gates',
    accent: 0x6fd3ff,
    center: { x: 140, z: 140 },
    hint: 'Every change passes the gates: tests, types, lint, CI. Its lessons are in the menu.',
  },
  {
    act: 6,
    zone: 'act6',
    title: 'How Systems Work',
    theme: 'servers',
    accent: 0xc792ea,
    center: { x: 140, z: -140 },
    hint: 'Servers, pipes and a database: how a request travels. Its lessons are in the menu.',
  },
  {
    act: 7,
    zone: 'act7',
    title: 'AI-Native Engineering',
    theme: 'workshop',
    accent: 0xff7b9c,
    center: { x: -140, z: 140 },
    hint: 'The robot workshop: brief agents, review their work. Its lessons are in the menu.',
  },
  {
    act: 8,
    zone: 'act8',
    title: 'The Loop',
    theme: 'hall',
    accent: 0xffe08a,
    center: { x: -140, z: -140 },
    hint: 'The interview hall: show what you know. Its lessons are in the menu.',
  },
];

/** The island data of one Act island zone. */
export function actIsland(zone: ActIslandZone): ActIsland {
  const island = ACT_ISLANDS.find((entry) => entry.zone === zone);
  if (island === undefined) throw new Error(`No Act island is listed for "${zone}".`);
  return island;
}

/**
 * One value per Act island, keyed by its zone: `perActIsland(createActIsland)` builds them
 * all. Spelled out key by key so TypeScript proves every island has an entry.
 */
export function perActIsland<T>(make: (island: ActIsland) => T): Record<ActIslandZone, T> {
  const build = (zone: ActIslandZone) => make(actIsland(zone));
  return {
    act3: build('act3'),
    act4: build('act4'),
    act5: build('act5'),
    act6: build('act6'),
    act7: build('act7'),
    act8: build('act8'),
  };
}

/** The Git World needs a wider view than Campus so the Workbench, Dock, and Vault all fit. */
export const CAMERA_RIGS: Readonly<Record<ZoneId, CameraRig>> = {
  campus: { height: 5.5, back: 10 },
  gitworld: { height: 8, back: 13.5 },
  // The terraces climb away from the player, so stand back and higher to see them all.
  machine: { height: 9, back: 15 },
  // The themed islands are small and their props sit near the middle: one shared framing.
  act3: { height: 7, back: 12 },
  act4: { height: 7, back: 12 },
  act5: { height: 7, back: 12 },
  act6: { height: 7, back: 12 },
  act7: { height: 7, back: 12 },
  act8: { height: 7, back: 12 },
};

/**
 * The island each Act lives on. Every Act has one, so every Campus portal is open: an Act
 * with nothing built yet still has its place, and arriving opens its menu.
 */
export const ZONE_FOR_ACT: Readonly<Partial<Record<number, ZoneId>>> = {
  1: 'machine',
  2: 'gitworld',
  ...Object.fromEntries(ACT_ISLANDS.map((island) => [island.act, island.zone])),
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
