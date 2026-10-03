import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three/webgpu';
import type { Workspace } from '../../engine/workspace';
import { shortId } from '../../engine/git/hash';
import { isTypingTarget, isWorldTarget } from '../../ui/focus';
import { closeActMenu, suggest } from '../hud';
import { sandbox } from '../sandbox';
import { worldState, type ActIslandZone, type ZoneId } from '../worldState';
import { createActIsland } from './actIsland';
import { createAvatar } from './avatar';
import { createCampus, PORTAL_RING_HEIGHT } from './campus';
import { describeCrates } from './crateLayout';
import { CommitPath } from './commitPath';
import { CrateYard } from './crateYard';
import { machineQueries } from '../../engine/machine/queries';
import { createGitWorld, GIT_WORLD_CENTER } from './gitWorld';
import { describeTerraces } from './machine/terraceLayout';
import { createMachineIsland, MACHINE_CENTER } from './machineIsland';
import { describeHistory } from './historyLayout';
import { suggestFor, type WorldTarget } from './suggestions';
import { createStars } from './island';
import { installTestHooks } from './testHooks';
import {
  CAMERA_RIGS,
  perActIsland,
  doorwayAt,
  openActs,
  zoneForAct,
  type Doorway,
  type Zone,
} from './zones';
import {
  clampToDisc,
  GROUNDED,
  isGrounded,
  keyDirection,
  startJump,
  stepJump,
  stepToward,
  WALK_SPEED,
  type Flat,
  type Jump,
  type MoveKeys,
} from './movement';

export interface World {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  update: (dt: number, elapsed: number) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

const KEY_BINDINGS: Record<string, keyof MoveKeys> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

/** A press shorter and stiller than this is a click; anything else is a camera drag. */
const CLICK_MAX_PIXELS = 6;
const CLICK_MAX_MS = 400;

/**
 * Builds the explorable world: Campus, the Git World, the machine island and the themed
 * islands of Acts 3 to 8, each floating on its own, plus the
 * player's avatar, a third-person camera with damped orbit, WASD and click-to-walk.
 * `fadeTarget` fades out and back in while the player travels between islands.
 */
export function createWorld(
  canvas: HTMLCanvasElement,
  fadeTarget: HTMLElement,
  reducedMotion: boolean,
): World {
  const motion = reducedMotion ? 0.25 : 1;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05060b);
  scene.fog = new THREE.FogExp2(0x070a14, 0.022);

  const campus = createCampus(openActs());
  const gitWorld = createGitWorld();
  const machine = createMachineIsland();
  const actIslands = perActIsland(createActIsland);
  const avatar = createAvatar(motion);
  // The stars follow the camera (see update), so the sky surrounds whichever island you're on.
  const stars = createStars(1400);
  scene.add(campus.island.group, gitWorld.island.group, machine.island.group, avatar.group, stars);
  for (const built of Object.values(actIslands)) scene.add(built.island.group);

  // Key + rim + low ambient (DESIGN.md section 14); the lights follow the player between islands.
  const lights = new THREE.Group();
  const key = new THREE.DirectionalLight(0xbfd8ff, 2.2);
  key.position.set(8, 14, 6);
  const rim = new THREE.PointLight(0xff7a45, 60, 60);
  rim.position.set(-10, 5, -10);
  lights.add(key, key.target, rim);
  scene.add(new THREE.AmbientLight(0x223355, 0.7), lights);

  const camera = new THREE.PerspectiveCamera(
    50,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    300,
  );
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 20;
  controls.maxPolarAngle = Math.PI * 0.46;

  // Each island as data (zones.ts), plus the portal meshes a click can hit.
  const campusPortals = campus.portals.flatMap((portal) => {
    const to = portal.locked ? null : zoneForAct(portal.act);
    return to ? [{ group: portal.group, doorway: { at: portal.at, to } }] : [];
  });
  const gitWorldExit: { group: THREE.Object3D; doorway: Doorway } = {
    group: gitWorld.exit.group,
    doorway: { at: gitWorld.exit.at, to: 'campus' },
  };
  const machineExit: { group: THREE.Object3D; doorway: Doorway } = {
    group: machine.exit.group,
    doorway: { at: machine.exit.at, to: 'campus' },
  };
  /** An Act island's portal home, which a click can hit like any other portal. */
  const actExit = (zone: ActIslandZone) => ({
    group: actIslands[zone].exit.group,
    doorway: { at: actIslands[zone].exit.at, to: 'campus' } satisfies Doorway,
  });
  const portalsIn: Record<ZoneId, readonly { group: THREE.Object3D; doorway: Doorway }[]> = {
    campus: campusPortals,
    gitworld: [gitWorldExit],
    machine: [machineExit],
    ...perActIsland(({ zone }) => [actExit(zone)]),
  };
  const zones: Record<ZoneId, Zone & { ground: THREE.Object3D }> = {
    ...perActIsland(({ zone, center }) => ({
      id: zone,
      center,
      radius: actIslands[zone].island.radius - 1,
      spawn: actIslands[zone].spawn,
      rig: CAMERA_RIGS[zone],
      doorways: [actExit(zone).doorway],
      ground: actIslands[zone].island.ground,
    })),
    campus: {
      id: 'campus',
      center: { x: 0, z: 0 },
      radius: campus.island.radius - 1,
      spawn: campus.spawn,
      rig: CAMERA_RIGS.campus,
      doorways: campusPortals.map((portal) => portal.doorway),
      ground: campus.island.ground,
    },
    gitworld: {
      id: 'gitworld',
      center: GIT_WORLD_CENTER,
      radius: gitWorld.island.radius - 1,
      spawn: gitWorld.spawn,
      rig: CAMERA_RIGS.gitworld,
      doorways: [gitWorldExit.doorway],
      ground: gitWorld.island.ground,
    },
    machine: {
      id: 'machine',
      center: MACHINE_CENTER,
      radius: machine.island.radius - 1,
      spawn: machine.spawn,
      rig: CAMERA_RIGS.machine,
      doorways: [machineExit.doorway],
      ground: machine.island.ground,
    },
  };

  let zone: ZoneId = 'campus';
  let position: Flat = { ...campus.spawn };
  let walkTarget: Flat | null = null;
  let jump: Jump = GROUNDED;
  let walking = false;
  let travelling = false;
  const keys: MoveKeys = { forward: false, back: false, left: false, right: false };

  const placeCamera = (at: Flat) => {
    const { height, back } = zones[zone].rig;
    controls.target.set(at.x, 1.2, at.z);
    camera.position.set(at.x, height, at.z + back);
  };
  placeCamera(position);

  const travel = (to: ZoneId) => {
    if (travelling) return;
    travelling = true;
    walkTarget = null;
    const arrive = () => {
      zone = to;
      position = { ...zones[to].spawn };
      placeCamera(position);
      worldState.update({ zone });
      closeActMenu();
      fadeTarget.style.opacity = '1';
      travelling = false;
    };
    if (reducedMotion) {
      arrive();
      return;
    }
    fadeTarget.style.opacity = '0';
    window.setTimeout(arrive, 350);
  };

  // The Git World mirrors the sandbox: any engine event marks the crates and the commit
  // path for a redraw, done at most once per frame however many events a command produced.
  const yard = new CrateYard(gitWorld, scene);
  const path = new CommitPath(gitWorld, scene);
  let watched: Workspace | null = null;
  let stopWatching: () => void = () => {
    // Nothing to stop until the first workspace is watched.
  };
  let cratesDirty = true;
  let committedSinceSync = false;
  const watch = () => {
    const ws = sandbox.get().shell.ws;
    if (ws === watched) return;
    stopWatching();
    watched = ws;
    cratesDirty = true;
    stopWatching = ws.events.on((event) => {
      cratesDirty = true;
      if (event.type === 'committed') committedSinceSync = true;
    });
  };
  watch();
  const stopSandbox = sandbox.subscribe(watch);

  // What the player can click: things in the Git World suggest a command, an open portal
  // walks the avatar into its ring (stepping through travels, see update), and the ground
  // walks there. A drag turns the camera instead, so tell clicks and drags apart.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pressed: { x: number; y: number; at: number } | null = null;

  /** What in the Git World the ray hits: a crate, a commit platform, or the Vault. */
  const pickTarget = (): WorldTarget | null => {
    const crate = yard.pick(raycaster);
    if (crate) return { kind: 'crate', path: crate.path, area: crate.area, look: crate.look };
    const commit = path.pick(raycaster);
    if (commit) return { kind: 'commit', shortId: shortId(commit) };
    if (raycaster.intersectObjects([...gitWorld.vaultMeshes], false)[0]) return { kind: 'vault' };
    return null;
  };

  const aimAt = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
  };

  // A pointer cursor over anything clickable in the Git World, so it reads as interactive.
  const onPointerMove = (event: PointerEvent) => {
    if (zone !== 'gitworld' || pressed) return;
    aimAt(event);
    canvas.style.cursor = pickTarget() ? 'pointer' : '';
  };

  const onPointerDown = (event: PointerEvent) => {
    pressed = { x: event.clientX, y: event.clientY, at: performance.now() };
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!pressed) return;
    const moved = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
    const quick = performance.now() - pressed.at < CLICK_MAX_MS;
    pressed = null;
    if (moved > CLICK_MAX_PIXELS) {
      // That was a drag, which turned the camera.
      worldState.update({ looks: worldState.get().looks + 1 });
      return;
    }
    if (!quick) return;

    aimAt(event);

    // DESIGN.md pillar 2: a click never changes git state itself; it offers the command.
    const target = zone === 'gitworld' ? pickTarget() : null;
    suggest(target ? suggestFor(target) : null);
    if (target) return;

    // The nearest portal the ray hits, if several line up.
    let clicked: Doorway | null = null;
    let clickedDistance = Infinity;
    for (const portal of portalsIn[zone]) {
      const hit = raycaster.intersectObject(portal.group, true)[0];
      if (hit && hit.distance < clickedDistance) {
        clicked = portal.doorway;
        clickedDistance = hit.distance;
      }
    }
    if (clicked) {
      walkTarget = clicked.at;
      return;
    }
    const { ground, center, radius } = zones[zone];
    const groundHit = raycaster.intersectObject(ground, false)[0];
    if (groundHit) {
      walkTarget = clampToDisc({ x: groundHit.point.x, z: groundHit.point.z }, center, radius);
    }
  };

  const onKey = (down: boolean) => (event: KeyboardEvent) => {
    const binding = KEY_BINDINGS[event.code];
    if (!binding) return;
    // Keys typed into the terminal or editor never move the avatar.
    if (down && isTypingTarget(event.target)) return;
    keys[binding] = down;
    if (down) walkTarget = null;
  };
  // Space jumps, but not while typing, and not when a HUD button has focus (Space presses it).
  const onJumpKey = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || event.repeat || !isWorldTarget(event.target)) return;
    event.preventDefault();
    if (travelling || !isGrounded(jump)) return;
    jump = startJump(jump);
    worldState.update({ jumps: worldState.get().jumps + 1 });
  };
  const onKeyDown = onKey(true);
  const onKeyUp = onKey(false);
  // Keys released while the window is in the background never send keyup.
  const releaseAll = () => {
    keys.forward = keys.back = keys.left = keys.right = false;
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keydown', onJumpKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAll);

  // A HUD panel on the left covers part of the view. Shifting the projection by half its
  // width keeps whatever the camera looks at centred in the space still visible, and
  // raycasts stay correct because they use the same projection.
  let viewSize = { width: canvas.clientWidth, height: canvas.clientHeight };
  const frameAroundPanels = () => {
    const inset = worldState.get().leftInset;
    const { width, height } = viewSize;
    if (inset > 0) camera.setViewOffset(width, height, -inset / 2, 0, width, height);
    else camera.clearViewOffset();
  };
  frameAroundPanels();
  const stopInset = worldState.subscribe(frameAroundPanels);

  const removeTestHooks = installTestHooks({
    avatarHeight: () => jump.height,
    zone: () => zone,
    portalPoint: (act) => {
      const portal = campus.portals.find((candidate) => candidate.act === act);
      if (!portal || zone !== 'campus') return null;
      // The middle of the ring, projected through the camera onto the canvas.
      const point = new THREE.Vector3(portal.at.x, PORTAL_RING_HEIGHT, portal.at.z).project(camera);
      if (Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || point.z > 1) return null;
      const bounds = canvas.getBoundingClientRect();
      return {
        x: bounds.left + ((point.x + 1) / 2) * bounds.width,
        y: bounds.top + ((1 - point.y) / 2) * bounds.height,
      };
    },
  });

  const follow = new THREE.Vector3();
  return {
    scene,
    camera,
    update: (dt, elapsed) => {
      campus.update(elapsed);
      gitWorld.update(elapsed);
      machine.update(elapsed);
      for (const built of Object.values(actIslands)) built.update(elapsed);
      if (cratesDirty && watched) {
        yard.sync(describeCrates(watched), committedSinceSync);
        path.sync(watched.repo ? describeHistory(watched.repo) : null);
        // The laptop's terraces redraw from the same events: a cd, a mkdir, a new tab.
        machine.sync(watched.machine ? describeTerraces(machineQueries(watched.machine)) : null);
        cratesDirty = false;
        committedSinceSync = false;
      }
      yard.update(dt);
      path.update(dt, elapsed);

      let direction = travelling ? null : keyDirection(keys, controls.getAzimuthalAngle());
      if (direction) {
        position = {
          x: position.x + direction.x * WALK_SPEED * dt,
          z: position.z + direction.z * WALK_SPEED * dt,
        };
      } else if (walkTarget && !travelling) {
        const step = stepToward(position, walkTarget, WALK_SPEED, dt);
        direction = { x: walkTarget.x - position.x, z: walkTarget.z - position.z };
        position = step.position;
        if (step.arrived) walkTarget = null;
      }
      position = clampToDisc(position, zones[zone].center, zones[zone].radius);
      // Walking into an open portal's ring, by keys or by a click, steps through it.
      const doorway = travelling ? null : doorwayAt(position, zones[zone].doorways);
      if (doorway) travel(doorway.to);
      // Count each walk once, when it starts, rather than touching the store every frame.
      if (direction && !walking)
        worldState.update({ hasMoved: true, walks: worldState.get().walks + 1 });
      walking = direction !== null;
      jump = stepJump(jump, dt);
      avatar.group.position.set(position.x, 0, position.z);
      avatar.update(dt, elapsed, direction, jump.height);

      // The camera keeps its orbit but follows the player, easing rather than snapping.
      follow
        .set(position.x, 1.2, position.z)
        .sub(controls.target)
        .multiplyScalar(Math.min(1, dt * 6));
      controls.target.add(follow);
      camera.position.add(follow);
      controls.update(dt);
      lights.position.set(position.x, 0, position.z);
      stars.position.copy(camera.position);
    },
    resize: (width, height) => {
      viewSize = { width, height };
      camera.aspect = width / height;
      frameAroundPanels();
    },
    dispose: () => {
      removeTestHooks();
      stopInset();
      stopWatching();
      stopSandbox();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keydown', onJumpKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      controls.dispose();
    },
  };
}
