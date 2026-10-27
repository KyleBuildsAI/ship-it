import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { palette, popIn, remember, segment } from './kit';

/*
 * The kit's helpers that every island's beats lean on. No renderer is needed: they only
 * place, turn, size and show meshes.
 */

const colors = palette(0x7c9cff);

/** Where one of a mesh's own axes points once the mesh is turned. */
function axis(mesh: THREE.Object3D, x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z).applyQuaternion(mesh.quaternion);
}

describe('popping a mesh in', () => {
  it('grows a little past its size on the way, then lands on it exactly', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), colors.glow);
    const sizes: number[] = [];
    for (let step = 0; step <= 100; step++) {
      popIn(mesh, step / 100, 2);
      sizes.push(mesh.scale.x);
    }
    const biggest = Math.max(...sizes);
    expect(biggest).toBeGreaterThan(2 * 1.05);
    expect(biggest).toBeLessThan(2 * 1.15);
    expect(sizes.at(-1)).toBeCloseTo(2);
    expect(mesh.visible).toBe(true);
  });

  it('hides the mesh before it starts, and never turns it inside out', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), colors.glow);
    popIn(mesh, 0);
    expect(mesh.visible).toBe(false);
    for (let step = 0; step <= 100; step++) {
      popIn(mesh, step / 100);
      expect(mesh.scale.x).toBeGreaterThan(0);
    }
  });
});

describe('remembering a prop', () => {
  it('puts a mesh back where it stood, at its size, turn, visibility and colour', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), colors.base);
    mesh.position.set(1, 2, 3);
    mesh.rotation.set(0.1, 0.2, 0.3);
    const restore = remember(mesh);
    mesh.position.set(9, 9, 9);
    mesh.rotation.set(1, 1, 1);
    mesh.scale.setScalar(4);
    mesh.visible = false;
    mesh.material = colors.alert;
    restore();
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
    expect(mesh.rotation.toArray().slice(0, 3)).toEqual([0.1, 0.2, 0.3]);
    expect(mesh.scale.toArray()).toEqual([1, 1, 1]);
    expect(mesh.visible).toBe(true);
    expect(mesh.material).toBe(colors.base);
  });

  it("puts a whole group back, so a beat can turn a house or a robot's head", () => {
    const head = new THREE.Group();
    head.add(new THREE.Mesh(new THREE.BoxGeometry(), colors.light));
    head.position.set(0, 1.35, 0);
    const restore = remember(head);
    head.rotation.y = 1.2;
    head.position.y = 2;
    head.visible = false;
    restore();
    expect(head.rotation.y).toBe(0);
    expect(head.position.y).toBe(1.35);
    expect(head.visible).toBe(true);
  });
});

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
