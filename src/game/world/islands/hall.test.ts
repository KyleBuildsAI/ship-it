import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createBeatPlayer } from '../beatPlayer';
import { ISLAND_BEATS, type BeatId } from '../beats';
import { hall } from './hall';
import { palette, type Props } from './kit';

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

/** A fresh hall in Act 8's gold, with its beats, looked up by any id as the player does. */
function buildHall(): Props {
  return hall(palette(0xffe08a));
}

/** The beat ids beats.ts lists for the hall, the ones its lessons may name. */
const HALL_BEATS: readonly string[] = ISLAND_BEATS.act8;

/** How many things the hall shows in red, the palette's colour for trouble, right now. */
function redCount(root: THREE.Object3D, alert: THREE.Material): number {
  let count = 0;
  root.traverseVisible((object) => {
    if (object instanceof THREE.Mesh && object.material === alert) count++;
  });
  return count;
}

/*
 * What each beat's red means, which is the lesson it teaches: a fix shows the trouble and
 * then calms it, and a search ends with what it found still marked. Finding a bug's cause
 * isn't fixing it, so the evidence trail ends with its symptom still red.
 */
type Trouble = 'none' | 'calmed' | 'stays';
const TROUBLE: Record<BeatId<'act8'>, Trouble> = {
  'think-aloud': 'none',
  'spot-the-bug': 'stays',
  'trace-evidence': 'stays',
  'cache-the-reads': 'calmed',
  'queue-slow-work': 'calmed',
  'listen-first': 'calmed',
  'tell-your-story': 'none',
  'agent-loop': 'none',
};

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

  it('uses red the way its lesson means it: calmed by a fix, still there once found', () => {
    const colors = palette(0xffe08a);
    const { group, beats }: Props = hall(colors);
    for (const [id, trouble] of Object.entries(TROUBLE)) {
      const run = beats[id]?.start();
      if (run === undefined) throw new Error(`The hall has no beat "${id}".`);
      const reds: number[] = [];
      for (let step = 0; step <= 40; step++) {
        run.frame(step / 40);
        reds.push(redCount(group, colors.alert));
      }
      run.reset();
      const everRed = reds.some((count) => count > 0);
      const redAtEnd = (reds.at(-1) ?? 0) > 0;
      expect({ everRed, redAtEnd }, id).toEqual({
        everRed: trouble !== 'none',
        redAtEnd: trouble === 'stays',
      });
    }
  });

  it('plays every beat where the player can see it', () => {
    const { group, beats } = buildHall();
    const idleMeshes = new Set<THREE.Object3D>();
    group.traverse((object) => idleMeshes.add(object));
    const where = new THREE.Vector3();
    for (const id of HALL_BEATS) {
      const run = beats[id]?.start();
      if (run === undefined) throw new Error(`The hall has no beat "${id}".`);
      for (let step = 0; step <= 20; step++) {
        run.frame(step / 20);
        group.traverseVisible((object) => {
          if (!(object instanceof THREE.Mesh) || idleMeshes.has(object)) return;
          object.getWorldPosition(where);
          // The lesson panel covers the left of the screen, and nothing may sink behind
          // the whiteboard's face (z -6.45) or come up past the player's spot.
          expect(where.x, id).toBeGreaterThanOrEqual(-6);
          expect(where.x, id).toBeLessThanOrEqual(10);
          expect(where.z, id).toBeGreaterThanOrEqual(-6.45);
          expect(where.z, id).toBeLessThanOrEqual(7);
          expect(where.y, id).toBeGreaterThan(0);
        });
      }
      run.reset();
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
