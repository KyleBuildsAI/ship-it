import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { float, pass, smoothstep, uv, vec2 } from 'three/tsl';
import * as THREE from 'three/webgpu';

export interface FrameRenderer {
  render: () => void;
}

/**
 * Bloom + vignette post stack (DESIGN.md section 12), built from TSL nodes. If the
 * node graph fails to build or render, it drops to plain rendering so the player
 * sees an unpolished frame instead of a black screen.
 */
export function createFrameRenderer(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): FrameRenderer {
  let pipeline: THREE.RenderPipeline | null = null;

  try {
    pipeline = new THREE.RenderPipeline(renderer);
    const sceneColor = pass(scene, camera).getTextureNode('output');
    // Low threshold so emissive crates, banners, and portals glow; strength kept gentle for text.
    const glow = bloom(sceneColor, 0.8, 0.45, 0.25);
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
        try {
          pipeline.render();
          return;
        } catch (error: unknown) {
          console.warn('[ship-it] post-processing failed, rendering directly', error);
          pipeline.dispose();
          pipeline = null;
        }
      }
      renderer.render(scene, camera);
    },
  };
}
