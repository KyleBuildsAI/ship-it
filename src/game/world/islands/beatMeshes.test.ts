import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import type { ActIslandZone } from '../../worldState';
import { createBeatPlayer } from '../beatPlayer';
import { ISLAND_BEATS } from '../beats';
import { branches } from './branches';
import { gates } from './gates';
import { hall } from './hall';
import { palette, type Palette, type Props } from './kit';
import { servers } from './servers';
import { town } from './town';
import { workshop } from './workshop';

/*
 * Every Act island's beats, played again and again, as a lesson replayed all session would.
 * A beat takes its meshes from its stage and never builds new ones as it starts: three's
 * WebGPU renderer keeps each mesh it has drawn alive through the palette's materials, which
 * are never disposed, so a beat that built fresh meshes would leak a few more every play.
 * No renderer runs here, so the test counts the distinct meshes each island ever holds.
 */

const ISLANDS: Record<ActIslandZone, (colors: Palette) => Props> = {
  act3: branches,
  act4: town,
  act5: gates,
  act6: servers,
  act7: workshop,
  act8: hall,
};

function collectMeshes(group: THREE.Group, into: Set<THREE.Object3D>): void {
  group.traverse((object) => {
    if (object.type === 'Mesh') into.add(object);
  });
}

describe.each(Object.keys(ISLANDS) as ActIslandZone[])('the %s island', (zone) => {
  it('replays every beat on the meshes it made the first time', () => {
    const props = ISLANDS[zone](palette(0x7c9cff));
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
