import * as THREE from 'three/webgpu';
import { chooseBackend, clampPixelRatio, readForcedBackend, type Backend } from './backend';

export interface RendererHandle {
  renderer: THREE.WebGPURenderer;
  backend: Backend;
}

async function hasWebGPUAdapter(): Promise<boolean> {
  if (!('gpu' in navigator)) return false;
  try {
    return (await navigator.gpu.requestAdapter()) !== null;
  } catch (error: unknown) {
    // A probe that throws means WebGPU isn't usable here, which is exactly what the
    // WebGL2 fallback is for. Report it quietly instead of failing the boot.
    console.info('[ship-it] WebGPU adapter probe failed, using WebGL2', error);
    return false;
  }
}

/**
 * Matches the canvas to its container. Also re-reads the pixel ratio, which changes
 * with browser zoom or when the window moves to a different monitor.
 */
export function fitToContainer(renderer: THREE.WebGPURenderer, container: HTMLElement): void {
  renderer.setPixelRatio(clampPixelRatio(window.devicePixelRatio));
  renderer.setSize(container.clientWidth, container.clientHeight);
}

/**
 * Creates the renderer, preferring WebGPU. The adapter probe is explicit so the
 * fallback decision is ours and visible in the status badge.
 */
export async function createRenderer(container: HTMLElement): Promise<RendererHandle> {
  const forced = readForcedBackend(window.location.search);
  const adapterAvailable = forced === null ? await hasWebGPUAdapter() : false;
  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    forceWebGL: chooseBackend(forced, adapterAvailable) === 'webgl2',
  });
  fitToContainer(renderer, container);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  // The GPU device is created here. Rendering before this resolves draws nothing.
  await renderer.init();

  // Even without forceWebGL, three.js can fall back on its own, so ask what it chose.
  // three.js marks its WebGPU backend with an `isWebGPUBackend` flag rather than a common type.
  const backend = 'isWebGPUBackend' in renderer.backend ? 'webgpu' : 'webgl2';
  return { renderer, backend };
}
