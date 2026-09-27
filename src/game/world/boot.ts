import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three/webgpu';
import { devStatus } from '../devStatus';
import { createPlaceholderScene } from './placeholderScene';
import { createFrameRenderer } from './post';
import { createRenderer, fitToContainer } from './renderer';

/** Starts the 3D world inside `container` and keeps it rendering every frame. */
export async function bootWorld(container: HTMLElement): Promise<void> {
  devStatus.update({ backend: 'starting', threeRevision: THREE.REVISION });

  const { renderer, backend } = await createRenderer(container);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const world = createPlaceholderScene(
    container.clientWidth / container.clientHeight,
    reducedMotion,
  );

  const controls = new OrbitControls(world.camera, renderer.domElement);
  controls.target.set(0, 2.4, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 6;
  controls.maxDistance = 22;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.35;

  const frame = createFrameRenderer(renderer, world.scene, world.camera);

  const fit = () => {
    world.camera.aspect = container.clientWidth / container.clientHeight;
    world.camera.updateProjectionMatrix();
    fitToContainer(renderer, container);
  };
  window.addEventListener('resize', fit);
  // The window may have resized while the GPU device was being created.
  fit();

  // A lost GPU device (driver reset, sleep, GPU switch) stops rendering for good, so the
  // badge must stop claiming a live backend.
  renderer.onDeviceLost = (info) => {
    devStatus.update({ backend: 'failed' });
    console.error('[ship-it] GPU device lost; reload the page to restart the 3D world', info);
  };

  const timer = new THREE.Timer();
  // Pauses elapsed time while the tab is hidden, so animations don't jump on return.
  timer.connect(document);

  // setAnimationLoop, never raw requestAnimationFrame: three.js syncs it with the
  // WebGPU/WebGL frame and XR sessions.
  await renderer.setAnimationLoop((time) => {
    timer.update(time);
    world.update(timer.getElapsed());
    controls.update(timer.getDelta());
    frame.render();
  });

  devStatus.update({ backend });
  console.info(`[ship-it] renderer: ${backend}, three.js r${THREE.REVISION}`);
}
