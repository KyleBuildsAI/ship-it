import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three/webgpu';
import { createCampus } from './campus';
import { createStars } from './island';

export interface World {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  update: (dt: number, elapsed: number) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

/**
 * Builds the explorable world. For now that is Campus: a floating island at night with a
 * ring of Act portals, seen through a slowly orbiting camera.
 */
export function createWorld(canvas: HTMLCanvasElement, reducedMotion: boolean): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060b);
  scene.fog = new THREE.FogExp2(0x070a14, 0.022);

  const campus = createCampus();
  scene.add(campus.island.group, createStars(600));

  // Key + rim + low ambient (DESIGN.md section 14).
  const key = new THREE.DirectionalLight(0xbfd8ff, 2.2);
  key.position.set(8, 14, 6);
  const rim = new THREE.PointLight(0xff7a45, 60, 60);
  rim.position.set(-10, 5, -10);
  scene.add(new THREE.AmbientLight(0x223355, 0.7), key, rim);

  const camera = new THREE.PerspectiveCamera(
    50,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    300,
  );
  camera.position.set(campus.spawn.x, 5.5, campus.spawn.z + 10);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(campus.spawn.x, 1.2, campus.spawn.z);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 20;
  controls.maxPolarAngle = Math.PI * 0.46;
  // A slow drift shows off the island until the player can walk it.
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.35;

  return {
    scene,
    camera,
    update: (dt, elapsed) => {
      campus.update(elapsed);
      controls.update(dt);
    },
    resize: (width, height) => {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose: () => {
      controls.dispose();
    },
  };
}
