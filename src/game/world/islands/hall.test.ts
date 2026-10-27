import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createBeatPlayer } from '../beatPlayer';
import { ISLAND_BEATS } from '../beats';
import { hall } from './hall';
import { palette } from './kit';

/*
 * Act 8's hall acts out its lesson cards. These tests play every beat the way the beat
 * player does and hold it to the two promises a beat makes: its last frame is the same
 * however it got there (reduced motion jumps straight to it), and reset leaves the hall
 * exactly as it was, whichever beat comes next.
 */

/** Everything a beat could change, for every object in the hall, as plain data. */
function snapshot(root: THREE.Object3D): unknown[] {
  const objects: unknown[] = [];
  root.traverse((object) => {
    const material = object instanceof THREE.Mesh ? (object.material as THREE.Material) : null;
    objects.push({
      type: object.type,
      position: object.position.toArray(),
      scale: object.scale.toArray(),
      rotation: object.quaternion.toArray(),
      visible: object.visible,
      material: material?.uuid ?? null,
    });
  });
  return objects;
}

/** A fresh hall in Act 8's gold, with its beats. */
function buildHall() {
  return hall(palette(0xffe08a));
}

/** The beat ids beats.ts lists for the hall, the ones its lessons may name. */
const HALL_BEATS: readonly string[] = ISLAND_BEATS.act8;

describe("Act 8's hall", () => {
  it('can play every beat beats.ts lists for Act 8, and no others', () => {
    const { beats } = buildHall();
    expect(Object.keys(beats).sort()).toEqual([...HALL_BEATS].sort());
  });

  it('plays every beat to a last frame that differs from idle, then resets exactly', () => {
    const { group, beats } = buildHall();
    const idle = snapshot(group);
    for (const id of HALL_BEATS) {
      const beat = beats[id];
      if (beat === undefined) throw new Error(`The hall has no beat "${id}".`);
      expect(beat.seconds, id).toBeGreaterThanOrEqual(1.5);
      expect(beat.seconds, id).toBeLessThanOrEqual(3);
      const run = beat.start();
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) run.frame(progress);
      expect(snapshot(group), id).not.toEqual(idle);
      run.reset();
      expect(snapshot(group), id).toEqual(idle);
    }
  });

  it('draws the same last frame when reduced motion jumps straight to it', () => {
    const { group, beats } = buildHall();
    for (const id of HALL_BEATS) {
      const beat = beats[id];
      if (beat === undefined) throw new Error(`The hall has no beat "${id}".`);
      const jumped = beat.start();
      jumped.frame(1);
      const lastFrame = snapshot(group);
      jumped.reset();

      const played = beat.start();
      for (let step = 0; step <= 40; step++) played.frame(step / 40);
      expect(snapshot(group), id).toEqual(lastFrame);
      played.reset();
    }
  });

  it('goes back to idle when the lesson ends, whichever beats played before', () => {
    for (const reducedMotion of [false, true]) {
      const { group, beats } = buildHall();
      const idle = snapshot(group);
      const player = createBeatPlayer(beats, reducedMotion);
      // Each card cues the next beat while the last one is still playing or held.
      HALL_BEATS.forEach((id, index) => {
        player.play(id);
        player.update(index * 10);
        player.update(index * 10 + 1);
        expect(player.current()).toBe(id);
      });
      player.update(1000);
      player.play(null);
      expect(player.current()).toBeNull();
      expect(snapshot(group)).toEqual(idle);
    }
  });
});
