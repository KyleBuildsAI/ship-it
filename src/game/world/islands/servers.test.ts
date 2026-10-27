import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createBeatPlayer } from '../beatPlayer';
import { beatsForAct } from '../beats';
import { palette, type Props } from './kit';
import { servers } from './servers';

/*
 * Act 6's island beats, played without a renderer: the meshes are plain objects, so a
 * beat's effect can be read straight off the island's tree. Each check compares the whole
 * island (every mesh's place, size, turn, visibility and material) against its idle look.
 */

const ACT6_BEATS = beatsForAct(6);
const ACCENT = 0x7ee2a8;
/**
 * The island-local box the lesson camera sees beside the lesson panel: the camera stands
 * at z of about +22 looking toward -z, and the panel covers the left of the screen.
 */
const IN_VIEW = new THREE.Box3(new THREE.Vector3(-6, 0, -6), new THREE.Vector3(10, 5, 7));

interface Shown {
  readonly mesh: THREE.Mesh;
  /** Where it stands on the island: the island's root sits at the origin in these tests. */
  readonly at: THREE.Vector3;
}

/** One line per object on the island, in tree order: everything a beat may change. */
function snapshot(root: THREE.Object3D): string[] {
  const rows: string[] = [];
  root.traverse((object) => {
    const material =
      object instanceof THREE.Mesh && !Array.isArray(object.material)
        ? (object.material as THREE.Material).uuid
        : '-';
    rows.push(
      JSON.stringify([
        object.type,
        object.visible,
        object.position.toArray(),
        object.scale.toArray(),
        object.rotation.toArray(),
        material,
      ]),
    );
  });
  return rows;
}

function allFinite(root: THREE.Object3D): boolean {
  let finite = true;
  root.traverse((object) => {
    const numbers = [...object.position.toArray(), ...object.scale.toArray()];
    if (!numbers.every(Number.isFinite)) finite = false;
  });
  return finite;
}

function beatOf(props: Props, id: string) {
  const beat = props.beats[id];
  if (beat === undefined) throw new Error(`The servers island has no beat "${id}".`);
  return beat;
}

/** Every mesh drawn right now: visible itself, with every group above it visible too. */
function shownMeshes(root: THREE.Object3D): Shown[] {
  root.updateMatrixWorld(true);
  const shown: Shown[] = [];
  root.traverseVisible((object) => {
    // instanceof narrows to a Mesh of `any` geometry and material; every mesh here is a
    // plain Mesh, so name that type rather than let `any` flow on.
    if (object instanceof THREE.Mesh) {
      const mesh = object as THREE.Mesh;
      shown.push({ mesh, at: mesh.getWorldPosition(new THREE.Vector3()) });
    }
  });
  return shown;
}

/** The held frame's refused request: the red packet lying on the floor. */
function refusedRequest(id: string) {
  const colors = palette(ACCENT);
  const props = servers(colors);
  beatOf(props, id).start().frame(1);
  const shown = shownMeshes(props.group);
  // The gate's posts are the island's only boxes 2.4 tall.
  const post = shown.find(
    ({ mesh }) =>
      mesh.geometry instanceof THREE.BoxGeometry && mesh.geometry.parameters.height === 2.4,
  );
  const lying = shown.filter(({ mesh, at }) => mesh.material === colors.alert && at.y < 0.5);
  const [request] = lying;
  if (post === undefined || request === undefined || lying.length !== 1) {
    throw new Error(`${id} should hold its gate up and one refused request on the floor.`);
  }
  // A pass is the pale card standing right on top of its packet.
  const carriesPass = shown.some(
    ({ mesh, at }) =>
      mesh.material === colors.light &&
      Math.abs(at.x - request.at.x) < 0.01 &&
      Math.abs(at.z - request.at.z) < 0.01 &&
      at.y > request.at.y,
  );
  return { gateZ: post.at.z, at: request.at, carriesPass };
}

describe('the servers island (Act 6)', () => {
  it('plays exactly the beats beats.ts lists for Act 6', () => {
    const props = servers(palette(ACCENT));
    expect(Object.keys(props.beats).sort()).toEqual([...ACT6_BEATS].sort());
    expect(ACT6_BEATS.length).toBeGreaterThanOrEqual(5);
    // A handful of scenes, not one per card: Act 3's island, the worked example, has 11.
    expect(ACT6_BEATS.length).toBeLessThanOrEqual(12);
  });

  it.each(ACT6_BEATS)('%s plays, holds a steady last frame, and resets cleanly', (id) => {
    const props = servers(palette(ACCENT));
    const idle = snapshot(props.group);
    const beat = beatOf(props, id);
    expect(beat.seconds).toBeGreaterThanOrEqual(1.5);
    expect(beat.seconds).toBeLessThanOrEqual(3);

    const run = beat.start();
    for (let step = 0; step <= 20; step++) {
      run.frame(step / 20);
      expect(allFinite(props.group), `${id} at ${String(step / 20)}`).toBe(true);
    }
    const last = snapshot(props.group);
    // The held picture shows something: the island doesn't look idle.
    expect(last).not.toEqual(idle);
    // A frame depends only on its progress, so reduced motion can jump straight to the end.
    run.frame(0.3);
    run.frame(1);
    expect(snapshot(props.group)).toEqual(last);

    run.reset();
    expect(snapshot(props.group)).toEqual(idle);
  });

  it('jumps to each beat’s last frame with reduced motion, and back to idle after', () => {
    const props = servers(palette(ACCENT));
    const idle = snapshot(props.group);
    const player = createBeatPlayer(props.beats, true);
    for (const id of ACT6_BEATS) {
      // The player still holds the last beat; drop it before drawing this one by hand.
      player.play(null);
      const run = beatOf(props, id).start();
      run.frame(1);
      const last = snapshot(props.group);
      run.reset();

      player.play(id);
      expect(snapshot(props.group), id).toEqual(last);
      player.update(100);
      expect(snapshot(props.group), id).toEqual(last);
    }
    player.play(null);
    expect(snapshot(props.group)).toEqual(idle);
  });

  it('puts the island back when one beat cuts into another mid-play', () => {
    const props = servers(palette(ACCENT));
    const idle = snapshot(props.group);
    const player = createBeatPlayer(props.beats, false);
    let clock = 0;
    for (const id of ACT6_BEATS) {
      player.play(id);
      player.update(clock);
      // Halfway through, the next card's beat takes over.
      clock += beatOf(props, id).seconds / 2;
      player.update(clock);
      expect(player.current()).toBe(id);
    }
    player.play(null);
    expect(player.current()).toBeNull();
    expect(snapshot(props.group)).toEqual(idle);
  });

  it.each(ACT6_BEATS)('%s draws the same moment however it got there', (id) => {
    const props = servers(palette(ACCENT));
    const run = beatOf(props, id).start();
    // Played forward or jumped back to, a moment must look the same: the player may draw
    // any progress after any other, and reduced motion jumps straight to the end.
    for (const progress of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
      run.frame(0);
      run.frame(progress);
      const fromTheStart = snapshot(props.group);
      run.frame(1);
      run.frame(progress);
      expect(snapshot(props.group), `${id} at ${String(progress)}`).toEqual(fromTheStart);
    }
  });

  it.each(ACT6_BEATS)('%s stays where the lesson camera can see it', (id) => {
    const props = servers(palette(ACCENT));
    const run = beatOf(props, id).start();
    for (let step = 0; step <= 20; step++) {
      run.frame(step / 20);
      for (const { at } of shownMeshes(props.group)) {
        const where = `${id} at ${String(step / 20)}: ${at.toArray().join(', ')}`;
        expect(IN_VIEW.containsPoint(at), where).toBe(true);
      }
    }
  });

  it('answers a cache hit without touching the database', () => {
    const props = servers(palette(ACCENT));
    // The database's drums are the island's only cylinders a unit wide.
    const drums = shownMeshes(props.group)
      .map(({ mesh }) => mesh)
      .filter(
        (mesh) =>
          mesh.geometry instanceof THREE.CylinderGeometry &&
          mesh.geometry.parameters.radiusTop === 1,
      );
    expect(drums).toHaveLength(3);
    const idle = drums.map((drum) => drum.material);
    const run = beatOf(props, 'cache-hit').start();
    // The first read is a miss, so the database does the reading.
    run.frame(0.2);
    expect(drums.some((drum, index) => drum.material !== idle[index])).toBe(true);
    // The second request is a hit: every moment of it leaves the database alone.
    for (let step = 10; step <= 20; step++) {
      run.frame(step / 20);
      drums.forEach((drum, index) => {
        expect(drum.material, `at ${String(step / 20)}`).toBe(idle[index]);
      });
    }
  });

  it('refuses a 401 before the gate and a 403 past it, pass and all', () => {
    // 401: the request has no pass, so it never gets past the gate.
    const unauthorized = refusedRequest('auth-gate');
    expect(unauthorized.carriesPass).toBe(false);
    expect(unauthorized.at.z).toBeGreaterThan(unauthorized.gateZ);
    // 403: its pass got it through the gate, and a rack inside said no.
    const forbidden = refusedRequest('forbidden-door');
    expect(forbidden.carriesPass).toBe(true);
    expect(forbidden.at.z).toBeLessThan(forbidden.gateZ);
  });
});
