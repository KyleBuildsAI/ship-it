import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three/webgpu';
import { isTypingTarget } from '../../ui/focus';
import { worldState } from '../worldState';
import { createAvatar } from './avatar';
import { createCampus } from './campus';
import { createStars } from './island';
import {
  clampToDisc,
  keyDirection,
  stepToward,
  WALK_SPEED,
  type Flat,
  type MoveKeys,
} from './movement';

export interface World {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  update: (dt: number, elapsed: number) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

const KEY_BINDINGS: Record<string, keyof MoveKeys> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/** A press shorter and stiller than this is a click; anything else is a camera drag. */
const CLICK_MAX_PIXELS = 6;
const CLICK_MAX_MS = 400;

/**
 * Builds the explorable world: the Campus island, the player's avatar, a third-person
 * camera with damped orbit, WASD and click-to-walk.
 */
export function createWorld(canvas: HTMLCanvasElement, reducedMotion: boolean): World {
  const motion = reducedMotion ? 0.25 : 1;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060b);
  scene.fog = new THREE.FogExp2(0x070a14, 0.022);

  const campus = createCampus();
  const avatar = createAvatar(motion);
  scene.add(campus.island.group, avatar.group, createStars(600));

  // Key + rim + low ambient (DESIGN.md section 14); the lights follow the player.
  const lights = new THREE.Group();
  const key = new THREE.DirectionalLight(0xbfd8ff, 2.2);
  key.position.set(8, 14, 6);
  const rim = new THREE.PointLight(0xff7a45, 60, 60);
  rim.position.set(-10, 5, -10);
  lights.add(key, key.target, rim);
  scene.add(new THREE.AmbientLight(0x223355, 0.7), lights);

  const camera = new THREE.PerspectiveCamera(
    50,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    300,
  );
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 20;
  controls.maxPolarAngle = Math.PI * 0.46;

  let position: Flat = { ...campus.spawn };
  let walkTarget: Flat | null = null;
  const keys: MoveKeys = { forward: false, back: false, left: false, right: false };
  const center: Flat = { x: 0, z: 0 };
  const walkRadius = campus.island.radius - 1;

  controls.target.set(position.x, 1.2, position.z);
  camera.position.set(position.x, 5.5, position.z + 10);

  // Clicking the ground walks there. A drag turns the camera instead, so tell them apart.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pressed: { x: number; y: number; at: number } | null = null;

  const onPointerDown = (event: PointerEvent) => {
    pressed = { x: event.clientX, y: event.clientY, at: performance.now() };
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!pressed) return;
    const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
    const quick = performance.now() - pressed.at < CLICK_MAX_MS;
    pressed = null;
    if (moved > CLICK_MAX_PIXELS || !quick) return;

    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const groundHit = raycaster.intersectObject(campus.island.ground, false)[0];
    if (groundHit) {
      walkTarget = clampToDisc({ x: groundHit.point.x, z: groundHit.point.z }, center, walkRadius);
    }
  };

  const onKey = (down: boolean) => (event: KeyboardEvent) => {
    const binding = KEY_BINDINGS[event.code];
    if (!binding) return;
    // Keys typed into the terminal or editor never move the avatar.
    if (down && isTypingTarget(event.target)) return;
    keys[binding] = down;
    if (down) walkTarget = null;
  };
  const onKeyDown = onKey(true);
  const onKeyUp = onKey(false);
  // Keys released while the window is in the background never send keyup.
  const releaseAll = () => {
    keys.forward = keys.back = keys.left = keys.right = false;
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAll);

  const follow = new THREE.Vector3();
  return {
    scene,
    camera,
    update: (dt, elapsed) => {
      campus.update(elapsed);

      let direction = keyDirection(keys, controls.getAzimuthalAngle());
      if (direction) {
        position = {
          x: position.x + direction.x * WALK_SPEED * dt,
          z: position.z + direction.z * WALK_SPEED * dt,
        };
      } else if (walkTarget) {
        const step = stepToward(position, walkTarget, WALK_SPEED, dt);
        direction = { x: walkTarget.x - position.x, z: walkTarget.z - position.z };
        position = step.position;
        if (step.arrived) walkTarget = null;
      }
      position = clampToDisc(position, center, walkRadius);
      if (direction && !worldState.get().hasMoved) worldState.update({ hasMoved: true });
      avatar.group.position.set(position.x, 0, position.z);
      avatar.update(dt, elapsed, direction);

      // The camera keeps its orbit but follows the player, easing rather than snapping.
      follow
        .set(position.x, 1.2, position.z)
        .sub(controls.target)
        .multiplyScalar(Math.min(1, dt * 6));
      controls.target.add(follow);
      camera.position.add(follow);
      controls.update(dt);
      lights.position.set(position.x, 0, position.z);
    },
    resize: (width, height) => {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose: () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      controls.dispose();
    },
  };
}
