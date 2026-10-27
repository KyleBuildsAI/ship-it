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

/**
 * A mesh placed at (x, y, z), so the builders read as a list of parts. For an island's
 * idle props only: a beat takes its meshes from its stage (see Stage).
 */
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

/** Lays a unit stick mesh from one point to another, fully grown, and says how to grow it. */
function layStick(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3): Segment {
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

/** A stick for an island's idle props. A beat takes its sticks from its stage instead. */
export function segment(from: THREE.Vector3, to: THREE.Vector3, material: THREE.Material): Segment {
  return layStick(new THREE.Mesh(UNIT_STICK, material), from, to);
}

/**
 * Where a beat's own meshes live, inside the island's props. A beat takes every mesh it
 * shows from the stage (`part`, `segment`) and never constructs one in start(): `clear`
 * hands them back when the beat resets, and the next beat reuses them. That matters in
 * three's WebGPU renderer, which remembers each mesh it has drawn on the shared palette
 * materials and geometry until those are disposed, and they never are. A new mesh for
 * every playing would pile up, with its GPU buffers, for the whole session.
 */
export interface Stage {
  readonly group: THREE.Group;
  /** A mesh for the playing beat at (x, y, z), shown, unturned and full size. */
  part: (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => THREE.Mesh;
  /** A growing stick for the playing beat, from one point to another, fully grown. */
  segment: (from: THREE.Vector3, to: THREE.Vector3, material: THREE.Material) => Segment;
  /** Puts what a beat assembled from its parts, like a group, on the stage. */
  add: (...objects: THREE.Object3D[]) => void;
  /** Takes everything off the stage, keeping its meshes for the next beat. */
  clear: () => void;
}

export function createStage(parent: THREE.Group): Stage {
  const group = new THREE.Group();
  parent.add(group);
  /** Meshes no beat is using, by geometry, ready to be handed out again. */
  const spare = new Map<THREE.BufferGeometry, THREE.Mesh[]>();
  /** Every mesh the playing beat took, wherever it put them. */
  const taken: THREE.Mesh[] = [];

  const take = (geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh => {
    const mesh = spare.get(geometry)?.pop() ?? new THREE.Mesh(geometry, material);
    // Set back to how a new mesh starts, so a reused one carries nothing from its last beat.
    mesh.material = material;
    mesh.name = '';
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);
    mesh.visible = true;
    taken.push(mesh);
    group.add(mesh);
    return mesh;
  };

  return {
    group,
    part: (geometry, material, x, y, z) => {
      const mesh = take(geometry, material);
      mesh.position.set(x, y, z);
      return mesh;
    },
    segment: (from, to, material) => layStick(take(UNIT_STICK, material), from, to),
    add: (...objects) => {
      group.add(...objects);
    },
    clear: () => {
      for (const mesh of taken) {
        // A beat may have moved a mesh into a group of its own, so detach it from there.
        mesh.removeFromParent();
        const pile = spare.get(mesh.geometry);
        if (pile === undefined) spare.set(mesh.geometry, [mesh]);
        else pile.push(mesh);
      }
      taken.length = 0;
      group.clear();
    },
  };
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
