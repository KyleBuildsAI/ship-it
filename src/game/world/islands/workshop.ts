import * as THREE from 'three/webgpu';
import { NO_BEATS, part, type Palette, type Props } from './kit';

/** Act 7: a workbench with a robot on it, and gears turning on the wall behind. */
export function workshop(colors: Palette): Props {
  const group = new THREE.Group();
  group.add(part(new THREE.BoxGeometry(5, 0.2, 2), colors.base, 0, 1, -1));
  const leg = new THREE.BoxGeometry(0.2, 1, 0.2);
  for (const [x, z] of [
    [-2.3, -1.8],
    [2.3, -1.8],
    [-2.3, -0.2],
    [2.3, -0.2],
  ] as const) {
    group.add(part(leg, colors.dark, x, 0.5, z));
  }
  // The robot: a body, a head with a glowing visor, and arms.
  const robot = new THREE.Group();
  robot.add(part(new THREE.BoxGeometry(0.9, 1, 0.6), colors.light, 0, 0.5, 0));
  const head = new THREE.Group();
  head.add(part(new THREE.SphereGeometry(0.4, 20, 16), colors.light, 0, 0, 0));
  head.add(part(new THREE.BoxGeometry(0.55, 0.14, 0.1), colors.glow, 0, 0.02, 0.36));
  head.position.y = 1.35;
  robot.add(head);
  const arm = new THREE.BoxGeometry(0.18, 0.75, 0.18);
  robot.add(part(arm, colors.base, -0.6, 0.55, 0), part(arm, colors.base, 0.6, 0.55, 0));
  robot.position.set(0, 1.1, -1);
  group.add(robot);
  // The wall behind, with gears.
  group.add(part(new THREE.BoxGeometry(7, 3.4, 0.2), colors.dark, 0, 1.7, -3));
  const gear = new THREE.TorusGeometry(0.6, 0.16, 8, 12);
  const gears = [-2.2, 2.2].map((x, index) => {
    const mesh = part(gear, colors.glow, x, 2.3 - index * 0.5, -2.85);
    group.add(mesh);
    return mesh;
  });
  return {
    group,
    animate: (elapsed) => {
      gears.forEach((mesh, index) => {
        mesh.rotation.z = elapsed * (index === 0 ? 0.8 : -0.8);
      });
      head.rotation.y = Math.sin(elapsed * 0.9) * 0.5;
    },
    beats: NO_BEATS,
  };
}
