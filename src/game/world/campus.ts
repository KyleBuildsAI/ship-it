import * as THREE from 'three/webgpu';
import { createIsland, type Island } from './island';
import { Label } from './labels';
import type { Flat } from './movement';

export interface Portal {
  readonly act: number;
  readonly title: string;
  readonly locked: boolean;
  readonly group: THREE.Group;
  /** Where the ring stands on the ground. */
  readonly at: Flat;
}

export interface Campus {
  readonly island: Island;
  readonly portals: readonly Portal[];
  readonly spawn: Flat;
  update: (elapsed: number) => void;
}

/** The eight Acts of DESIGN.md section 11. Which ones are open comes from the caller. */
export const ACTS = [
  { act: 1, title: 'The Machine' },
  { act: 2, title: 'Git Core' },
  { act: 3, title: 'Branching' },
  { act: 4, title: 'GitHub Team Flow' },
  { act: 5, title: 'Quality Gates' },
  { act: 6, title: 'How Systems Work' },
  { act: 7, title: 'AI-Native Engineering' },
  { act: 8, title: 'The Loop' },
] as const;

const OPEN = 0x6fd3ff;
const LOCKED = 0x39425a;

function createPortal(
  act: number,
  title: string,
  locked: boolean,
  angle: number,
  radius: number,
): Portal {
  const color = locked ? LOCKED : OPEN;
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.07, 12, 72),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: locked ? 0.25 : 2.6,
    }),
  );
  ring.position.y = 1.45;
  const veil = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: locked ? 0.05 : 0.14,
      side: THREE.DoubleSide,
    }),
  );
  veil.position.y = 1.45;
  const label = new Label(
    locked ? `Act ${String(act)} · ${title} · locked` : `Act ${String(act)} · ${title}`,
    {
      color: locked ? '#8f9bb3' : '#e8ecf5',
      height: 0.32,
    },
  );
  label.sprite.position.y = 2.9;
  group.add(ring, veil, label.sprite);

  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;
  group.position.set(x, 0, z);
  // Face the island's centre so every portal greets the player.
  group.lookAt(0, 0, 0);
  group.userData = { portalAct: act };
  return { act, title, locked, group, at: { x, z } };
}

/** The hub: a night-time floating island with a ring of Act portals, open ones glowing. */
export function createCampus(openActs: ReadonlySet<number>): Campus {
  const island = createIsland(14, 0x18242e);
  const portals = ACTS.map(({ act, title }, index) => {
    // Spread the portals over the far half of the island, Act 1 on the left.
    const angle = Math.PI + (index - (ACTS.length - 1) / 2) * 0.36;
    return createPortal(act, title, !openActs.has(act), angle, 11.5);
  });
  portals.forEach((portal) => island.group.add(portal.group));

  const welcome = new Label('Quillwork AI campus', { color: '#6fd3ff', height: 0.4 });
  welcome.sprite.position.set(0, 3.8, -6);
  island.group.add(welcome.sprite);

  const open = portals.filter((portal) => !portal.locked);
  return {
    island,
    portals,
    spawn: { x: 0, z: 6 },
    update: (elapsed) => {
      open.forEach((portal, index) => {
        const ring = portal.group.children[0];
        if (ring instanceof THREE.Mesh && ring.material instanceof THREE.MeshStandardMaterial) {
          ring.material.emissiveIntensity = 2.4 + Math.sin(elapsed * 2 + index) * 0.5;
        }
      });
    },
  };
}
