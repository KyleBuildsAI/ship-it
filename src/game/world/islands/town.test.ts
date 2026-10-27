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
});
