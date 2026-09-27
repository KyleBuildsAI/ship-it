import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { float, pass, smoothstep, uv, vec2 } from 'three/tsl';
import * as THREE from 'three/webgpu';

export interface FrameRenderer {
  render: () => void;
}

/**
 * three.js reports shader build failures through its own console hook instead of
 * throwing: it logs a `THREE.TSL` error and draws with a blank material. Counting those
 * errors is the only way to notice that the post stack turned the screen black.
 * Every message is still forwarded to the real console.
 */
function countThreeErrors(): () => number {
  let errors = 0;
  // The type says this is always a function, but three.js returns null until someone sets one.
  const previous = THREE.getConsoleFunction() as ReturnType<typeof THREE.getConsoleFunction> | null;
  THREE.setConsoleFunction((type, message, ...params) => {
    if (type === 'error') errors++;
    if (previous) {
      previous(type, message, ...params);
    } else if (type === 'error') {
      console.error(message, ...params);
    } else if (type === 'warn') {
      console.warn(message, ...params);
    } else {
      console.log(message, ...params);
    }
  });
  return () => errors;
}

/**
 * Bloom + vignette post stack (DESIGN.md section 12), built from TSL nodes. If building
 * or rendering the pipeline fails, every later frame renders directly, so the player
 * sees an unpolished frame instead of a black screen.
 */
export function createFrameRenderer(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): FrameRenderer {
  const threeErrorCount = countThreeErrors();
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
        // RenderPipeline switches these off mid-render and only restores them if it
        // finishes, so remember them in case it fails partway through.
        const { toneMapping, outputColorSpace } = renderer;
        const errorsBefore = threeErrorCount();
        try {
          pipeline.render();
          if (threeErrorCount() === errorsBefore) return;
          console.warn('[ship-it] post-processing shaders failed to build, rendering directly');
        } catch (error: unknown) {
          console.warn('[ship-it] post-processing failed, rendering directly', error);
        }
        renderer.toneMapping = toneMapping;
        renderer.outputColorSpace = outputColorSpace;
        pipeline.dispose();
        pipeline = null;
      }
      renderer.render(scene, camera);
    },
  };
}
