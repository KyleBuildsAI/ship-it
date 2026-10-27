import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createBeatPlayer } from '../beatPlayer';
import { ISLAND_BEATS } from '../beats';
import { palette, type Palette, type Props } from './kit';
import { town } from './town';

/*
 * Act 4's island beats, played through the real beat player on the real props. No
 * renderer is needed: a beat only moves, shows and recolours meshes, so comparing every
 * mesh's place, size, visibility and material before and after proves it cleaned up.
 */

const BEAT_IDS = ISLAND_BEATS.act4;
/** Any time will do as the first frame; the player starts its clock there. */
const START = 10;

function build(): { colors: Palette; props: Props } {
  const colors = palette(0x7c9cff);
  return { colors, props: town(colors) };
}

/** Rounds away float noise (and -0), so two equal poses print the same. */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000 + 0;
}

/**
 * One line per object on the island: where it is, how big, how turned, whether it shows,
 * and which palette material it wears ("other" for anything outside the palette).
 */
function snapshot(group: THREE.Group, colors: Palette): string[] {
  const names = new Map<THREE.Material, string>(
    Object.entries(colors).map(([name, material]) => [material, name]),
  );
  const lines: string[] = [];
  group.traverse((object) => {
    const pose = [
      ...object.position.toArray(),
      ...object.scale.toArray(),
      object.rotation.x,
      object.rotation.y,
      object.rotation.z,
    ].map(round);
    const material =
      object instanceof THREE.Mesh && !Array.isArray(object.material)
        ? (names.get(object.material as THREE.Material) ?? 'other')
        : '-';
    lines.push(`${object.type} ${pose.join(',')} ${String(object.visible)} ${material}`);
  });
  return lines;
}

/** Every object on the idle island, to tell the meshes a beat adds from the island's own. */
function everything(group: THREE.Group): ReadonlySet<THREE.Object3D> {
  const objects = new Set<THREE.Object3D>();
  group.traverse((object) => {
    objects.add(object);
  });
  return objects;
}

/** The meshes a beat added that show right now. */
function shownBeatMeshes(group: THREE.Group, idle: ReadonlySet<THREE.Object3D>): THREE.Object3D[] {
  const shown: THREE.Object3D[] = [];
  group.traverseVisible((object) => {
    // By type name rather than instanceof, which narrows to a Mesh of `any` parts.
    if (object.type === 'Mesh' && !idle.has(object)) shown.push(object);
  });
  return shown;
}

/** Where each mesh a beat added stands while it shows, in the island's own space. */
function spotsOfShown(group: THREE.Group, idle: ReadonlySet<THREE.Object3D>): THREE.Vector3[] {
  return shownBeatMeshes(group, idle).map((mesh) => mesh.getWorldPosition(new THREE.Vector3()));
}

function secondsOf(props: Props, id: string): number {
  const beat = props.beats[id];
  if (beat === undefined) throw new Error(`The town island has no beat "${id}".`);
  return beat.seconds;
}

/** Plays a beat from its first frame to its held last one. */
function playToEnd(player: ReturnType<typeof createBeatPlayer>, props: Props, id: string): void {
  player.play(id);
  player.update(START);
  player.update(START + secondsOf(props, id) + 0.5);
}

describe('Act 4 town island beats', () => {
  it('has exactly the beats beats.ts lists for Act 4', () => {
    const { props } = build();
    expect(Object.keys(props.beats).sort()).toEqual([...BEAT_IDS].sort());
  });

  it('times every beat at 1.5 to 3 seconds', () => {
    const { props } = build();
    for (const id of BEAT_IDS) {
      expect(secondsOf(props, id), id).toBeGreaterThanOrEqual(1.5);
      expect(secondsOf(props, id), id).toBeLessThanOrEqual(3);
    }
  });

  it.each(BEAT_IDS)('plays %s, holds its last frame, then puts the island back', (id) => {
    const { colors, props } = build();
    const idle = snapshot(props.group, colors);
    const player = createBeatPlayer(props.beats, false);

    player.play(id);
    player.update(START);
    player.update(START + secondsOf(props, id) / 2);
    expect(snapshot(props.group, colors), 'halfway, something is on show').not.toEqual(idle);

    player.update(START + secondsOf(props, id) + 0.5);
    const held = snapshot(props.group, colors);
    expect(player.current()).toBe(id);
    expect(held, 'the last frame still shows the picture').not.toEqual(idle);
    // Beats reuse the palette rather than make materials that would need disposing.
    expect(held.filter((line) => line.endsWith(' other'))).toEqual([]);

    player.play(null);
    expect(player.current()).toBeNull();
    expect(snapshot(props.group, colors)).toEqual(idle);
  });

  it.each(BEAT_IDS)('jumps %s straight to its last frame under reduced motion', (id) => {
    const { colors, props } = build();
    const idle = snapshot(props.group, colors);
    const played = createBeatPlayer(props.beats, false);
    playToEnd(played, props, id);
    const lastFrame = snapshot(props.group, colors);
    played.play(null);

    // The same picture with no frames in between proves each frame depends only on progress.
    const reduced = createBeatPlayer(props.beats, true);
    reduced.play(id);
    expect(snapshot(props.group, colors)).toEqual(lastFrame);
    reduced.play(null);
    expect(snapshot(props.group, colors)).toEqual(idle);
  });

  it('starts each beat from the idle island, whatever played before it', () => {
    const { colors, props } = build();
    const idle = snapshot(props.group, colors);
    const player = createBeatPlayer(props.beats, false);
    const alone = new Map<string, string[]>();
    for (const id of BEAT_IDS) {
      playToEnd(player, props, id);
      alone.set(id, snapshot(props.group, colors));
      player.play(null);
    }
    // Every beat straight after every other: none may leave a trace in the next.
    for (const before of BEAT_IDS) {
      for (const after of BEAT_IDS) {
        playToEnd(player, props, before);
        playToEnd(player, props, after);
        expect(snapshot(props.group, colors), `${before} then ${after}`).toEqual(alone.get(after));
      }
    }
    player.play(null);
    expect(snapshot(props.group, colors)).toEqual(idle);
  });

  it('copies your commit when it syncs, so it never leaves your laptop', () => {
    const { props } = build();
    const idle = everything(props.group);
    const seconds = secondsOf(props, 'sync-origin');
    const player = createBeatPlayer(props.beats, false);
    player.play('sync-origin');
    player.update(START);
    // Before the push: one commit, yours, on the laptop.
    player.update(START + seconds * 0.15);
    const [yours, ...others] = spotsOfShown(props.group, idle);
    expect(others).toEqual([]);
    if (yours === undefined) throw new Error('sync-origin never showed your commit.');

    player.update(START + seconds + 0.5);
    const after = spotsOfShown(props.group, idle);
    // Three copies of one commit: yours, GitHub's, and the one a teammate fetched.
    expect(after).toHaveLength(3);
    expect(after.some((spot) => spot.distanceTo(yours) < 0.001)).toBe(true);
  });

  it('closes the issue when the PR merges, not while it waits at the gate', () => {
    const { props } = build();
    const idleMeshes: THREE.Object3D[] = [];
    props.group.traverse((object) => {
      if (object.type === 'Mesh') idleMeshes.push(object);
    });
    const seconds = secondsOf(props, 'checks-gate');
    const player = createBeatPlayer(props.beats, false);
    player.play('checks-gate');
    player.update(START);
    // Halfway the PR still waits for its approval, so every issue is still open.
    player.update(START + seconds * 0.5);
    expect(idleMeshes.filter((mesh) => !mesh.visible)).toEqual([]);
    player.update(START + seconds + 0.5);
    expect(idleMeshes.filter((mesh) => !mesh.visible)).toHaveLength(1);
  });

  it('stands the release flag on the one commit it tags, not over the whole board', () => {
    const { props } = build();
    const idle = everything(props.group);
    playToEnd(createBeatPlayer(props.beats, false), props, 'release-tag');
    props.group.updateMatrixWorld(true);
    const boxes = shownBeatMeshes(props.group, idle).map((mesh) =>
      new THREE.Box3().setFromObject(mesh),
    );
    // The pole is the only tall thing the beat adds.
    const poles = boxes.filter((box) => box.max.y - box.min.y > 1);
    expect(poles).toHaveLength(1);
    const [pole] = poles;
    if (pole === undefined) throw new Error('release-tag never raised its flag pole.');
    const poleX = (pole.min.x + pole.max.x) / 2;
    const footing = boxes.filter(
      (box) =>
        box !== pole &&
        Math.abs(box.max.y - pole.min.y) < 0.001 &&
        box.min.x < poleX &&
        poleX < box.max.x,
    );
    expect(footing, 'one card under the pole, its top edge at the pole’s foot').toHaveLength(1);
  });
});
