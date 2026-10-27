import * as THREE from 'three/webgpu';
import { phase, type Beat } from '../beatPlayer';
import type { BeatId } from '../beats';
import {
  createStage,
  part,
  popIn,
  remember,
  slide,
  type Palette,
  type Props,
  type Stage,
} from './kit';

/*
 * Act 5's island: a road through a row of gates, each with a light, and two watchtowers.
 * Its beats act out the lessons on that road: a change (a crate) rolls through the gates,
 * one check stops it, a fix lets it through, a switched-off gate lets a bug slip past, a
 * flaky gate answers the same change two ways, and the right tower is the vault where
 * secrets stay.
 */

/** Where the gates stand along the road, far end first. The camera looks up the road. */
const GATE_Z = [-4.5, -1.5, 1.5, 4.5] as const;
const TOWER_X = [-5.5, 5.5] as const;
const LIGHT_Y = 2.95;
const BEAM_Y = 2.5;
/** How far before a gate a stopped change waits, so it doesn't sit inside the arch. */
const WAIT_GAP = 0.9;
/** The gate that catches trouble in the beats: the second one, so the first can pass. */
const CHECK_GATE = 1;
/**
 * The right tower is the secret store, and keys float in front of it. Not the left one:
 * the lesson panel covers the left of the screen.
 */
const VAULT = new THREE.Vector3(5.5, 4, -1.9);
/** Where a leaked key lies: out on the road, in plain view of everyone passing. */
const LEAK_SPOT = new THREE.Vector3(0, 0.5, 2.8);

const PILLAR = new THREE.BoxGeometry(0.35, 2.4, 0.35);
const BEAM = new THREE.BoxGeometry(2.8, 0.3, 0.4);
const BULB = new THREE.SphereGeometry(0.2, 16, 12);
const TOWER = new THREE.CylinderGeometry(0.7, 0.9, 4, 16);
const CAP = new THREE.ConeGeometry(1, 1.2, 16);
const ROAD = new THREE.BoxGeometry(1.8, 0.06, 14);
/** A change travelling the road: a crate, like a parcel being inspected. */
const CRATE = new THREE.BoxGeometry(0.9, 0.6, 0.9);
/** The boom that drops across the road when a check fails. */
const BARRIER = new THREE.BoxGeometry(2.2, 0.16, 0.16);
/** One test in the testing pyramid. */
const BLOCK = new THREE.BoxGeometry(0.5, 0.42, 0.5);
const KEY_RING = new THREE.TorusGeometry(0.22, 0.07, 8, 20);
const KEY_SHANK = new THREE.BoxGeometry(0.5, 0.1, 0.1);
const KEY_TOOTH = new THREE.BoxGeometry(0.1, 0.18, 0.1);

const CRATE_Y = 0.36;
const roadPoint = (z: number) => new THREE.Vector3(0, CRATE_Y, z);
/**
 * Where a change enters the road, at the far end, and where it leaves it past the last
 * gate. Made once here: frames slide crates between them many times a second.
 */
const ENTRY = roadPoint(-6.5);
const EXIT = roadPoint(6.5);
const waitBefore = (gate: number) => roadPoint((GATE_Z[gate] ?? 0) - WAIT_GAP);

/** The idle island's parts that beats change, plus the green its lights shine. */
interface GateParts {
  readonly beams: readonly THREE.Mesh[];
  readonly pass: THREE.Material;
}

/** A beat's run that, on reset, clears the stage and puts the changed parts back. */
function run(
  stage: Stage,
  changed: readonly THREE.Mesh[],
  frame: (progress: number) => void,
): ReturnType<Beat['start']> {
  const restores = changed.map(remember);
  return {
    frame,
    reset: () => {
      stage.clear();
      restores.forEach((restore) => {
        restore();
      });
    },
  };
}

function act5Beats(stage: Stage, parts: GateParts, colors: Palette): Record<BeatId<'act5'>, Beat> {
  /**
   * A beat's own light over each gate, a little bigger than the idle one so it covers it.
   * The idle lights blink in a loop; during a beat a light means one thing: dark is not
   * checked yet, green passed, red failed.
   */
  const signals = () =>
    GATE_Z.map((z) => {
      const signal = part(BULB, colors.dark, 0, LIGHT_Y, z);
      signal.scale.setScalar(1.3);
      stage.add(signal);
      return signal;
    });
  const crate = (material: THREE.Material) => {
    const mesh = part(CRATE, material, ENTRY.x, ENTRY.y, ENTRY.z);
    mesh.visible = false;
    stage.add(mesh);
    return mesh;
  };
  const barrier = (gate: number) => {
    const mesh = part(BARRIER, colors.alert, 0, 0.9, GATE_Z[gate] ?? 0);
    mesh.visible = false;
    stage.add(mesh);
    return mesh;
  };
  const key = (material: THREE.Material, at: THREE.Vector3) => {
    const group = new THREE.Group();
    group.add(
      part(KEY_RING, material, -0.3, 0, 0),
      part(KEY_SHANK, material, 0.15, 0, 0),
      part(KEY_TOOTH, material, 0.32, -0.12, 0),
    );
    group.position.copy(at);
    group.visible = false;
    stage.add(group);
    return group;
  };
  /** Lights every gate the crate has rolled past green, except any `skip`ped gate. */
  const passedGates = (signalMeshes: readonly THREE.Mesh[], crateZ: number, skip = -1) => {
    signalMeshes.forEach((signal, index) => {
      if (index === skip) return;
      signal.material = crateZ > (GATE_Z[index] ?? 0) ? parts.pass : colors.dark;
    });
  };

  return {
    // A change rolls down the road and every gate checks it in turn: each light goes green.
    'change-passes': {
      seconds: 2.8,
      start: () => {
        const lights = signals();
        const change = crate(colors.light);
        return run(stage, [], (progress) => {
          popIn(change, phase(progress, 0, 0.12));
          slide(change, ENTRY, EXIT, phase(progress, 0.1, 0.95));
          passedGates(lights, change.position.z);
        });
      },
    },
    // A check fails: the change passes the first gate, the second goes red, the boom drops,
    // and the change bounces back. Nothing gets further until that check is green.
    'gate-blocks': {
      seconds: 2.4,
      start: () => {
        const lights = signals();
        const change = crate(colors.light);
        const boom = barrier(CHECK_GATE);
        const stopped = waitBefore(CHECK_GATE);
        const bounced = stopped.clone().setZ(stopped.z - 0.7);
        return run(stage, [], (progress) => {
          popIn(change, phase(progress, 0, 0.12));
          slide(change, ENTRY, stopped, phase(progress, 0.1, 0.5));
          if (progress >= 0.6) slide(change, stopped, bounced, phase(progress, 0.6, 0.8), 0.3);
          passedGates(lights, change.position.z);
          const failed = progress >= 0.45;
          const checkLight = lights[CHECK_GATE];
          if (checkLight) checkLight.material = failed ? colors.alert : colors.dark;
          popIn(boom, phase(progress, 0.45, 0.65));
        });
      },
    },
    // Red, then green: the change is stopped, goes back for a fix (it glows, changed),
    // the same check now passes, the boom lifts, and it rolls on through the rest.
    'red-to-green': {
      seconds: 3,
      start: () => {
        const lights = signals();
        const change = crate(colors.light);
        const boom = barrier(CHECK_GATE);
        const stopped = waitBefore(CHECK_GATE);
        return run(stage, [], (progress) => {
          popIn(change, phase(progress, 0, 0.08));
          slide(change, ENTRY, stopped, phase(progress, 0.05, 0.3));
          // The fix: a hop in place, and the crate comes back changed.
          const fixing = phase(progress, 0.4, 0.55);
          if (progress >= 0.4 && progress < 0.6) slide(change, stopped, stopped, fixing, 0.7);
          change.material = progress >= 0.5 ? colors.glow : colors.light;
          if (progress >= 0.6) slide(change, stopped, EXIT, phase(progress, 0.6, 1));
          passedGates(lights, change.position.z, CHECK_GATE);
          const checkLight = lights[CHECK_GATE];
          if (checkLight) {
            const fixed = progress >= 0.55;
            checkLight.material = fixed
              ? parts.pass
              : progress >= 0.25
                ? colors.alert
                : colors.dark;
          }
          // The boom drops on the red, then lifts away once the check is green.
          popIn(boom, Math.min(phase(progress, 0.25, 0.35), 1 - phase(progress, 0.55, 0.62)));
        });
      },
    },
    // Switching a check off (a skipped test, a blanket disable, an admin bypass): one gate
    // goes dark and lifts its beam, and a bug, a red crate, rolls straight through it.
    'gate-bypassed': {
      seconds: 2.8,
      start: () => {
        const lights = signals();
        const bug = crate(colors.alert);
        const switchedOff = 2;
        const beam = parts.beams[switchedOff];
        return run(stage, beam ? [beam] : [], (progress) => {
          const off = phase(progress, 0, 0.3);
          if (beam) {
            beam.position.y = BEAM_Y + off * 1.1;
            beam.material = off > 0 ? colors.dark : colors.glow;
          }
          popIn(bug, phase(progress, 0.25, 0.35));
          slide(bug, ENTRY, EXIT, phase(progress, 0.3, 1));
          // The other gates only check what they're built for, so they pass it too. The
          // switched-off gate's light stays dark: nothing there looked.
          passedGates(lights, bug.position.z, switchedOff);
        });
      },
    },
    // A flaky check: two identical changes roll up to the same gate. It waves the first
    // through, then flickers on the second and stops it. Same code, a different answer:
    // that's how a team learns to stop trusting red.
    'flaky-check': {
      seconds: 3,
      start: () => {
        const lights = signals();
        const first = crate(colors.light);
        const second = crate(colors.light);
        const boom = barrier(CHECK_GATE);
        const stopped = waitBefore(CHECK_GATE);
        const checkLight = lights[CHECK_GATE];
        /** Green for the first crate, then it can't make up its mind, then red. */
        const flakyLight = (progress: number, firstPassed: boolean): THREE.Material => {
          if (progress >= 0.88) return colors.alert;
          // Before it settles, it flips between the two answers a few times a second.
          const flickerRed = Math.floor(progress * 25) % 2 === 0;
          if (progress >= 0.72) return flickerRed ? colors.alert : parts.pass;
          return firstPassed ? parts.pass : colors.dark;
        };
        return run(stage, [], (progress) => {
          popIn(first, phase(progress, 0, 0.08));
          slide(first, ENTRY, EXIT, phase(progress, 0.05, 0.5));
          popIn(second, phase(progress, 0.45, 0.55));
          slide(second, ENTRY, stopped, phase(progress, 0.5, 0.75));
          // The first crate rolled furthest, so it sets every light but the flaky one.
          passedGates(lights, first.position.z, CHECK_GATE);
          if (checkLight) {
            const firstPassed = first.position.z > (GATE_Z[CHECK_GATE] ?? 0);
            checkLight.material = flakyLight(progress, firstPassed);
          }
          popIn(boom, phase(progress, 0.88, 1));
        });
      },
    },
    // The testing pyramid beside the road: many quick unit tests at the base, fewer
    // integration tests on them, one end-to-end test on top.
    'test-layers': {
      seconds: 2.6,
      start: () => {
        const layers = [
          { count: 5, material: colors.light, from: 0, to: 0.4 },
          { count: 3, material: colors.glow, from: 0.4, to: 0.7 },
          { count: 1, material: parts.pass, from: 0.7, to: 1 },
        ];
        const blocks = layers.flatMap((layer, row) =>
          Array.from({ length: layer.count }, (_, index) => {
            const x = 4 + (index - (layer.count - 1) / 2) * 0.6;
            const block = part(BLOCK, layer.material, x, 0.24 + row * 0.46, 3.2);
            block.visible = false;
            stage.add(block);
            // Each block in a row pops in a moment after the one before it.
            const step = (layer.to - layer.from) / (layer.count + 1);
            return { block, from: layer.from + index * step, to: layer.from + (index + 2) * step };
          }),
        );
        return run(stage, [], (progress) => {
          blocks.forEach(({ block, from, to }) => {
            popIn(block, phase(progress, from, to));
          });
        });
      },
    },
    // A secret stays in the vault: the change stops at the gate that needs it, the key
    // floats over from the tower, the check passes, and the key goes home. It never rides
    // along on the road, so it's never in the code.
    'secret-vault': {
      seconds: 3,
      start: () => {
        const lights = signals();
        const change = crate(colors.light);
        const vaultKey = key(colors.glow, VAULT);
        const keyGate = 2;
        const stopped = waitBefore(keyGate);
        const overGate = new THREE.Vector3(0, LIGHT_Y + 0.7, GATE_Z[keyGate] ?? 0);
        return run(stage, [], (progress) => {
          popIn(vaultKey, phase(progress, 0, 0.15));
          popIn(change, phase(progress, 0, 0.1));
          slide(change, ENTRY, stopped, phase(progress, 0.05, 0.35));
          slide(vaultKey, VAULT, overGate, phase(progress, 0.35, 0.55), 1);
          if (progress >= 0.65) slide(vaultKey, overGate, VAULT, phase(progress, 0.65, 0.85), 1);
          if (progress >= 0.6) slide(change, stopped, EXIT, phase(progress, 0.6, 1));
          passedGates(lights, change.position.z, keyGate);
          const keyLight = lights[keyGate];
          if (keyLight) keyLight.material = progress >= 0.55 ? parts.pass : colors.dark;
        });
      },
    },
    // A leaked key: it lies out on the road, flashing red. It's revoked (it shrinks away),
    // a fresh key appears in the vault, and the first gate lights up: a scan that catches
    // the next leak before it's merged.
    'key-revoked': {
      seconds: 2.8,
      start: () => {
        const lights = signals();
        const leaked = key(colors.alert, LEAK_SPOT);
        const fresh = key(colors.glow, VAULT);
        return run(stage, [], (progress) => {
          const shown = phase(progress, 0, 0.15);
          const revoked = phase(progress, 0.4, 0.6);
          popIn(leaked, Math.min(shown, 1 - revoked), 1.3);
          leaked.rotation.z = progress < 0.4 ? Math.sin(progress * 50) * 0.15 : 0;
          popIn(fresh, phase(progress, 0.6, 0.8));
          const scanLight = lights[0];
          if (scanLight) scanLight.material = progress >= 0.85 ? parts.pass : colors.dark;
        });
      },
    },
  };
}

/** Act 5: a road through a row of gates, each with a light, and two watchtowers. */
export function gates(colors: Palette): Props {
  const group = new THREE.Group();
  group.add(part(ROAD, colors.base, 0, 0.03, 0));
  const pass = new THREE.MeshStandardMaterial({
    color: 0x7ee2a8,
    emissive: 0x7ee2a8,
    emissiveIntensity: 2,
  });
  const lights: THREE.Mesh[] = [];
  const beams: THREE.Mesh[] = [];
  GATE_Z.forEach((z) => {
    group.add(part(PILLAR, colors.dark, -1.2, 1.2, z), part(PILLAR, colors.dark, 1.2, 1.2, z));
    const beam = part(BEAM, colors.glow, 0, BEAM_Y, z);
    beams.push(beam);
    group.add(beam);
    const light = part(BULB, pass, 0, LIGHT_Y, z);
    lights.push(light);
    group.add(light);
  });
  for (const x of TOWER_X) {
    group.add(part(TOWER, colors.base, x, 2, -3), part(CAP, colors.glow, x, 4.6, -3));
  }
  const stage = createStage(group);
  return {
    group,
    animate: (elapsed) => {
      // The lights go green one gate after another, like checks passing in order.
      const lit = Math.floor(elapsed * 1.5) % (lights.length + 1);
      lights.forEach((light, index) => {
        light.visible = index < lit;
      });
    },
    beats: act5Beats(stage, { beams, pass }, colors),
  };
}
