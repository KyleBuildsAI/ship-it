import * as THREE from 'three/webgpu';
import { createIsland, type Island } from './island';
import { Label } from './labels';
import type { TerraceSpec } from './machine/terraceLayout';
import type { Flat } from './movement';

/** Where the machine island floats: opposite the Git World, so fog hides each from the other. */
export const MACHINE_CENTER: Flat = { x: -140, z: 0 };

export interface MachineIsland {
  readonly island: Island;
  readonly spawn: Flat;
  /** The portal back to Campus: its ring stands at `at`. */
  readonly exit: { readonly group: THREE.Group; readonly at: Flat };
  /** Redraws the terraces from the laptop, or shows the sign when there's no laptop to draw. */
  sync: (spec: TerraceSpec | null) => void;
  update: (elapsed: number) => void;
}

/** Each deeper folder sits one terrace further back and a step higher (DESIGN.md section 4). */
const ROW_DEPTH = 2.6;
const ROW_RISE = 0.45;
const TILE_SPACING = 2.9;
const FRONT_Z = 7;

const TILE_COLOR = 0x203048;
const PAD_COLOR = 0x2b3c58;
const LANTERN = 0xffc46b;
const ACTIVE_LANTERN = 0xffe0a0;

/** Where a tile stands on the island, from its terrace and its place among that terrace's tiles. */
function tilePositions(spec: TerraceSpec): Map<string, THREE.Vector3> {
  const rows = new Map<number, string[]>();
  for (const tile of spec.tiles) rows.set(tile.depth, [...(rows.get(tile.depth) ?? []), tile.path]);
  const positions = new Map<string, THREE.Vector3>();
  for (const [depth, paths] of rows) {
    paths.forEach((path, index) => {
      const x = (index - (paths.length - 1) / 2) * TILE_SPACING;
      positions.set(path, new THREE.Vector3(x, depth * ROW_RISE, FRONT_Z - depth * ROW_DEPTH));
    });
  }
  return positions;
}

/**
 * Act 1's island (docs/act1-directed.md section 4): the laptop's folders as terraces rising
 * away from the player, C:\ at the front, each deeper folder a step further back and higher.
 * Files lie on their folder as cards, and every terminal is a lantern standing on the folder
 * it's in, so a cd moves a lantern and a mkdir raises a tile.
 */
export function createMachineIsland(): MachineIsland {
  const island = createIsland(18, 0x161f2c);
  const { group } = island;
  group.position.set(MACHINE_CENTER.x, 0, MACHINE_CENTER.z);

  // Shared geometry and materials; only the labels are made per sync.
  const tileGeometry = new THREE.CylinderGeometry(1.25, 1.25, 0.35, 6);
  const tileMaterial = new THREE.MeshStandardMaterial({ color: TILE_COLOR, roughness: 0.8 });
  const padMaterial = new THREE.MeshStandardMaterial({
    color: PAD_COLOR,
    emissive: 0x3a6ea8,
    emissiveIntensity: 0.25,
  });
  const cardGeometry = new THREE.BoxGeometry(0.42, 0.04, 0.3);
  const cardMaterial = new THREE.MeshStandardMaterial({ color: 0xd8e2f0, roughness: 0.6 });
  const lanternGeometry = new THREE.SphereGeometry(0.22, 16, 12);
  const lanternMaterial = new THREE.MeshStandardMaterial({
    color: LANTERN,
    emissive: LANTERN,
    emissiveIntensity: 1.8,
  });
  const activeMaterial = new THREE.MeshStandardMaterial({
    color: ACTIVE_LANTERN,
    emissive: ACTIVE_LANTERN,
    emissiveIntensity: 3,
  });

  const terraces = new THREE.Group();
  group.add(terraces);
  let labels: Label[] = [];
  const lanterns: THREE.Object3D[] = [];

  const label = (text: string, at: THREE.Vector3, options: { color?: string; height?: number }) => {
    const made = new Label(text, { height: options.height ?? 0.3, color: options.color });
    made.sprite.position.copy(at);
    labels.push(made);
    terraces.add(made.sprite);
  };

  const clear = () => {
    for (const made of labels) made.dispose();
    labels = [];
    lanterns.length = 0;
    terraces.clear();
  };

  // The way home.
  const exitGroup = new THREE.Group();
  const exitRing = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.06, 12, 64),
    new THREE.MeshStandardMaterial({ color: 0x6fd3ff, emissive: 0x6fd3ff, emissiveIntensity: 2 }),
  );
  exitRing.position.y = 1.35;
  const exitLabel = new Label('Campus', { height: 0.3 });
  exitLabel.sprite.position.y = 2.7;
  exitGroup.add(exitRing, exitLabel.sprite);
  exitGroup.position.set(-11, 0, 11);
  exitGroup.rotation.y = -0.6;
  group.add(exitGroup);

  const title = new Label('Act 1 · The Machine', { color: '#ffc46b', height: 0.42 });
  title.sprite.position.set(0, 5.2, -9);
  group.add(title.sprite);

  const sync = (spec: TerraceSpec | null) => {
    clear();
    if (spec === null) {
      label(
        'Open Mission 1.1 or the Laptop sandbox from the Acts menu to light the terraces',
        new THREE.Vector3(0, 1.6, 3),
        { color: '#c8d4e8', height: 0.32 },
      );
      return;
    }
    const positions = tilePositions(spec);
    for (const tile of spec.tiles) {
      const at = positions.get(tile.path);
      if (at === undefined) continue;
      const mesh = new THREE.Mesh(tileGeometry, tile.depth === 0 ? padMaterial : tileMaterial);
      mesh.position.set(at.x, at.y + 0.17, at.z);
      terraces.add(mesh);
      const name = tile.more > 0 ? `${tile.name} +${String(tile.more)}` : tile.name;
      label(name, new THREE.Vector3(at.x, at.y + 1.05, at.z + 0.9), {
        color: tile.recent ? '#ffe0a0' : '#e8ecf5',
      });
    }
    for (const card of spec.cards) {
      const at = positions.get(card.folder);
      if (at === undefined) continue;
      const mesh = new THREE.Mesh(cardGeometry, cardMaterial);
      // Cards fan out across the tile's top, a row of three per line.
      mesh.position.set(
        at.x - 0.5 + (card.slot % 3) * 0.5,
        at.y + 0.37,
        at.z - 0.35 + Math.floor(card.slot / 3) * 0.38,
      );
      terraces.add(mesh);
    }
    spec.lanterns.forEach((lantern, index) => {
      const at = positions.get(lantern.tile);
      if (at === undefined) return;
      const holder = new THREE.Group();
      // Lanterns on one folder stand side by side instead of inside each other.
      holder.position.set(at.x + 0.75 - index * 0.35, at.y + 0.95, at.z + 0.2);
      holder.userData = { baseY: holder.position.y };
      holder.add(
        new THREE.Mesh(lanternGeometry, lantern.active ? activeMaterial : lanternMaterial),
      );
      const light = new THREE.PointLight(LANTERN, lantern.active ? 6 : 3, 5);
      holder.add(light);
      terraces.add(holder);
      lanterns.push(holder);
      label(
        lantern.label,
        new THREE.Vector3(holder.position.x, holder.position.y + 0.55, holder.position.z),
        {
          color: '#ffc46b',
          height: 0.24,
        },
      );
    });
    if (spec.breadcrumb.length > 0) {
      // The signpost stands to the left of the C:\ pad, so it never hides a tile's name.
      label(spec.breadcrumb.join(' › '), new THREE.Vector3(-6, 1.4, FRONT_Z + 1.5), {
        color: '#ffe0a0',
        height: 0.36,
      });
    }
  };
  sync(null);

  return {
    island,
    spawn: { x: MACHINE_CENTER.x, z: MACHINE_CENTER.z + 12 },
    exit: { group: exitGroup, at: { x: MACHINE_CENTER.x - 11, z: MACHINE_CENTER.z + 11 } },
    sync,
    update: (elapsed) => {
      lanterns.forEach((holder, index) => {
        const base = holder.userData.baseY as number;
        holder.position.y = base + Math.sin(elapsed * 2 + index) * 0.06;
      });
    },
  };
}
