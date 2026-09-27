import * as THREE from 'three/webgpu';
import { headingOf, turnToward, type Flat } from './movement';

const VISOR = 0x6fd3ff;

export interface Avatar {
  readonly group: THREE.Group;
  /**
   * Animates the avatar: `direction` is null while standing still, and `height` is how
   * far a jump has lifted it off the ground.
   */
  update: (dt: number, elapsed: number, direction: Flat | null, height: number) => void;
}

/**
 * The player: a small robot with a glowing visor and a hover ring. In the Git World it
 * doubles as HEAD, standing on whichever commit HEAD points to.
 */
export function createAvatar(motion: number): Avatar {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 0.7, 6, 16),
    new THREE.MeshStandardMaterial({ color: 0x1d2640, roughness: 0.45, metalness: 0.4 }),
  );
  body.position.y = 0.75;
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: VISOR, emissive: VISOR, emissiveIntensity: 2.5 }),
  );
  visor.position.set(0, 1.05, 0.28);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.03, 8, 48),
    new THREE.MeshStandardMaterial({ color: VISOR, emissive: VISOR, emissiveIntensity: 1.6 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  const body3d = new THREE.Group();
  body3d.add(body, visor);
  group.add(body3d, ring);

  let heading = 0;
  return {
    group,
    update: (dt, elapsed, direction, height) => {
      if (direction) heading = turnToward(heading, headingOf(direction), 10, dt);
      body3d.rotation.y = heading;
      // A gentle hover while idle, a quicker bob while walking; both shrink with reduced motion.
      const bob = direction ? Math.sin(elapsed * 12) * 0.05 : Math.sin(elapsed * 2) * 0.04;
      // In the air: no bob. The ring stays on the ground and shrinks, like a shadow.
      body3d.position.y = height > 0 ? height : bob * motion;
      const shadow = 1 - Math.min(height, 1.2) * 0.35;
      ring.scale.setScalar(shadow * (1 + Math.sin(elapsed * 3) * 0.06 * motion));
    },
  };
}
