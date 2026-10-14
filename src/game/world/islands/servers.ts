import * as THREE from 'three/webgpu';
import { NO_BEATS, part, type Palette, type Props } from './kit';

/** Act 6: racks of servers joined by pipes, and a database drum where the pipes end. */
export function servers(colors: Palette): Props {
  const group = new THREE.Group();
  const rack = new THREE.BoxGeometry(1.2, 2.6, 1);
  const strip = new THREE.BoxGeometry(0.9, 0.06, 0.02);
  const blinkers: THREE.Mesh[] = [];
  [-4, -2, 0, 2].forEach((x) => {
    group.add(part(rack, colors.dark, x, 1.3, -2));
    for (let level = 0; level < 5; level++) {
      const light = part(strip, colors.glow, x, 0.5 + level * 0.45, -1.49);
      blinkers.push(light);
      group.add(light);
    }
  });
  // The pipe runs along the racks' feet to the database.
  const pipe = new THREE.CylinderGeometry(0.15, 0.15, 9, 12);
  const run = part(pipe, colors.base, 0.5, 0.2, -0.8);
  run.rotation.z = Math.PI / 2;
  group.add(run);
  const drop = part(new THREE.CylinderGeometry(0.15, 0.15, 2, 12), colors.base, 5, 0.2, 0.2);
  drop.rotation.x = Math.PI / 2;
  group.add(drop);
  const drum = new THREE.CylinderGeometry(1, 1, 0.55, 32);
  [0, 1, 2].forEach((level) => {
    group.add(part(drum, level === 1 ? colors.glow : colors.light, 5, 0.3 + level * 0.6, 1.8));
  });
  return {
    group,
    animate: (elapsed) => {
      blinkers.forEach((light, index) => {
        light.visible = Math.sin(elapsed * 3 + index * 1.7) > -0.4;
      });
    },
    beats: NO_BEATS,
  };
}
