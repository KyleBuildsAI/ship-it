import * as THREE from 'three/webgpu';
import { NO_BEATS, part, type Palette, type Props } from './kit';

/** Act 4: a town square with a notice board of issues, and houses for the team around it. */
export function town(colors: Palette): Props {
  const group = new THREE.Group();
  group.add(part(new THREE.CylinderGeometry(4, 4, 0.1, 48), colors.base, 0, 0.05, 0));
  // The notice board: two posts, a board, and coloured cards pinned on it.
  const post = new THREE.BoxGeometry(0.15, 2.2, 0.15);
  group.add(part(post, colors.dark, -1.3, 1.1, -1.5), part(post, colors.dark, 1.3, 1.1, -1.5));
  group.add(part(new THREE.BoxGeometry(2.9, 1.5, 0.1), colors.dark, 0, 1.6, -1.5));
  const cards: THREE.Mesh[] = [];
  const card = new THREE.BoxGeometry(0.55, 0.4, 0.04);
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 4; column++) {
      const material = (row + column) % 3 === 0 ? colors.glow : colors.light;
      const mesh = part(card, material, -1 + column * 0.66, 1.95 - row * 0.62, -1.43);
      mesh.rotation.z = ((row * 4 + column) % 3) * 0.05 - 0.05;
      cards.push(mesh);
      group.add(mesh);
    }
  }
  // The houses around the square, one per teammate.
  const body = new THREE.BoxGeometry(1.6, 1.3, 1.6);
  const roof = new THREE.ConeGeometry(1.3, 0.9, 4);
  [-0.9, -0.3, 0.3, 0.9].forEach((angle) => {
    const x = Math.sin(angle) * 8;
    const z = -Math.cos(angle) * 8;
    const house = new THREE.Group();
    house.add(part(body, colors.base, 0, 0.65, 0));
    const top = part(roof, colors.glow, 0, 1.75, 0);
    top.rotation.y = Math.PI / 4;
    house.add(top);
    house.position.set(x, 0, z);
    house.lookAt(0, 0, 0);
    group.add(house);
  });
  return {
    group,
    animate: (elapsed) => {
      const lit = Math.floor(elapsed) % cards.length;
      cards.forEach((mesh, index) => {
        mesh.scale.setScalar(index === lit ? 1.12 : 1);
      });
    },
    beats: NO_BEATS,
  };
}
