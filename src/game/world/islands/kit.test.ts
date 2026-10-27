import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { palette, segment } from './kit';

/*
 * The kit's helpers that every island's beats lean on. No renderer is needed: they only
 * place, turn, size and show meshes.
 */

const colors = palette(0x7c9cff);

/** Where one of a mesh's own axes points once the mesh is turned. */
function axis(mesh: THREE.Object3D, x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z).applyQuaternion(mesh.quaternion);
}

describe('a segment', () => {
  it('runs from one point to the other', () => {
    const from = new THREE.Vector3(1, 0.3, 2);
    const to = new THREE.Vector3(4, 0.3, -2);
    const { mesh } = segment(from, to, colors.base);
    const along = to.clone().sub(from).normalize();
    expect(axis(mesh, 0, 0, 1).distanceTo(along)).toBeLessThan(1e-6);
    expect(mesh.position.distanceTo(new THREE.Vector3(2.5, 0.3, 0))).toBeLessThan(1e-6);
    expect(mesh.scale.z).toBeCloseTo(5);
  });

  it('keeps its flat side up on a slope, rather than rolling over', () => {
    const { mesh } = segment(
      new THREE.Vector3(0, 0.3, 0),
      new THREE.Vector3(3, 2.3, -2),
      colors.base,
    );
    // The stick's width runs level, and its thin side faces as far up as the slope allows.
    expect(Math.abs(axis(mesh, 1, 0, 0).y)).toBeLessThan(1e-6);
    expect(axis(mesh, 0, 1, 0).y).toBeGreaterThan(0.8);
  });

  it('lies flat side up on level ground, whichever way it runs', () => {
    for (const to of [
      new THREE.Vector3(5, 0.3, 0),
      new THREE.Vector3(-5, 0.3, 0),
      new THREE.Vector3(0, 0.3, 5),
      new THREE.Vector3(0, 0.3, -5),
    ]) {
      const { mesh } = segment(new THREE.Vector3(0, 0.3, 0), to, colors.base);
      expect(axis(mesh, 0, 1, 0).y, `toward ${to.toArray().join(',')}`).toBeCloseTo(1);
    }
  });

  it('can stand straight up', () => {
    const { mesh } = segment(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2, 0), colors.base);
    expect(axis(mesh, 0, 0, 1).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-6);
    expect(mesh.quaternion.toArray().every(Number.isFinite)).toBe(true);
  });
});
