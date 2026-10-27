import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createBeatPlayer } from '../beatPlayer';
import { ISLAND_BEATS } from '../beats';
import { palette } from './kit';
import { workshop } from './workshop';

/*
 * Act 7's island plays every beat it lists and puts itself back afterwards. A beat that
 * left a mesh behind, or a recoloured visor, would show on the next card's scene.
 */

/** Every mesh's place, size, turn, visibility and material: what a reset must restore. */
function snapshot(group: THREE.Group): string[] {
  const looks: string[] = [];
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.Material;
    looks.push(
      [
        object.position.toArray().join(','),
        object.scale.toArray().join(','),
        object.rotation.toArray().join(','),
        String(object.visible),
        material.uuid,
      ].join('|'),
    );
  });
  return looks;
}

describe('the Act 7 workshop island', () => {
  it('has every beat beats.ts lists for act7, and no others', () => {
    const props = workshop(palette(0x66ccff));
    expect(Object.keys(props.beats).sort()).toEqual([...ISLAND_BEATS.act7].sort());
  });

  it('plays each beat start to finish, then resets to its idle look', () => {
    const props = workshop(palette(0x66ccff));
    const idle = snapshot(props.group);
    for (const [id, beat] of Object.entries(props.beats)) {
      expect(beat.seconds, id).toBeGreaterThanOrEqual(1.5);
      expect(beat.seconds, id).toBeLessThanOrEqual(3);
      const played = beat.start();
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) played.frame(progress);
      expect(snapshot(props.group), id).not.toEqual(idle);
      played.reset();
      expect(snapshot(props.group), id).toEqual(idle);
    }
  });

  it('draws the same last frame however it got there', () => {
    // Reduced motion jumps straight to frame 1, so the held picture can't depend on the
    // frames before it.
    const props = workshop(palette(0x66ccff));
    for (const [id, beat] of Object.entries(props.beats)) {
      const jumped = beat.start();
      jumped.frame(1);
      const direct = snapshot(props.group);
      jumped.reset();
      const played = beat.start();
      for (const progress of [0, 0.3, 0.6, 0.9, 1]) played.frame(progress);
      // Beats reuse the palette's materials, so even the material ids match.
      expect(snapshot(props.group), id).toEqual(direct);
      played.reset();
    }
  });

  it('goes back to idle when the next card cuts a beat off, and when the lesson ends', () => {
    const props = workshop(palette(0x66ccff));
    const idle = snapshot(props.group);
    const player = createBeatPlayer(props.beats, false);
    let clock = 0;
    for (const id of ISLAND_BEATS.act7) {
      const seconds = props.beats[id]?.seconds ?? 0;
      player.play(id);
      // The first update starts the beat's clock; the second is halfway through it. Then
      // the loop plays the next card's beat over it.
      player.update(clock);
      player.update(clock + seconds / 2);
      expect(player.current()).toBe(id);
      clock += seconds;
    }
    player.play(null);
    expect(player.current()).toBeNull();
    expect(snapshot(props.group)).toEqual(idle);
  });

  it('shows the held picture at once with reduced motion', () => {
    const props = workshop(palette(0x66ccff));
    const idle = snapshot(props.group);
    const player = createBeatPlayer(props.beats, true);
    for (const id of ISLAND_BEATS.act7) {
      const beat = props.beats[id];
      if (beat === undefined) throw new Error(`The workshop has no ${id} beat.`);
      // The player's last beat is still held; end it so the picture below is this beat's alone.
      player.play(null);
      const played = beat.start();
      played.frame(1);
      const held = snapshot(props.group);
      played.reset();
      player.play(id);
      // No update needed: the last frame is drawn the moment the beat is played.
      expect(snapshot(props.group), id).toEqual(held);
    }
    player.play(null);
    expect(snapshot(props.group)).toEqual(idle);
  });
});
