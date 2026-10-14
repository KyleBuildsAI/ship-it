import * as THREE from 'three/webgpu';
import { NO_BEATS, part, type Palette, type Props } from './kit';

/** Act 8: an interview hall: pillars in a half circle, a table, chairs and a whiteboard. */
export function hall(colors: Palette): Props {
  const group = new THREE.Group();
  group.add(part(new THREE.CylinderGeometry(6, 6, 0.12, 48), colors.base, 0, 0.06, -2));
  const pillar = new THREE.CylinderGeometry(0.3, 0.35, 3.6, 16);
  for (let index = 0; index < 7; index++) {
    const angle = -Math.PI / 2 + (index / 6) * Math.PI;
    group.add(part(pillar, colors.light, Math.sin(angle) * 6, 1.8, -2 - Math.cos(angle) * 6));
  }
  group.add(part(new THREE.BoxGeometry(3.4, 0.15, 1.2), colors.dark, 0, 0.95, -2));
  const tableLeg = new THREE.BoxGeometry(0.15, 0.9, 0.15);
  for (const x of [-1.5, 1.5]) group.add(part(tableLeg, colors.dark, x, 0.45, -2));
  const seat = new THREE.BoxGeometry(0.6, 0.1, 0.6);
  const back = new THREE.BoxGeometry(0.6, 0.7, 0.1);
  // The panel on the far side, and the candidate's chair on the near side.
  for (const [x, z, facing] of [
    [-1, -3.1, 1],
    [0, -3.1, 1],
    [1, -3.1, 1],
    [0, -0.9, -1],
  ] as const) {
    group.add(part(seat, colors.base, x, 0.55, z));
    group.add(part(back, colors.base, x, 0.9, z - facing * 0.28));
  }
  group.add(part(new THREE.BoxGeometry(3.2, 1.8, 0.1), colors.light, 0, 2.2, -6.5));
  const marker = part(new THREE.BoxGeometry(2.4, 0.06, 0.02), colors.glow, 0, 2.6, -6.44);
  group.add(marker);
  return {
    group,
    animate: (elapsed) => {
      // Someone is drawing on the whiteboard: the line grows and starts again.
      marker.scale.x = 0.2 + ((elapsed * 0.25) % 1) * 0.8;
    },
    beats: NO_BEATS,
  };
}
