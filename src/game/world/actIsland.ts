import * as THREE from 'three/webgpu';
import type { ActIslandZone } from '../worldState';
import { createBeatPlayer } from './beatPlayer';
import type { BeatId } from './beats';
import { createIsland, type Island } from './island';
import { branches } from './islands/branches';
import { gates } from './islands/gates';
import { hall } from './islands/hall';
import { palette, type Palette, type Props } from './islands/kit';
import { servers } from './islands/servers';
import { town } from './islands/town';
import { workshop } from './islands/workshop';
import { Label } from './labels';
import type { Flat } from './movement';
import type { ActIsland as ActIslandData } from './zones';

/*
 * One kit for the islands of Acts 3 to 8 (DESIGN.md section 4): a floating island in the
 * Act's accent colour, its title, a few props built from plain shapes so the place reads as
 * that Act's, a portal home, and a spawn point. The lessons themselves are played in the
 * menu that opens on arrival; the island is where you go to play them, and while a lesson
 * card is up its island acts the card out (a "beat", see beats.ts and beatPlayer.ts).
 * Each island's props and beats live in their own file under islands/.
 */

export interface ActIsland {
  readonly island: Island;
  readonly spawn: Flat;
  /** The portal back to Campus: its ring stands at `at`. */
  readonly exit: { readonly group: THREE.Group; readonly at: Flat };
  /**
   * Called every frame. `onScreen` says the player is here and the view has faded in: a
   * lesson scene only plays then, so one cued during the trip starts on arrival.
   */
  update: (elapsed: number, onScreen: boolean) => void;
  /** Plays one of this island's lesson scenes, or with null returns it to its idle look. */
  playBeat: (id: string | null) => void;
  /** The beat playing or held now, for tests. */
  currentBeat: () => string | null;
}

const ISLAND_RADIUS = 15;
const EXIT_SPOT: Flat = { x: -9, z: 9 };

/**
 * Each Act island's builder, by zone. The type ties a builder to its zone's list in
 * beats.ts, so a list that grows without its island, or a misspelt beat, fails the
 * typecheck instead of leaving cards whose scene never plays. (A table typed with plain
 * string keys would slip past the type, so beatMeshes.test.ts checks the ids too.)
 */
export const ISLAND_BUILDERS: {
  readonly [Zone in ActIslandZone]: (colors: Palette) => Props<BeatId<Zone>>;
} = {
  act3: branches,
  act4: town,
  act5: gates,
  act6: servers,
  act7: workshop,
  act8: hall,
};

/** The ring back to Campus, like the machine island's, in this island's accent colour. */
function createExit(accent: number): THREE.Group {
  const exit = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.06, 12, 64),
    new THREE.MeshStandardMaterial({ color: 0x6fd3ff, emissive: 0x6fd3ff, emissiveIntensity: 2 }),
  );
  ring.position.y = 1.35;
  const veil = new THREE.Mesh(
    new THREE.CircleGeometry(0.95, 40),
    new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    }),
  );
  veil.position.y = 1.35;
  const label = new Label('Campus', { height: 0.3 });
  label.sprite.position.y = 2.7;
  exit.add(ring, veil, label.sprite);
  exit.position.set(EXIT_SPOT.x, 0, EXIT_SPOT.z);
  exit.rotation.y = -0.6;
  return exit;
}

/** Builds the themed island of one Act from its data in zones.ts. */
export function createActIsland(data: ActIslandData, reducedMotion = false): ActIsland {
  const island = createIsland(ISLAND_RADIUS, 0x161f2c);
  const { group } = island;
  group.position.set(data.center.x, 0, data.center.z);

  const props = ISLAND_BUILDERS[data.zone](palette(data.accent));
  group.add(props.group);
  const beats = createBeatPlayer(props.beats, reducedMotion);

  // No light of its own: every light in three.js shades every island, so six more would
  // slow Campus too. The props' glowing parts carry the accent instead, and bloom does the rest.
  // No floating title either: the HUD names the island at the top of the screen, and a
  // second title in the world landed behind the HUD's hint line.

  const exit = createExit(data.accent);
  group.add(exit);

  return {
    island,
    spawn: { x: data.center.x, z: data.center.z + 10 },
    exit: { group: exit, at: { x: data.center.x + EXIT_SPOT.x, z: data.center.z + EXIT_SPOT.z } },
    update: (elapsed, onScreen) => {
      props.animate(elapsed);
      // After the idle motion, so a beat that moves a prop wins over its idle bob. A held
      // beat redraws its last frame here too, or the idle motion would undo it.
      if (onScreen) beats.update(elapsed);
    },
    playBeat: beats.play,
    currentBeat: beats.current,
  };
}
