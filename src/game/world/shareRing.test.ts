import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createShareRing, SEGMENT_LOOK, SHARE_RING } from './shareRing';

/*
 * The ring of segments around a Campus portal, one per part of its Act. No renderer is
 * needed: the ring only builds meshes once, then recolours, hides and shows them.
 */

type Segment = THREE.Mesh<THREE.TorusGeometry, THREE.MeshStandardMaterial>;

function segmentsOf(ring: { group: THREE.Group }): Segment[] {
  return ring.group.children.filter(
    (child): child is Segment =>
      child instanceof THREE.Mesh &&
      child.geometry instanceof THREE.TorusGeometry &&
      child.material instanceof THREE.MeshStandardMaterial,
  );
}

/** Which look each segment has now: 'lit', 'dim', or 'hidden'. */
function looks(ring: { group: THREE.Group }): string[] {
  return segmentsOf(ring).map((segment) => {
    if (!segment.visible) return 'hidden';
    const { emissive } = segment.material;
    return emissive.getHex() === SEGMENT_LOOK.lit.emissive ? 'lit' : 'dim';
  });
}

/**
 * Where the middle of a segment points, as a clockwise angle from the top of the ring. The
 * player faces a portal from its front (+z), so this is clockwise as the player sees it.
 */
function clockwiseFromTop(segment: Segment): number {
  const middle = segment.rotation.z + segment.geometry.parameters.arc / 2;
  const angle = Math.PI / 2 - middle;
  return (angle + Math.PI * 4) % (Math.PI * 2);
}

describe("a portal's share ring", () => {
  it('builds one segment per part, hidden until it is shown a share', () => {
    const ring = createShareRing(5);
    expect(segmentsOf(ring)).toHaveLength(5);
    expect(ring.group.children).toHaveLength(5);
    expect(looks(ring)).toEqual(['hidden', 'hidden', 'hidden', 'hidden', 'hidden']);
    expect(ring.shown()).toEqual({ lit: 0, parts: 0 });
  });

  it('lights the segments of lit parts and leaves the rest dim', () => {
    const ring = createShareRing(5);
    ring.show([true, false, true, false, false]);
    expect(looks(ring)).toEqual(['lit', 'dim', 'lit', 'dim', 'dim']);
    expect(ring.shown()).toEqual({ lit: 2, parts: 5 });
    const [lit, dim] = segmentsOf(ring);
    expect(lit?.material.emissiveIntensity).toBeGreaterThan(dim?.material.emissiveIntensity ?? 0);
  });

  it('only recolours after it is built: the same meshes and materials, never new ones', () => {
    const ring = createShareRing(4);
    const meshes = segmentsOf(ring);
    const materials = meshes.map((segment) => segment.material);
    ring.show([true, true, false, false]);
    ring.show([false, true, true, true]);
    ring.show([]);
    ring.show([true, false, false, false]);
    expect(segmentsOf(ring)).toEqual(meshes);
    segmentsOf(ring).forEach((segment, index) => {
      expect(segment).toBe(meshes[index]);
      expect(segment.material).toBe(materials[index]);
    });
    expect(looks(ring)).toEqual(['lit', 'dim', 'dim', 'dim']);
  });

  it('dims a segment again when its part stops being lit', () => {
    const ring = createShareRing(3);
    ring.show([true, true, true]);
    ring.show([true, false, true]);
    expect(looks(ring)).toEqual(['lit', 'dim', 'lit']);
    expect(ring.shown()).toEqual({ lit: 2, parts: 3 });
  });

  it('hides every segment for a share with no pips, as a locked portal has', () => {
    const ring = createShareRing(3);
    ring.show([true, false, false]);
    ring.show([]);
    expect(looks(ring)).toEqual(['hidden', 'hidden', 'hidden']);
    expect(ring.shown()).toEqual({ lit: 0, parts: 0 });
  });

  it('reports what its segments show, not the pips it was handed', () => {
    const ring = createShareRing(3);
    ring.show([true, false, false]);
    // Change two segments behind the ring's back: hide the second, give the third the lit
    // look. The test hooks must see this, so a ring that skipped a repaint can't hide it.
    const [, second, third] = segmentsOf(ring);
    if (!second || !third) throw new Error('missing segments');
    second.visible = false;
    third.material.emissive.setHex(SEGMENT_LOOK.lit.emissive);
    expect(ring.shown()).toEqual({ lit: 2, parts: 2 });
  });

  it('shows no more pips than it has segments for', () => {
    const ring = createShareRing(2);
    ring.show([true, true, true]);
    expect(looks(ring)).toEqual(['lit', 'lit']);
    expect(ring.shown()).toEqual({ lit: 2, parts: 2 });
  });

  it('runs clockwise from the top in play order, with a gap between segments', () => {
    const parts = 5;
    const step = (Math.PI * 2) / parts;
    const segments = segmentsOf(createShareRing(parts));
    segments.forEach((segment, index) => {
      expect(clockwiseFromTop(segment)).toBeCloseTo((index + 0.5) * step);
      expect(segment.geometry.parameters.arc).toBeCloseTo(step - SHARE_RING.gap);
      expect(segment.geometry.parameters.radius).toBe(SHARE_RING.radius);
    });
    // The first part sits just right of the top, where a clock's hand starts.
    const first = segments[0];
    if (!first) throw new Error('no segments');
    const middle = first.rotation.z + first.geometry.parameters.arc / 2;
    expect(Math.cos(middle)).toBeGreaterThan(0);
    expect(Math.sin(middle)).toBeGreaterThan(0);
  });

  it('builds nothing for an Act with no parts', () => {
    const ring = createShareRing(0);
    ring.show([true]);
    expect(ring.group.children).toHaveLength(0);
    expect(ring.shown()).toEqual({ lit: 0, parts: 0 });
  });
});
