import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createBeatPlayer } from '../beatPlayer';
import { beatsForAct } from '../beats';
import { palette } from './kit';
import { servers } from './servers';

/*
 * Act 6's island beats, played without a renderer: the meshes are plain objects, so a
 * beat's effect can be read straight off the island's tree. Each check compares the whole
 * island (every mesh's place, size, turn, visibility and material) against its idle look.
 */

const ACT6_BEATS = beatsForAct(6);

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

function beatOf(props: ReturnType<typeof servers>, id: string) {
  const beat = props.beats[id];
  if (beat === undefined) throw new Error(`The servers island has no beat "${id}".`);
  return beat;
}

describe('the servers island (Act 6)', () => {
  it('plays exactly the beats beats.ts lists for Act 6', () => {
    const props = servers(palette(0x7ee2a8));
    expect(Object.keys(props.beats).sort()).toEqual([...ACT6_BEATS].sort());
    expect(ACT6_BEATS.length).toBeGreaterThanOrEqual(5);
    // A handful of scenes, not one per card: Act 3's island, the worked example, has 11.
    expect(ACT6_BEATS.length).toBeLessThanOrEqual(12);
  });

  it.each(ACT6_BEATS)('%s plays, holds a steady last frame, and resets cleanly', (id) => {
    const props = servers(palette(0x7ee2a8));
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
    const props = servers(palette(0x7ee2a8));
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
    const props = servers(palette(0x7ee2a8));
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
});
