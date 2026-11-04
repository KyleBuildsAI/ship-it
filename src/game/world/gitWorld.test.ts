import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { BANNER, COMMIT_LABEL, platformHome } from './commitPath';
import { COMMIT_PATH, GIT_WORLD_SPAWN } from './gitWorld';
import { CAMERA_RIGS } from './zones';

const WIDTH = 1280;
const HEIGHT = 800;

/**
 * The view on arrival in the Git World, built the way world.ts builds it: a 50° camera
 * that stands the rig's height up and distance back from the avatar and looks at it, its
 * view shifted right by half the play panel so the scene centres in the space left over.
 */
function arrivalView(panelRight: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 300);
  const { height, back } = CAMERA_RIGS.gitworld;
  camera.position.set(GIT_WORLD_SPAWN.x, height, GIT_WORLD_SPAWN.z + back);
  camera.lookAt(GIT_WORLD_SPAWN.x, 1.2, GIT_WORLD_SPAWN.z);
  camera.setViewOffset(WIDTH, HEIGHT, -panelRight / 2, 0, WIDTH, HEIGHT);
  camera.updateMatrixWorld();
  return camera;
}

/** Where a point in the world lands on the screen, in pixels from the top left. */
function pixel(camera: THREE.Camera, point: THREE.Vector3): { x: number; y: number } {
  const ndc = point.clone().project(camera);
  return { x: ((ndc.x + 1) / 2) * WIDTH, y: ((1 - ndc.y) / 2) * HEIGHT };
}

/**
 * Where the top (`rise` above) or bottom (below) edge of a label centred on `middle` lands,
 * in pixels from the top. A label is a sprite that stands upright on the screen, so its
 * edges are up and down in the camera's view, not the world's.
 */
function spriteEdge(camera: THREE.Camera, middle: THREE.Vector3, rise: number): number {
  const inView = middle.clone().applyMatrix4(camera.matrixWorldInverse);
  inView.y += rise;
  const ndc = inView.applyMatrix4(camera.projectionMatrix);
  return ((1 - ndc.y) / 2) * HEIGHT;
}

/** How far above its platform a branch banner's name reaches (commitPath.ts). */
const BANNER_TOP = BANNER.foot.y + BANNER.name.y + BANNER.name.height / 2;

/**
 * The box a commit's label and branch banner take up around its platform: a full-length
 * label (short hash and a 26-character subject) is under 4 wide, and the banner's name
 * tops out BANNER_TOP above the platform, a little behind it.
 */
const LABEL_CORNERS = [
  new THREE.Vector3(-2, 0, 0),
  new THREE.Vector3(2, 0, 0),
  new THREE.Vector3(-2, BANNER_TOP, BANNER.foot.z),
  new THREE.Vector3(2, BANNER_TOP, BANNER.foot.z),
];

/**
 * Missions 2.2 and 2.5 start with five commits and can add two more (2.2 a fix and a
 * feature), so Act 2's longest histories run to seven. The path rises as it goes, so an
 * eighth would reach the top edge.
 */
const COMMITS = 7;

describe('the commit path', () => {
  const start = new THREE.Vector3(COMMIT_PATH.start.x, COMMIT_PATH.start.y, COMMIT_PATH.start.z);
  const along = new THREE.Vector3(COMMIT_PATH.direction.x, 0, COMMIT_PATH.direction.z).normalize();

  // 416px is the play panel's right edge at every text size: larger text zooms what is inside
  // it, not the panel (theme.css). 520px is the panel a zoomed one used to be, kept as margin.
  it.each([416, 520])(
    'keeps every commit and its label in view beside a %ipx play panel at 1280x800',
    (panelRight) => {
      const camera = arrivalView(panelRight);
      for (let depth = 0; depth < COMMITS; depth += 1) {
        const home = platformHome(start, along, depth, 0);
        for (const corner of LABEL_CORNERS) {
          const { x, y } = pixel(camera, home.clone().add(corner));
          expect(x, `commit ${String(depth + 1)}`).toBeGreaterThan(panelRight);
          expect(x, `commit ${String(depth + 1)}`).toBeLessThan(WIDTH);
          expect(y, `commit ${String(depth + 1)}`).toBeGreaterThan(0);
          expect(y, `commit ${String(depth + 1)}`).toBeLessThan(HEIGHT);
        }
      }
    },
  );

  it('stacks a branch banner above its commit label: the flag, then the branch name', () => {
    const { foot, pole, flag, name } = BANNER;
    const labelTop = COMMIT_LABEL.y + COMMIT_LABEL.height / 2;
    expect(foot.y + flag.y - flag.height / 2).toBeGreaterThan(labelTop + 0.1);
    expect(flag.y + flag.height / 2).toBeLessThanOrEqual(pole);
    expect(name.y - name.height / 2).toBeGreaterThan(pole);
  });

  it.each([416, 520])(
    'flies every branch flag clear of its commit label beside a %ipx play panel',
    (panelRight) => {
      const camera = arrivalView(panelRight);
      const { foot, flag } = BANNER;
      for (let depth = 0; depth < COMMITS; depth += 1) {
        const home = platformHome(start, along, depth, 0);
        const labelMiddle = home.clone().setY(home.y + COMMIT_LABEL.y);
        const labelTop = spriteEdge(camera, labelMiddle, COMMIT_LABEL.height / 2);
        // The flag's lower edge, from where it meets the pole to its far end.
        const flagBottom = Math.max(
          ...[0.02, 0.02 + flag.width].map(
            (x) =>
              pixel(
                camera,
                home
                  .clone()
                  .add(new THREE.Vector3(foot.x + x, foot.y + flag.y - flag.height / 2, foot.z)),
              ).y,
          ),
        );
        // A few pixels apart even far up the path, where the newest commit's hash is small.
        expect(labelTop - flagBottom, `commit ${String(depth + 1)}`).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it('trails away behind the Vault, rising as it goes', () => {
    const first = platformHome(start, along, 0, 0);
    const next = platformHome(start, along, 1, 0);
    expect(next.z).toBeLessThan(first.z);
    expect(next.y).toBeGreaterThan(first.y);
  });
});
