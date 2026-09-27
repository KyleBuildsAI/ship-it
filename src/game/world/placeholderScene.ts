import * as THREE from 'three/webgpu';

export interface PlaceholderWorld {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update: (elapsedSeconds: number) => void;
}

const SKY = 0x05060b;
const PORTAL_CYAN = 0x6fd3ff;
const CRATE_AMBER = 0xffb347;

/** Small seeded random generator so the starfield looks the same on every load. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createIsland(): THREE.Group {
  const island = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 5.4, 1, 48),
    new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.9 }),
  );
  const rock = new THREE.Mesh(
    new THREE.ConeGeometry(5.4, 6, 48),
    new THREE.MeshStandardMaterial({ color: 0x141820, roughness: 1 }),
  );
  rock.rotation.x = Math.PI;
  rock.position.y = -3.5;
  island.add(top, rock);
  return island;
}

function createPortal(): THREE.Group {
  const portal = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.4, 0.08, 16, 96),
    new THREE.MeshStandardMaterial({
      color: PORTAL_CYAN,
      emissive: PORTAL_CYAN,
      emissiveIntensity: 3,
    }),
  );
  const veil = new THREE.Mesh(
    new THREE.CircleGeometry(1.35, 48),
    new THREE.MeshBasicMaterial({ color: PORTAL_CYAN, transparent: true, opacity: 0.12 }),
  );
  portal.add(ring, veil);
  portal.position.set(0, 2.1, -2.5);
  return portal;
}

function createCrates(): THREE.Mesh[] {
  const material = new THREE.MeshStandardMaterial({
    color: 0x3a2a1c,
    emissive: CRATE_AMBER,
    emissiveIntensity: 0.6,
    roughness: 0.7,
  });
  const geometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  return [-2.6, -1.8, 2.2].map((x, index) => {
    const crate = new THREE.Mesh(geometry, material);
    crate.position.set(x, 0.8, 1.2 + index * 0.4);
    crate.rotation.y = index * 0.6;
    return crate;
  });
}

function createStars(count: number): THREE.InstancedMesh {
  const random = seededRandom(184);
  const stars = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.08, 0),
    new THREE.MeshBasicMaterial({ color: 0xdfe8ff }),
    count,
  );
  const placement = new THREE.Object3D();
  for (let index = 0; index < count; index++) {
    // Points on the upper part of a sphere around the island.
    const azimuth = random() * Math.PI * 2;
    const elevation = random() * Math.PI * 0.45;
    const radius = 60 + random() * 30;
    placement.position.setFromSphericalCoords(radius, Math.PI / 2 - elevation, azimuth);
    placement.scale.setScalar(0.6 + random() * 1.4);
    placement.updateMatrix();
    stars.setMatrixAt(index, placement.matrix);
  }
  return stars;
}

/**
 * A stand-in night campus: floating island, glowing portal, amber crates, stars.
 * The real Campus hub replaces it; this proves lighting, fog, and bloom work.
 */
export function createPlaceholderScene(aspect: number, reducedMotion: boolean): PlaceholderWorld {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.FogExp2(0x070a14, 0.03);

  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 200);
  camera.position.set(0, 6, 15.5);

  const island = createIsland();
  const portal = createPortal();
  const crates = createCrates();
  scene.add(island, portal, ...crates, createStars(500));

  // Key + rim + low ambient (DESIGN.md section 14).
  const key = new THREE.DirectionalLight(0xbfd8ff, 2.2);
  key.position.set(6, 10, 4);
  const rim = new THREE.PointLight(0xff7a45, 40, 40);
  rim.position.set(-6, 3, -6);
  const portalGlow = new THREE.PointLight(PORTAL_CYAN, 12, 10);
  portalGlow.position.copy(portal.position);
  scene.add(new THREE.AmbientLight(0x223355, 0.6), key, rim, portalGlow);

  // Reduced motion keeps the scene alive but slows everything down.
  const motion = reducedMotion ? 0.25 : 1;

  return {
    scene,
    camera,
    update: (elapsed) => {
      const t = elapsed * motion;
      island.position.y = Math.sin(t * 0.5) * 0.15;
      portal.rotation.z = t * 0.4;
      portal.position.y = 2.1 + island.position.y;
      crates.forEach((crate, index) => {
        crate.position.y = 0.8 + island.position.y + Math.sin(t * 1.2 + index) * 0.08;
      });
    },
  };
}
