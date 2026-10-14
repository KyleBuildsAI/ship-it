import * as THREE from 'three/webgpu';
import { NO_BEATS, part, type Palette, type Props } from './kit';

/** Act 5: a road through a row of gates, each with a light, and two watchtowers. */
export function gates(colors: Palette): Props {
  const group = new THREE.Group();
  group.add(part(new THREE.BoxGeometry(1.8, 0.06, 14), colors.base, 0, 0.03, 0));
  const pillar = new THREE.BoxGeometry(0.35, 2.4, 0.35);
  const beam = new THREE.BoxGeometry(2.8, 0.3, 0.4);
  const bulb = new THREE.SphereGeometry(0.2, 16, 12);
  const pass = new THREE.MeshStandardMaterial({
    color: 0x7ee2a8,
    emissive: 0x7ee2a8,
    emissiveIntensity: 2,
  });
  const lights: THREE.Mesh[] = [];
  [-4.5, -1.5, 1.5, 4.5].forEach((z) => {
    group.add(part(pillar, colors.dark, -1.2, 1.2, z), part(pillar, colors.dark, 1.2, 1.2, z));
    group.add(part(beam, colors.glow, 0, 2.5, z));
    const light = part(bulb, pass, 0, 2.95, z);
    lights.push(light);
    group.add(light);
  });
  const tower = new THREE.CylinderGeometry(0.7, 0.9, 4, 16);
  const cap = new THREE.ConeGeometry(1, 1.2, 16);
  for (const x of [-5.5, 5.5]) {
    group.add(part(tower, colors.base, x, 2, -3), part(cap, colors.glow, x, 4.6, -3));
  }
  return {
    group,
    animate: (elapsed) => {
      // The lights go green one gate after another, like checks passing in order.
      const lit = Math.floor(elapsed * 1.5) % (lights.length + 1);
      lights.forEach((light, index) => {
        light.visible = index < lit;
      });
    },
    beats: NO_BEATS,
  };
}
