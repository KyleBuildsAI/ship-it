import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { float, pass, smoothstep, uv, vec2 } from 'three/tsl';
import * as THREE from 'three/webgpu';

export interface FrameRenderer {
  render: () => void;
}

/**
 * Bloom + vignette post stack (DESIGN.md section 12), built from TSL nodes. If building
 * the pipeline or rendering through it throws, every later frame renders directly, so
 * the player sees an unpolished frame instead of a black screen. (Shader build errors
 * inside a node don't throw: three.js logs them as `THREE.TSL` console errors, which the
 * smoke test's zero-errors check catches before a change can merge.)
 */
export function createFrameRenderer(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): FrameRenderer {
  let pipeline: THREE.RenderPipeline | null = null;
  const disposables: { dispose: () => void }[] = [];

  try {
    pipeline = new THREE.RenderPipeline(renderer);
    const scenePass = pass(scene, camera);
    const sceneColor = scenePass.getTextureNode('output');
    // Low threshold so emissive crates, banners, and portals glow; strength kept gentle for text.
    const glow = bloom(sceneColor, 0.8, 0.45, 0.25);
    disposables.push(scenePass, glow);
    const distanceFromCenter = uv().sub(vec2(0.5, 0.5)).length();
    const vignette = float(1).sub(smoothstep(0.4, 0.95, distanceFromCenter).mul(0.55));
    pipeline.outputNode = sceneColor.add(glow).mul(vignette);
  } catch (error: unknown) {
    console.warn('[ship-it] post-processing unavailable, rendering directly', error);
    pipeline = null;
  }

  return {
    render: () => {
      if (pipeline) {
        // RenderPipeline switches these off mid-render and only restores them if it
        // finishes, so remember them in case it throws partway through.
        const { toneMapping, outputColorSpace } = renderer;
        try {
          pipeline.render();
          return;
        } catch (error: unknown) {
          console.warn('[ship-it] post-processing failed, rendering directly', error);
          renderer.toneMapping = toneMapping;
          renderer.outputColorSpace = outputColorSpace;
          // The pipeline only frees its own quad; the pass and bloom hold render targets too.
          pipeline.dispose();
          disposables.forEach((node) => {
            node.dispose();
          });
          pipeline = null;
        }
      }
      renderer.render(scene, camera);
    },
  };
}
