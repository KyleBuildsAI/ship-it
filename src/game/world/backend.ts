export type Backend = 'webgpu' | 'webgl2';

/** Rendering at more than 2x the CSS pixel size costs a lot of GPU time for detail nobody can see. */
export const MAX_PIXEL_RATIO = 2;

/**
 * `?backend=webgl2` in the URL forces the WebGL2 fallback, so the fallback path can be
 * checked on a machine that supports WebGPU.
 */
export function readForcedBackend(search: string): Backend | null {
  return new URLSearchParams(search).get('backend') === 'webgl2' ? 'webgl2' : null;
}

/** WebGPU when the browser offers an adapter and nothing forces the fallback; otherwise WebGL2. */
export function chooseBackend(forced: Backend | null, hasWebGPUAdapter: boolean): Backend {
  if (forced !== null) return forced;
  return hasWebGPUAdapter ? 'webgpu' : 'webgl2';
}

export function clampPixelRatio(devicePixelRatio: number, max = MAX_PIXEL_RATIO): number {
  return Math.min(Math.max(devicePixelRatio, 1), max);
}
