import * as THREE from 'three/webgpu';

/*
 * A ring of segments around a Campus portal, one per part of its Act, lit ones bright
 * (DESIGN.md section 4, Campus). Every mesh is built once, with the Campus: the WebGPU
 * renderer keeps each mesh it has drawn alive for the session, so a new save only recolours,
 * hides or shows them. Nothing here moves or pulses, so reduced motion has nothing to stop.
 */

/** The ring's size, in world units, and the gap between segments, in radians. */
export const SHARE_RING = { radius: 1.4, tube: 0.06, gap: 0.2 } as const;

/**
 * Gold for a lit part, like the Trophy Wall's stars; a faint slate for the rest. The slate
 * stays well under the bloom's threshold (post.ts), so a part not lit yet never glows.
 */
export const SEGMENT_LOOK = {
  lit: { color: 0xffd166, emissive: 0xffc24d, intensity: 2.2 },
  dim: { color: 0x3a4560, emissive: 0x8091b8, intensity: 0.35 },
} as const;

export interface ShareRing {
  /** The segments, centred on the portal's ring. The portal adds it to its group. */
  readonly group: THREE.Group;
  /** Recolours the segments to a share's pips, in order. Segments past the last pip hide. */
  show: (pips: readonly boolean[]) => void;
  /** What the ring shows now, for the test hooks: lit segments, and segments in view. */
  shown: () => { lit: number; parts: number };
}

type Segment = THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;

function paint(material: THREE.MeshStandardMaterial, lit: boolean): void {
  const look = lit ? SEGMENT_LOOK.lit : SEGMENT_LOOK.dim;
  material.color.setHex(look.color);
  material.emissive.setHex(look.emissive);
  material.emissiveIntensity = look.intensity;
}

/** `parts` hidden segments, part 1 just right of the top, then clockwise. */
function buildSegments(parts: number): Segment[] {
  if (parts <= 0) return [];
  const step = (Math.PI * 2) / parts;
  const arc = step - SHARE_RING.gap;
  // Every segment is the same arc, turned to its place, so they share one geometry.
  const geometry = new THREE.TorusGeometry(
    SHARE_RING.radius,
    SHARE_RING.tube,
    8,
    Math.ceil(arc * 16),
    arc,
  );
  return Array.from({ length: parts }, (_, index) => {
    // Each segment has its own material, so lighting one part recolours only its segment.
    const material = new THREE.MeshStandardMaterial({ roughness: 0.4 });
    paint(material, false);
    const segment = new THREE.Mesh(geometry, material);
    // A torus arc starts on +x and runs anticlockwise. The player faces the portal's front,
    // so turning the arc's middle to (index + 0.5) steps clockwise from the top puts the
    // parts in play order the way a clock's hand moves.
    const middleFromTop = (index + 0.5) * step;
    segment.rotation.z = Math.PI / 2 - middleFromTop - arc / 2;
    segment.visible = false;
    return segment;
  });
}

/** A portal's share ring, built once and hidden until the first `show`. */
export function createShareRing(parts: number): ShareRing {
  const group = new THREE.Group();
  const segments = buildSegments(parts);
  if (segments.length > 0) group.add(...segments);

  let current: readonly boolean[] = [];
  return {
    group,
    show: (pips) => {
      current = pips.slice(0, segments.length);
      segments.forEach((segment, index) => {
        const pip = current[index];
        segment.visible = pip !== undefined;
        if (pip !== undefined) paint(segment.material, pip);
      });
    },
    shown: () => ({ lit: current.filter(Boolean).length, parts: current.length }),
  };
}
