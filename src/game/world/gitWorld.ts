import * as THREE from 'three/webgpu';
import { createIsland, type Island } from './island';
import { Label } from './labels';
import type { Flat } from './movement';

/** Where the Git World island floats, far enough from Campus that fog hides each from the other. */
export const GIT_WORLD_CENTER: Flat = { x: 140, z: 0 };

export interface GitWorldLayout {
  readonly island: Island;
  readonly spawn: Flat;
  /** Top surface where Workbench crates sit (world coordinates of its centre). */
  readonly workbenchTop: THREE.Vector3;
  /** Top surface of the Loading Dock. */
  readonly dockTop: THREE.Vector3;
  /** The Vault's door, where committed crates fly in. */
  readonly vaultDoor: THREE.Vector3;
  /** The door's material, so a commit can make it flash. */
  readonly vaultDoorMaterial: THREE.MeshStandardMaterial;
  /** Ground spot beside the Workbench where ignored crates are kept. */
  readonly blocklistGround: THREE.Vector3;
  /** The portal back to Campus. */
  readonly exit: { readonly group: THREE.Group; readonly doorstep: Flat };
  update: (elapsed: number) => void;
}

function box(
  size: [number, number, number],
  color: number,
  emissive = 0,
  intensity = 0,
): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({
      color,
      emissive,
      emissiveIntensity: intensity,
      roughness: 0.7,
    }),
  );
}

function areaLabel(title: string, subtitle: string, position: THREE.Vector3): THREE.Sprite {
  const label = new Label(`${title} · ${subtitle}`, { height: 0.34 });
  label.sprite.position.copy(position);
  return label.sprite;
}

/**
 * The Git World's fixed geography (DESIGN.md section 4): Workbench (working tree) on the
 * left, Loading Dock (index) in the middle, Vault (repository) on the right, and the
 * commit path of floating platforms trailing away behind the Vault.
 */
export function createGitWorld(): GitWorldLayout {
  const island = createIsland(17, 0x1a2230);
  const { group } = island;
  group.position.set(GIT_WORLD_CENTER.x, 0, GIT_WORLD_CENTER.z);

  // Workbench: a long table where files lie as crates.
  const bench = box([7, 0.25, 3], 0x3b2c20);
  bench.position.set(-7, 0.9, 1.5);
  const benchLegs = [-3.2, 3.2].map((x) => {
    const leg = box([0.25, 0.9, 2.6], 0x2a2018);
    leg.position.set(-7 + x, 0.45, 1.5);
    return leg;
  });
  group.add(
    bench,
    ...benchLegs,
    areaLabel('Workbench', 'working tree', new THREE.Vector3(-7, 3.1, 1.5)),
  );

  // Loading Dock: a striped platform where staged crates wait.
  const dock = box([4.2, 0.4, 3.2], 0x252c3c);
  dock.position.set(0, 0.2, 1.5);
  const stripe = box([4.3, 0.08, 0.25], 0xffb347, 0xffb347, 0.6);
  stripe.position.set(0, 0.42, 3.1);
  group.add(
    dock,
    stripe,
    areaLabel('Loading Dock', 'staging area', new THREE.Vector3(0, 1.5, 3.6)),
  );

  // Vault: a heavy building with a round door that seals snapshots.
  const vault = box([4.4, 3.6, 3.4], 0x1c2436);
  vault.position.set(0, 1.8, -6);
  const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0x9fb6d8,
    emissive: 0x6fd3ff,
    emissiveIntensity: 0.6,
    metalness: 0.8,
    roughness: 0.3,
  });
  const door = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.14, 12, 48), doorMaterial);
  door.position.set(0, 1.8, -4.25);
  group.add(vault, door, areaLabel('Vault', 'repository', new THREE.Vector3(0, 4.3, -6)));

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
  exitGroup.position.set(-10, 0, 10.5);
  exitGroup.rotation.y = -0.6;
  group.add(exitGroup);

  const world = (x: number, y: number, z: number) =>
    new THREE.Vector3(GIT_WORLD_CENTER.x + x, y, GIT_WORLD_CENTER.z + z);

  return {
    island,
    spawn: { x: GIT_WORLD_CENTER.x - 2.5, z: GIT_WORLD_CENTER.z + 5 },
    workbenchTop: world(-7, 1.03, 1.5),
    dockTop: world(0, 0.4, 1.5),
    vaultDoor: world(0, 1.8, -4.25),
    vaultDoorMaterial: doorMaterial,
    blocklistGround: world(-13, 0, 1.5),
    exit: { group: exitGroup, doorstep: { x: GIT_WORLD_CENTER.x - 9, z: GIT_WORLD_CENTER.z + 9 } },
    update: (elapsed) => {
      door.rotation.z = Math.sin(elapsed * 0.4) * 0.05;
    },
  };
}
