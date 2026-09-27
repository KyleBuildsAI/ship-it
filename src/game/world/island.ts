import * as THREE from 'three/webgpu';

export interface Island {
  readonly group: THREE.Group;
  /** The walkable top surface, used for click-to-walk raycasts. */
  readonly ground: THREE.Mesh;
  readonly radius: number;
}

/** A floating island: a flat top to walk on and a rocky cone hanging below. */
export function createIsland(radius: number, topColor: number): Island {
  const group = new THREE.Group();
  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.92, 1, 64),
    new THREE.MeshStandardMaterial({ color: topColor, roughness: 0.92 }),
  );
  ground.position.y = -0.5;
  const rock = new THREE.Mesh(
    new THREE.ConeGeometry(radius * 0.92, radius * 0.9, 48),
    new THREE.MeshStandardMaterial({ color: 0x131722, roughness: 1 }),
  );
  rock.rotation.x = Math.PI;
  rock.position.y = -1 - radius * 0.45;
  // A faint glowing rim so the island edge reads at night.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.05, 8, 128),
    new THREE.MeshStandardMaterial({ color: 0x3a6ea8, emissive: 0x3a6ea8, emissiveIntensity: 0.8 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.01;
  group.add(ground, rock, rim);
  return { group, ground, radius };
}

/** A seeded random generator so decorations look the same on every load. */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A dome of stars far beyond the fog. */
export function createStars(count: number): THREE.InstancedMesh {
  const random = seededRandom(184);
  const stars = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.1, 0),
    // Stars sit far outside the fog; without fog: false they would fade to nothing.
    new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false }),
    count,
  );
  const placement = new THREE.Object3D();
  for (let index = 0; index < count; index++) {
    const azimuth = random() * Math.PI * 2;
    const elevation = random() * Math.PI * 0.45;
    placement.position.setFromSphericalCoords(80 + random() * 40, Math.PI / 2 - elevation, azimuth);
    placement.scale.setScalar(0.6 + random() * 1.4);
    placement.updateMatrix();
    stars.setMatrixAt(index, placement.matrix);
  }
  return stars;
}
