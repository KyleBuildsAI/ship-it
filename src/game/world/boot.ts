import * as THREE from 'three/webgpu';
import { devStatus } from '../devStatus';
import { progress, whenProgressSettles } from '../progress';
import type { Settings } from '../save/schema';
import { createFrameRenderer } from './post';
import { createRenderer, fitToContainer } from './renderer';
import { createWorld } from './world';

/** Graphics quality caps the pixel ratio: the biggest cost on a high-DPI screen. */
const PIXEL_RATIO_CAP: Record<Settings['graphicsQuality'], number> = {
  low: 1,
  medium: 1.5,
  high: 2,
};

/** Starts the 3D world inside `container` and keeps it rendering every frame. */
export async function bootWorld(container: HTMLElement): Promise<void> {
  devStatus.update({ backend: 'starting', threeRevision: THREE.REVISION });

  const { renderer, backend } = await createRenderer(container);
  // Settings live in the save, which loads while the GPU starts up; wait briefly for it.
  await whenProgressSettles();
  const settings = progress.get().save?.settings;
  const systemReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reducedMotion =
    settings?.reducedMotion === 'on' || (settings?.reducedMotion !== 'off' && systemReducedMotion);
  const pixelRatioCap = PIXEL_RATIO_CAP[settings?.graphicsQuality ?? 'high'];
  const world = createWorld(renderer.domElement, container, reducedMotion);
  const frame = createFrameRenderer(renderer, world.scene, world.camera);

  const fit = () => {
    world.resize(container.clientWidth, container.clientHeight);
    fitToContainer(renderer, container, pixelRatioCap);
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
    // Clamp long frames (a background tab, a breakpoint) so nothing teleports.
    world.update(Math.min(timer.getDelta(), 0.1), timer.getElapsed());
    frame.render();
  });

  devStatus.update({ backend });
  console.info(`[ship-it] renderer: ${backend}, three.js r${THREE.REVISION}`);
}
