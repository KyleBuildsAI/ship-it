import * as THREE from 'three/webgpu';
import type { Beat } from '../beatPlayer';

/*
 * The parts every Act island is built from (actIsland.ts puts them together): a palette,
 * a helper to place meshes, and the small toolbox lesson scenes ("beats") use to move
 * things. Each island's props live in their own file next to this one.
 */

/** A shared material set per island, so every prop of one island glows the same colour. */
export interface Palette {
  readonly base: THREE.MeshStandardMaterial;
  readonly dark: THREE.MeshStandardMaterial;
  readonly glow: THREE.MeshStandardMaterial;
  readonly light: THREE.MeshStandardMaterial;
  /** Trouble in a beat: a conflict, a failing check. Red whatever the island's accent. */
  readonly alert: THREE.MeshStandardMaterial;
}

export function palette(accent: number): Palette {
  return {
    base: new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.75 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x151b2b, roughness: 0.9 }),
    glow: new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 1.6,
    }),
    light: new THREE.MeshStandardMaterial({ color: 0xd8e2f0, roughness: 0.6 }),
    alert: new THREE.MeshStandardMaterial({
      color: 0xff5a5a,
      emissive: 0xff3b3b,
      emissiveIntensity: 2,
    }),
  };
}

/** What a theme builder hands back: the props, the parts that move, and its beats. */
export interface Props {
  readonly group: THREE.Group;
  /** Called every frame with the time, for the small motions that keep the island alive. */
  readonly animate: (elapsed: number) => void;
  /** The lesson scenes this island can play, by id. Every id in beats.ts must be here. */
  readonly beats: Readonly<Record<string, Beat>>;
}

/** A mesh placed at (x, y, z), so the builders read as a list of parts. */
export function part(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * A group for the meshes beats add, inside the island's props. A beat puts its meshes
 * here, and `clear` takes them all away again when the beat resets. Beats reuse shared
 * geometry and the palette's materials, so clearing has nothing to dispose.
 */
export interface Stage {
  readonly group: THREE.Group;
  add: (...objects: THREE.Object3D[]) => void;
  clear: () => void;
}

export function createStage(parent: THREE.Group): Stage {
  const group = new THREE.Group();
  parent.add(group);
  return {
    group,
    add: (...objects) => {
      group.add(...objects);
    },
    clear: () => {
      group.clear();
    },
  };
}

/** A flat stick from one point to another that a beat can grow, like a path being drawn. */
export interface Segment {
  readonly mesh: THREE.Mesh;
  /** Draws the stick from `from` out to `amount` (0 to 1) of the way to `to`. */
  grow: (amount: number) => void;
}

// One unit-long box, stretched per segment, so every growing path shares one geometry.
const UNIT_STICK = new THREE.BoxGeometry(0.18, 0.08, 1);
/** The way a stick points before it's turned: along its length, the box's z axis. */
const FORWARD = new THREE.Vector3(0, 0, 1);

export function segment(from: THREE.Vector3, to: THREE.Vector3, material: THREE.Material): Segment {
  const mesh = new THREE.Mesh(UNIT_STICK, material);
  const length = from.distanceTo(to);
  // Turned from the direction alone, not lookAt: lookAt aims at a point in world space,
  // and these points are in the island's own space, which floats far from the origin.
  mesh.quaternion.setFromUnitVectors(FORWARD, to.clone().sub(from).normalize());
  const grow = (amount: number) => {
    const reach = Math.max(0.001, amount);
    mesh.position.lerpVectors(from, to, reach / 2);
    mesh.scale.set(1, 1, length * reach);
    mesh.visible = amount > 0;
  };
  grow(1);
  return { mesh, grow };
}

/** Scales a mesh in with a small overshoot, so a new thing pops into place. */
export function popIn(object: THREE.Object3D, amount: number, size = 1): void {
  const clamped = Math.min(1, Math.max(0, amount));
  const overshoot = 1 + Math.sin(clamped * Math.PI) * 0.25;
  object.scale.setScalar(Math.max(0.001, clamped * overshoot * size));
  object.visible = clamped > 0;
}

/** Moves an object along a straight line, with an optional hop at the middle of the move. */
export function slide(
  object: THREE.Object3D,
  from: THREE.Vector3,
  to: THREE.Vector3,
  amount: number,
  hop = 0,
): void {
  object.position.lerpVectors(from, to, amount);
  object.position.y += Math.sin(amount * Math.PI) * hop;
}

/**
 * Remembers where a mesh stands, how big it is, its rotation and its material, to put it
 * back when a beat resets.
 */
export function remember(mesh: THREE.Mesh): () => void {
  const position = mesh.position.clone();
  const scale = mesh.scale.clone();
  const rotation = mesh.rotation.clone();
  const { visible } = mesh;
  const { material } = mesh;
  return () => {
    mesh.position.copy(position);
    mesh.scale.copy(scale);
    mesh.rotation.copy(rotation);
    mesh.visible = visible;
    mesh.material = material;
  };
}

/** For an island with no lesson scenes yet. Its lessons can't name a beat until it has some. */
export const NO_BEATS: Readonly<Record<string, Beat>> = {};
