import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import type { ActIslandZone } from '../../worldState';
import { ISLAND_BUILDERS } from '../actIsland';
import { createBeatPlayer } from '../beatPlayer';
import { ISLAND_BEATS } from '../beats';
import { palette, type Props } from './kit';

/*
 * Every Act island as the world builds it, checked against beats.ts and played again and
 * again, as a lesson replayed all session would be.
 *
 * A beat takes its meshes from its stage and never builds new ones as it starts: three's
 * WebGPU renderer keeps each mesh it has drawn alive through the palette's materials, which
 * are never disposed, so a beat that built fresh meshes would leak a few more every play.
 * No renderer runs here, so the test counts the distinct meshes each island ever holds.
 */

function build(zone: ActIslandZone): Props {
  return ISLAND_BUILDERS[zone](palette(0x7c9cff));
}

function collectMeshes(group: THREE.Group, into: Set<THREE.Object3D>): void {
  group.traverse((object) => {
    if (object.type === 'Mesh') into.add(object);
  });
}

describe.each(Object.keys(ISLAND_BEATS) as ActIslandZone[])('the %s island', (zone) => {
  it('plays exactly the beats beats.ts lists for it, so every card it is named on plays', () => {
    expect(Object.keys(build(zone).beats).sort()).toEqual([...ISLAND_BEATS[zone]].sort());
  });

  it('replays every beat on the meshes it made the first time', () => {
    const props = build(zone);
    const player = createBeatPlayer(props.beats, false);
    const seen = new Set<THREE.Object3D>();
    const playEveryBeat = () => {
      for (const id of ISLAND_BEATS[zone]) {
        player.play(id);
        player.update(0);
        player.update(10);
        collectMeshes(props.group, seen);
      }
      player.play(null);
    };
    playEveryBeat();
    const afterFirstRound = seen.size;
    playEveryBeat();
    playEveryBeat();
    expect(seen.size).toBe(afterFirstRound);
  });
});
