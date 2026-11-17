import * as THREE from 'three/webgpu';
import { createIsland, type Island } from './island';
import { Label } from './labels';
import type { Flat } from './movement';
import type { PortalShare } from './portalShare';
import { createShareRing, type ShareRing } from './shareRing';

export interface Portal {
  readonly act: number;
  readonly title: string;
  readonly locked: boolean;
  readonly group: THREE.Group;
  /** Where the ring stands on the ground. */
  readonly at: Flat;
  /** The segments around the ring: how much of the Act's skill tree is lit. */
  readonly share: ShareRing;
}

export interface Campus {
  readonly island: Island;
  readonly portals: readonly Portal[];
  readonly spawn: Flat;
  update: (elapsed: number) => void;
  /** Recolours every portal's share ring. A portal with no share listed shows no segments. */
  showShares: (shares: ReadonlyMap<number, PortalShare>) => void;
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

/** How high the middle of a portal's ring stands above the ground. */
export const PORTAL_RING_HEIGHT = 1.45;
/** The portal's own ring, in world units. Its share ring goes around it (shareRing.ts). */
export const PORTAL_RING = { radius: 1.1, tube: 0.07 } as const;
/** The Act's name above the portal: how high its middle is, and how tall it is. */
export const PORTAL_LABEL = { y: 3.15, height: 0.32 } as const;
/**
 * The campus's name, nearer the spawn than the portals: where it stands, and how tall it is.
 * From the spawn it sits straight in front of the middle portals, so it stands high enough
 * to clear their labels (campus.test.ts checks this from the spawn view).
 */
export const WELCOME_SIGN = { y: 4.1, z: -6, height: 0.4 } as const;
const OPEN = 0x6fd3ff;
const LOCKED = 0x39425a;

function createPortal(
  act: number,
  title: string,
  locked: boolean,
  angle: number,
  radius: number,
  parts: number,
): Portal {
  const color = locked ? LOCKED : OPEN;
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(PORTAL_RING.radius, PORTAL_RING.tube, 12, 72),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: locked ? 0.25 : 2.6,
    }),
  );
  ring.position.y = PORTAL_RING_HEIGHT;
  const veil = new THREE.Mesh(
    new THREE.CircleGeometry(1.05, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: locked ? 0.05 : 0.14,
      side: THREE.DoubleSide,
    }),
  );
  veil.position.y = PORTAL_RING_HEIGHT;
  const label = new Label(
    locked ? `Act ${String(act)} · ${title} · locked` : `Act ${String(act)} · ${title}`,
    {
      color: locked ? '#8f9bb3' : '#e8ecf5',
      height: PORTAL_LABEL.height,
    },
  );
  label.sprite.position.y = PORTAL_LABEL.y;
  // Built now, for every part, and only recoloured from then on (showShares below).
  const share = createShareRing(parts);
  share.group.position.y = PORTAL_RING_HEIGHT;
  group.add(ring, veil, label.sprite, share.group);

  const x = Math.sin(angle) * radius;
  const z = Math.cos(angle) * radius;
  group.position.set(x, 0, z);
  // Face the island's centre so every portal greets the player.
  group.lookAt(0, 0, 0);
  group.userData = { portalAct: act };
  return { act, title, locked, group, at: { x, z }, share };
}

/**
 * The hub: a night-time floating island with a ring of Act portals, open ones glowing.
 * `partsPerAct` says how many parts each Act has, so its portal's share ring has a segment
 * for each; an Act missing from it gets none.
 */
export function createCampus(
  openActs: ReadonlySet<number>,
  partsPerAct: ReadonlyMap<number, number>,
): Campus {
  const island = createIsland(14, 0x18242e);
  const portals = ACTS.map(({ act, title }, index) => {
    // Spread the portals over the far half of the island, Act 1 on the left.
    const angle = Math.PI + (index - (ACTS.length - 1) / 2) * 0.36;
    const parts = partsPerAct.get(act) ?? 0;
    return createPortal(act, title, !openActs.has(act), angle, 11.5, parts);
  });
  portals.forEach((portal) => island.group.add(portal.group));

  const welcome = new Label('Quillwork AI campus', {
    color: '#6fd3ff',
    height: WELCOME_SIGN.height,
  });
  welcome.sprite.position.set(0, WELCOME_SIGN.y, WELCOME_SIGN.z);
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
    showShares: (shares) => {
      for (const portal of portals) portal.share.show(shares.get(portal.act)?.pips ?? []);
    },
  };
}
