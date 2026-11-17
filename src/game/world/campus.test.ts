import * as THREE from 'three/webgpu';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createCampus,
  PORTAL_LABEL,
  PORTAL_RING,
  PORTAL_RING_HEIGHT,
  WELCOME_SIGN,
  type Campus,
} from './campus';
import type { PortalShare } from './portalShare';
import { SHARE_RING } from './shareRing';
import { CAMERA_RIGS } from './zones';

/*
 * The Campus's share rings, as the world drives them. Labels draw on a canvas and unit
 * tests have no DOM, so `document` hands out a canvas with no 2D context: each label stays
 * blank, which is all these tests need, since they only look at the rings.
 */
beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

/** Acts 1 to 3 open, with as many parts as the shipped Acts have; Act 4 locked, 5 parts. */
function campus(): Campus {
  const parts = new Map([
    [1, 7],
    [2, 6],
    [3, 5],
    [4, 5],
  ]);
  return createCampus(new Set([1, 2, 3]), parts);
}

function share(pips: boolean[]): PortalShare {
  return { pips };
}

function shown(built: Campus, act: number) {
  return built.portals.find((portal) => portal.act === act)?.share.shown();
}

/** Every mesh on the island, so a test can tell a recolour from a rebuild. */
function meshes(built: Campus): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  built.island.group.traverse((object) => {
    if (object instanceof THREE.Mesh) found.push(object);
  });
  return found;
}

describe("the Campus portals' share rings", () => {
  it('builds a segment for each part of its Act, and none for an Act with no parts', () => {
    const built = campus();
    const segments = (act: number) =>
      built.portals.find((portal) => portal.act === act)?.share.group.children.length;
    expect([1, 2, 3, 4, 5].map(segments)).toEqual([7, 6, 5, 5, 0]);
  });

  it('shows each open Act its own share', () => {
    const built = campus();
    built.showShares(
      new Map([
        [1, share([true, true, false, false, false, false, false])],
        [3, share([false, false, true, false, false])],
      ]),
    );
    expect(shown(built, 1)).toEqual({ lit: 2, parts: 7 });
    expect(shown(built, 3)).toEqual({ lit: 1, parts: 5 });
    // Act 2 has no share listed, so its ring stays out of sight.
    expect(shown(built, 2)).toEqual({ lit: 0, parts: 0 });
  });

  it('updates when a node lights, recolouring the meshes it built rather than adding any', () => {
    const built = campus();
    const before = meshes(built);
    built.showShares(new Map([[3, share([false, false, false, false, false])]]));
    built.showShares(new Map([[3, share([true, false, false, false, false])]]));
    expect(shown(built, 3)).toEqual({ lit: 1, parts: 5 });
    expect(meshes(built)).toEqual(before);
  });

  it("sits outside the portal's ring and below its label, touching neither", () => {
    expect(SHARE_RING.radius - SHARE_RING.tube).toBeGreaterThan(
      PORTAL_RING.radius + PORTAL_RING.tube + 0.05,
    );
    const top = PORTAL_RING_HEIGHT + SHARE_RING.radius + SHARE_RING.tube;
    expect(top).toBeLessThan(PORTAL_LABEL.y - PORTAL_LABEL.height / 2 - 0.05);
  });

  it('keeps a locked portal free of segments when its share has no pips', () => {
    const built = campus();
    built.showShares(new Map([[4, share([])]]));
    expect(shown(built, 4)).toEqual({ lit: 0, parts: 0 });
    const locked = built.portals.find((portal) => portal.act === 4);
    expect(locked?.share.group.children.every((segment) => !segment.visible)).toBe(true);
  });
});

const HEIGHT = 800;

/** The view on arrival, built the way world.ts builds it: a 50° camera behind the spawn. */
function spawnView(built: Campus): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 1280 / HEIGHT, 0.1, 300);
  const { height, back } = CAMERA_RIGS.campus;
  camera.position.set(built.spawn.x, height, built.spawn.z + back);
  camera.lookAt(built.spawn.x, 1.2, built.spawn.z);
  camera.updateMatrixWorld();
  return camera;
}

/**
 * Where the top (`rise` above) or bottom (below) edge of a label centred on `middle` lands,
 * in pixels from the top. A label is a sprite that stands upright on the screen.
 */
function spriteEdge(camera: THREE.Camera, middle: THREE.Vector3, rise: number): number {
  const inView = middle.clone().applyMatrix4(camera.matrixWorldInverse);
  inView.y += rise;
  const ndc = inView.applyMatrix4(camera.projectionMatrix);
  return ((1 - ndc.y) / 2) * HEIGHT;
}

describe('the Campus seen from the spawn point', () => {
  it('shows the welcome sign above the labels of the portals behind it', () => {
    const built = campus();
    const camera = spawnView(built);
    const sign = new THREE.Vector3(0, WELCOME_SIGN.y, WELCOME_SIGN.z);
    const signBottom = spriteEdge(camera, sign, -WELCOME_SIGN.height / 2);
    // Acts 4 and 5 stand in the middle, straight behind the sign.
    for (const act of [4, 5]) {
      const portal = built.portals.find((candidate) => candidate.act === act);
      if (!portal) throw new Error(`no Act ${String(act)} portal`);
      const label = new THREE.Vector3(portal.at.x, PORTAL_LABEL.y, portal.at.z);
      const labelTop = spriteEdge(camera, label, PORTAL_LABEL.height / 2);
      expect(labelTop - signBottom, `Act ${String(act)}`).toBeGreaterThanOrEqual(3);
    }
  });
});
