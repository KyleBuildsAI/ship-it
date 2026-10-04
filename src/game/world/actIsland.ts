import * as THREE from 'three/webgpu';
import { createIsland, type Island } from './island';
import { Label } from './labels';
import type { Flat } from './movement';
import type { ActIsland as ActIslandData, IslandTheme } from './zones';

/*
 * One kit for the islands of Acts 3 to 8 (DESIGN.md section 4): a floating island in the
 * Act's accent colour, its title, a few props built from plain shapes so the place reads as
 * that Act's, a portal home, and a spawn point. The lessons themselves are played in the
 * menu that opens on arrival; the island is where you go to play them.
 */

export interface ActIsland {
  readonly island: Island;
  readonly spawn: Flat;
  /** The portal back to Campus: its ring stands at `at`. */
  readonly exit: { readonly group: THREE.Group; readonly at: Flat };
  update: (elapsed: number) => void;
}

const ISLAND_RADIUS = 15;
const EXIT_SPOT: Flat = { x: -9, z: 9 };

/** What a theme builder hands back: the props, and the parts that move. */
interface Props {
  readonly group: THREE.Group;
  /** Called every frame with the time, for the small motions that keep the island alive. */
  readonly animate: (elapsed: number) => void;
}

/** A shared material set per island, so every prop of one island glows the same colour. */
interface Palette {
  readonly base: THREE.MeshStandardMaterial;
  readonly dark: THREE.MeshStandardMaterial;
  readonly glow: THREE.MeshStandardMaterial;
  readonly light: THREE.MeshStandardMaterial;
}

function palette(accent: number): Palette {
  return {
    base: new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.75 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x151b2b, roughness: 0.9 }),
    glow: new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 1.6,
    }),
    light: new THREE.MeshStandardMaterial({ color: 0xd8e2f0, roughness: 0.6 }),
  };
}

/** A mesh placed at (x, y, z), so the builders below read as a list of parts. */
function part(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
}

/** Act 3: a trunk path that splits into two branches, commits along each, one merging back. */
function branches(colors: Palette): Props {
  const group = new THREE.Group();
  const node = new THREE.SphereGeometry(0.32, 20, 14);
  const segment = (from: THREE.Vector3, to: THREE.Vector3) => {
    const length = from.distanceTo(to);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, length), colors.base);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.lookAt(to);
    group.add(mesh);
  };
  const main = [-6, -3, 0, 3, 6].map((x) => new THREE.Vector3(x, 0.3, 2));
  const feature = [
    new THREE.Vector3(-3, 0.3, 2),
    new THREE.Vector3(-1, 0.3, -1.5),
    new THREE.Vector3(1.5, 0.3, -1.5),
    new THREE.Vector3(3, 0.3, 2),
  ];
  const hotfix = [new THREE.Vector3(0, 0.3, 2), new THREE.Vector3(2, 0.3, 5)];
  for (const line of [main, feature, hotfix]) {
    line.slice(1).forEach((point, index) => {
      segment(line[index] ?? point, point);
    });
  }
  const tips: THREE.Mesh[] = [];
  for (const point of [...main, ...feature.slice(1, 3), ...hotfix.slice(1)]) {
    group.add(part(node, colors.light, point.x, point.y, point.z));
  }
  // The branch tips glow: that's where HEAD could point.
  for (const point of [main.at(-1), hotfix.at(-1)]) {
    if (point === undefined) continue;
    const tip = part(node, colors.glow, point.x, point.y + 0.5, point.z);
    tip.scale.setScalar(0.7);
    tips.push(tip);
    group.add(tip);
  }
  return {
    group,
    animate: (elapsed) => {
      tips.forEach((tip, index) => {
        tip.position.y = 0.8 + Math.sin(elapsed * 2 + index) * 0.12;
      });
    },
  };
}

/** Act 4: a town square with a notice board of issues, and houses for the team around it. */
function town(colors: Palette): Props {
  const group = new THREE.Group();
  group.add(part(new THREE.CylinderGeometry(4, 4, 0.1, 48), colors.base, 0, 0.05, 0));
  // The notice board: two posts, a board, and coloured cards pinned on it.
  const post = new THREE.BoxGeometry(0.15, 2.2, 0.15);
  group.add(part(post, colors.dark, -1.3, 1.1, -1.5), part(post, colors.dark, 1.3, 1.1, -1.5));
  group.add(part(new THREE.BoxGeometry(2.9, 1.5, 0.1), colors.dark, 0, 1.6, -1.5));
  const cards: THREE.Mesh[] = [];
  const card = new THREE.BoxGeometry(0.55, 0.4, 0.04);
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 4; column++) {
      const material = (row + column) % 3 === 0 ? colors.glow : colors.light;
      const mesh = part(card, material, -1 + column * 0.66, 1.95 - row * 0.62, -1.43);
      mesh.rotation.z = ((row * 4 + column) % 3) * 0.05 - 0.05;
      cards.push(mesh);
      group.add(mesh);
    }
  }
  // The houses around the square, one per teammate.
  const body = new THREE.BoxGeometry(1.6, 1.3, 1.6);
  const roof = new THREE.ConeGeometry(1.3, 0.9, 4);
  [-0.9, -0.3, 0.3, 0.9].forEach((angle) => {
    const x = Math.sin(angle) * 8;
    const z = -Math.cos(angle) * 8;
    const house = new THREE.Group();
    house.add(part(body, colors.base, 0, 0.65, 0));
    const top = part(roof, colors.glow, 0, 1.75, 0);
    top.rotation.y = Math.PI / 4;
    house.add(top);
    house.position.set(x, 0, z);
    house.lookAt(0, 0, 0);
    group.add(house);
  });
  return {
    group,
    animate: (elapsed) => {
      const lit = Math.floor(elapsed) % cards.length;
      cards.forEach((mesh, index) => {
        mesh.scale.setScalar(index === lit ? 1.12 : 1);
      });
    },
  };
}

/** Act 5: a road through a row of gates, each with a light, and two watchtowers. */
function gates(colors: Palette): Props {
  const group = new THREE.Group();
  group.add(part(new THREE.BoxGeometry(1.8, 0.06, 14), colors.base, 0, 0.03, 0));
  const pillar = new THREE.BoxGeometry(0.35, 2.4, 0.35);
  const beam = new THREE.BoxGeometry(2.8, 0.3, 0.4);
  const bulb = new THREE.SphereGeometry(0.2, 16, 12);
  const pass = new THREE.MeshStandardMaterial({
    color: 0x7ee2a8,
    emissive: 0x7ee2a8,
    emissiveIntensity: 2,
  });
  const lights: THREE.Mesh[] = [];
  [-4.5, -1.5, 1.5, 4.5].forEach((z) => {
    group.add(part(pillar, colors.dark, -1.2, 1.2, z), part(pillar, colors.dark, 1.2, 1.2, z));
    group.add(part(beam, colors.glow, 0, 2.5, z));
    const light = part(bulb, pass, 0, 2.95, z);
    lights.push(light);
    group.add(light);
  });
  const tower = new THREE.CylinderGeometry(0.7, 0.9, 4, 16);
  const cap = new THREE.ConeGeometry(1, 1.2, 16);
  for (const x of [-5.5, 5.5]) {
    group.add(part(tower, colors.base, x, 2, -3), part(cap, colors.glow, x, 4.6, -3));
  }
  return {
    group,
    animate: (elapsed) => {
      // The lights go green one gate after another, like checks passing in order.
      const lit = Math.floor(elapsed * 1.5) % (lights.length + 1);
      lights.forEach((light, index) => {
        light.visible = index < lit;
      });
    },
  };
}

/** Act 6: racks of servers joined by pipes, and a database drum where the pipes end. */
function servers(colors: Palette): Props {
  const group = new THREE.Group();
  const rack = new THREE.BoxGeometry(1.2, 2.6, 1);
  const strip = new THREE.BoxGeometry(0.9, 0.06, 0.02);
  const blinkers: THREE.Mesh[] = [];
  [-4, -2, 0, 2].forEach((x) => {
    group.add(part(rack, colors.dark, x, 1.3, -2));
    for (let level = 0; level < 5; level++) {
      const light = part(strip, colors.glow, x, 0.5 + level * 0.45, -1.49);
      blinkers.push(light);
      group.add(light);
    }
  });
  // The pipe runs along the racks' feet to the database.
  const pipe = new THREE.CylinderGeometry(0.15, 0.15, 9, 12);
  const run = part(pipe, colors.base, 0.5, 0.2, -0.8);
  run.rotation.z = Math.PI / 2;
  group.add(run);
  const drop = part(new THREE.CylinderGeometry(0.15, 0.15, 2, 12), colors.base, 5, 0.2, 0.2);
  drop.rotation.x = Math.PI / 2;
  group.add(drop);
  const drum = new THREE.CylinderGeometry(1, 1, 0.55, 32);
  [0, 1, 2].forEach((level) => {
    group.add(part(drum, level === 1 ? colors.glow : colors.light, 5, 0.3 + level * 0.6, 1.8));
  });
  return {
    group,
    animate: (elapsed) => {
      blinkers.forEach((light, index) => {
        light.visible = Math.sin(elapsed * 3 + index * 1.7) > -0.4;
      });
    },
  };
}

/** Act 7: a workbench with a robot on it, and gears turning on the wall behind. */
function workshop(colors: Palette): Props {
  const group = new THREE.Group();
  group.add(part(new THREE.BoxGeometry(5, 0.2, 2), colors.base, 0, 1, -1));
  const leg = new THREE.BoxGeometry(0.2, 1, 0.2);
  for (const [x, z] of [
    [-2.3, -1.8],
    [2.3, -1.8],
    [-2.3, -0.2],
    [2.3, -0.2],
  ] as const) {
    group.add(part(leg, colors.dark, x, 0.5, z));
  }
  // The robot: a body, a head with a glowing visor, and arms.
  const robot = new THREE.Group();
  robot.add(part(new THREE.BoxGeometry(0.9, 1, 0.6), colors.light, 0, 0.5, 0));
  const head = new THREE.Group();
  head.add(part(new THREE.SphereGeometry(0.4, 20, 16), colors.light, 0, 0, 0));
  head.add(part(new THREE.BoxGeometry(0.55, 0.14, 0.1), colors.glow, 0, 0.02, 0.36));
  head.position.y = 1.35;
  robot.add(head);
  const arm = new THREE.BoxGeometry(0.18, 0.75, 0.18);
  robot.add(part(arm, colors.base, -0.6, 0.55, 0), part(arm, colors.base, 0.6, 0.55, 0));
  robot.position.set(0, 1.1, -1);
  group.add(robot);
  // The wall behind, with gears.
  group.add(part(new THREE.BoxGeometry(7, 3.4, 0.2), colors.dark, 0, 1.7, -3));
  const gear = new THREE.TorusGeometry(0.6, 0.16, 8, 12);
  const gears = [-2.2, 2.2].map((x, index) => {
    const mesh = part(gear, colors.glow, x, 2.3 - index * 0.5, -2.85);
    group.add(mesh);
    return mesh;
  });
  return {
    group,
    animate: (elapsed) => {
      gears.forEach((mesh, index) => {
        mesh.rotation.z = elapsed * (index === 0 ? 0.8 : -0.8);
      });
      head.rotation.y = Math.sin(elapsed * 0.9) * 0.5;
    },
  };
}

/** Act 8: an interview hall: pillars in a half circle, a table, chairs and a whiteboard. */
function hall(colors: Palette): Props {
  const group = new THREE.Group();
  group.add(part(new THREE.CylinderGeometry(6, 6, 0.12, 48), colors.base, 0, 0.06, -2));
  const pillar = new THREE.CylinderGeometry(0.3, 0.35, 3.6, 16);
  for (let index = 0; index < 7; index++) {
    const angle = -Math.PI / 2 + (index / 6) * Math.PI;
    group.add(part(pillar, colors.light, Math.sin(angle) * 6, 1.8, -2 - Math.cos(angle) * 6));
  }
  group.add(part(new THREE.BoxGeometry(3.4, 0.15, 1.2), colors.dark, 0, 0.95, -2));
  const tableLeg = new THREE.BoxGeometry(0.15, 0.9, 0.15);
  for (const x of [-1.5, 1.5]) group.add(part(tableLeg, colors.dark, x, 0.45, -2));
  const seat = new THREE.BoxGeometry(0.6, 0.1, 0.6);
  const back = new THREE.BoxGeometry(0.6, 0.7, 0.1);
  // The panel on the far side, and the candidate's chair on the near side.
  for (const [x, z, facing] of [
    [-1, -3.1, 1],
    [0, -3.1, 1],
    [1, -3.1, 1],
    [0, -0.9, -1],
  ] as const) {
    group.add(part(seat, colors.base, x, 0.55, z));
    group.add(part(back, colors.base, x, 0.9, z - facing * 0.28));
  }
  group.add(part(new THREE.BoxGeometry(3.2, 1.8, 0.1), colors.light, 0, 2.2, -6.5));
  const marker = part(new THREE.BoxGeometry(2.4, 0.06, 0.02), colors.glow, 0, 2.6, -6.44);
  group.add(marker);
  return {
    group,
    animate: (elapsed) => {
      // Someone is drawing on the whiteboard: the line grows and starts again.
      marker.scale.x = 0.2 + ((elapsed * 0.25) % 1) * 0.8;
    },
  };
}

const THEMES: Record<IslandTheme, (colors: Palette) => Props> = {
  branches,
  town,
  gates,
  servers,
  workshop,
  hall,
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
export function createActIsland(data: ActIslandData): ActIsland {
  const island = createIsland(ISLAND_RADIUS, 0x161f2c);
  const { group } = island;
  group.position.set(data.center.x, 0, data.center.z);

  const props = THEMES[data.theme](palette(data.accent));
  group.add(props.group);

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
    update: props.animate,
  };
}
