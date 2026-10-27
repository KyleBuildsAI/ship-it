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
/**
 * The gate a failing change stops at: the third of four, so one gate stays dark after it.
 * CI stops at the first failing step, and the steps after it never run. From the lesson
 * camera the crate and boom there show through the last gate's arch, under its beam.
 */
const FAIL_GATE = 2;
/**
 * The last gate, nearest the camera: the step that needs a secret (deploys come last),
 * and the gate that turns flaky, so its flicker is the biggest light on screen.
 */
const LAST_GATE = 3;
/**
 * The right tower is the secret store, and keys float in front of its body, below the
 * cap. Not the left tower: the lesson panel covers the left of the screen.
 */
const VAULT = new THREE.Vector3(5.5, 3.1, -1.6);
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
/**
 * Two changes that both made it past the gates, side by side: a revert in the left lane
 * and the change it undoes on the right. One behind the other, the nearer crate would
 * hide the farther from the lesson camera.
 */
const REVERT_ENTRY = new THREE.Vector3(-0.5, CRATE_Y, ENTRY.z);
const REVERT_LANDED = new THREE.Vector3(-0.5, CRATE_Y, 6.1);
const UNDONE_SPOT = new THREE.Vector3(0.5, CRATE_Y, 6.1);
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
  // Every object a beat adds is named for its part in the story, so the tests (and the
  // three.js inspector) can find it.
  const signals = () =>
    GATE_Z.map((z, index) => {
      const signal = part(BULB, colors.dark, 0, LIGHT_Y, z);
      signal.name = `light-${String(index)}`;
      signal.scale.setScalar(1.3);
      stage.add(signal);
      return signal;
    });
  const crate = (name: string, material: THREE.Material, at = ENTRY) => {
    const mesh = part(CRATE, material, at.x, at.y, at.z);
    mesh.name = name;
    mesh.visible = false;
    stage.add(mesh);
    return mesh;
  };
  const barrier = (gate: number) => {
    const mesh = part(BARRIER, colors.alert, 0, 0.9, GATE_Z[gate] ?? 0);
    mesh.name = 'boom';
    mesh.visible = false;
    stage.add(mesh);
    return mesh;
  };
  const key = (name: string, material: THREE.Material, at: THREE.Vector3) => {
    const group = new THREE.Group();
    group.name = name;
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
  /** Recolours a whole key: its ring, shank and tooth. */
  const paintKey = (keyGroup: THREE.Group, material: THREE.Material) => {
    keyGroup.children.forEach((piece) => {
      if (piece instanceof THREE.Mesh) piece.material = material;
    });
  };
  /** Lights every gate the crate has rolled past green, except any `skip`ped gate. */
  const passedGates = (signalMeshes: readonly THREE.Mesh[], crateZ: number, skip = -1) => {
    signalMeshes.forEach((signal, index) => {
      if (index === skip) return;
      signal.material = crateZ > (GATE_Z[index] ?? 0) ? parts.pass : colors.dark;
    });
  };
  /** A crate rolling the whole road, every gate passing it in turn. */
  const rollThrough = (material: THREE.Material): Beat => ({
    seconds: 2.8,
    start: () => {
      const lights = signals();
      const change = crate('change', material);
      return run(stage, [], (progress) => {
        popIn(change, phase(progress, 0, 0.12));
        slide(change, ENTRY, EXIT, phase(progress, 0.1, 0.95));
        passedGates(lights, change.position.z);
      });
    },
  });

  return {
    // A change rolls down the road and every gate checks it in turn: each light goes green.
    'change-passes': rollThrough(colors.light),
    // Green isn't the same as right: a bug (a red crate) that no gate was built to look for
    // rolls through every one of them, all switched on, and every light goes green. Gates
    // only catch what someone taught them to check.
    'bug-slips-through': rollThrough(colors.alert),
    // A check fails: the change passes the first gates, the next goes red, the boom drops,
    // and the change bounces back. Nothing gets further until that check is green, and the
    // gate after it stays dark: a step after the first failure never runs.
    'gate-blocks': {
      seconds: 2.4,
      start: () => {
        const lights = signals();
        const change = crate('change', colors.light);
        const boom = barrier(FAIL_GATE);
        const stopped = waitBefore(FAIL_GATE);
        const bounced = stopped.clone().setZ(stopped.z - 0.7);
        return run(stage, [], (progress) => {
          popIn(change, phase(progress, 0, 0.12));
          slide(change, ENTRY, stopped, phase(progress, 0.1, 0.5));
          if (progress >= 0.6) slide(change, stopped, bounced, phase(progress, 0.6, 0.8), 0.3);
          passedGates(lights, change.position.z);
          const failed = progress >= 0.45;
          const checkLight = lights[FAIL_GATE];
          if (checkLight) checkLight.material = failed ? colors.alert : colors.dark;
          popIn(boom, phase(progress, 0.45, 0.65));
        });
      },
    },
    // Red, then green: the change is stopped at a failing check and hops back for a fix (it
    // comes back glowing, changed). The fix is a new push, so it runs every gate again from
    // the start, not just the one that failed: the lights go dark, then green one by one,
    // the boom lifts once the old red check passes, and the change rolls on.
    'red-to-green': {
      seconds: 3,
      start: () => {
        const lights = signals();
        const change = crate('change', colors.light);
        const boom = barrier(FAIL_GATE);
        const stopped = waitBefore(FAIL_GATE);
        const failLight = lights[FAIL_GATE];
        /** When the fixed change sets off again, and every check runs a second time. */
        const rerun = 0.5;
        const failLightAt = (progress: number): THREE.Material => {
          if (progress < 0.22) return colors.dark;
          if (progress < rerun) return colors.alert;
          // The new run hasn't reached it yet, then the fixed change passes it.
          return progress >= 0.7 ? parts.pass : colors.dark;
        };
        return run(stage, [], (progress) => {
          popIn(change, phase(progress, 0, 0.06));
          // Its four legs: up to the red gate, back to the start, up again, then on through.
          if (progress < 0.32) {
            slide(change, ENTRY, stopped, phase(progress, 0.04, 0.24));
          } else if (progress < rerun) {
            slide(change, stopped, ENTRY, phase(progress, 0.32, rerun), 0.8);
          } else if (progress < 0.78) {
            slide(change, ENTRY, stopped, phase(progress, rerun, 0.7));
          } else {
            slide(change, stopped, EXIT, phase(progress, 0.78, 1));
          }
          // The fix lands at the top of the hop back.
          change.material = progress >= 0.41 ? colors.glow : colors.light;
          // On the way back the first run's results stand; once it sets off again, every
          // light starts dark, because a new run checks everything from scratch.
          const goingBack = progress >= 0.32 && progress < rerun;
          passedGates(lights, goingBack ? stopped.z : change.position.z, FAIL_GATE);
          if (failLight) failLight.material = failLightAt(progress);
          // The boom drops on the red and lifts only once the fixed change passes that check.
          popIn(boom, Math.min(phase(progress, 0.22, 0.3), 1 - phase(progress, 0.7, 0.78)));
        });
      },
    },
    // Undoing a change that broke main: the broken change (red) already sits past the
    // gates. A revert is a new change: it rolls through every gate like any other and
    // lands beside it, and the broken one goes dark. Undone, not erased: it stays in
    // history, which is why a revert is safe on a shared branch.
    'change-reverted': {
      seconds: 2.8,
      start: () => {
        const lights = signals();
        const broken = crate('broken', colors.alert, UNDONE_SPOT);
        const revert = crate('revert', colors.light, REVERT_ENTRY);
        return run(stage, [], (progress) => {
          popIn(broken, phase(progress, 0, 0.12));
          popIn(revert, phase(progress, 0.1, 0.2));
          slide(revert, REVERT_ENTRY, REVERT_LANDED, phase(progress, 0.15, 0.7));
          passedGates(lights, revert.position.z);
          broken.material = progress >= 0.78 ? colors.dark : colors.alert;
        });
      },
    },
    // Switching a check off (a skipped test, a blanket disable, an admin bypass): one gate
    // goes dark, and a bug, a red crate, rolls straight through it.
    'gate-bypassed': {
      seconds: 2.8,
      start: () => {
        const lights = signals();
        const bug = crate('bug', colors.alert);
        const switchedOff = 2;
        const beam = parts.beams[switchedOff];
        return run(stage, beam ? [beam] : [], (progress) => {
          // Dimmed where it stands. Raised, the dark beam would cover the farther gates'
          // lights from the lesson camera: the very lights that wave the bug through.
          if (beam) beam.material = progress >= 0.15 ? colors.dark : colors.glow;
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
        const first = crate('first', colors.light);
        const second = crate('second', colors.light);
        const boom = barrier(LAST_GATE);
        const stopped = waitBefore(LAST_GATE);
        const checkLight = lights[LAST_GATE];
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
          passedGates(lights, first.position.z, LAST_GATE);
          if (checkLight) {
            const firstPassed = first.position.z > GATE_Z[LAST_GATE];
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
          { name: 'unit-test', count: 5, material: colors.light, from: 0, to: 0.4 },
          { name: 'integration-test', count: 3, material: colors.glow, from: 0.4, to: 0.7 },
          { name: 'end-to-end-test', count: 1, material: parts.pass, from: 0.7, to: 1 },
        ];
        const blocks = layers.flatMap((layer, row) =>
          Array.from({ length: layer.count }, (_, index) => {
            const x = 4 + (index - (layer.count - 1) / 2) * 0.6;
            const block = part(BLOCK, layer.material, x, 0.24 + row * 0.46, 3.2);
            block.name = layer.name;
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
    // floats over from the tower into the gate's arch, the check passes, and the key goes
    // home. It never rides along on the road, so it's never in the code.
    'secret-vault': {
      seconds: 3,
      start: () => {
        const lights = signals();
        const change = crate('change', colors.light);
        const vaultKey = key('vault-key', colors.glow, VAULT);
        const keyGate = LAST_GATE;
        const stopped = waitBefore(keyGate);
        // In the arch, above the crate and under the beam, like a key in a lock.
        const inGate = new THREE.Vector3(0, 1.5, GATE_Z[keyGate]);
        return run(stage, [], (progress) => {
          popIn(vaultKey, phase(progress, 0, 0.15));
          popIn(change, phase(progress, 0, 0.1));
          slide(change, ENTRY, stopped, phase(progress, 0.05, 0.35));
          slide(vaultKey, VAULT, inGate, phase(progress, 0.35, 0.55), 1);
          if (progress >= 0.65) slide(vaultKey, inGate, VAULT, phase(progress, 0.65, 0.85), 1);
          if (progress >= 0.6) slide(change, stopped, EXIT, phase(progress, 0.6, 1));
          passedGates(lights, change.position.z, keyGate);
          const keyLight = lights[keyGate];
          if (keyLight) keyLight.material = progress >= 0.55 ? parts.pass : colors.dark;
        });
      },
    },
    // A pull request from a stranger's fork: its change (red, since this one tries to send
    // the key away) rolls up to the gate that would need the key, and the vault won't hand
    // it over. The key shakes "no" and stays home. The stranger's other checks still run,
    // just without secrets, and the gate that needed one never lights.
    'secret-withheld': {
      seconds: 2.6,
      start: () => {
        const lights = signals();
        const stranger = crate('stranger', colors.alert);
        const vaultKey = key('vault-key', colors.glow, VAULT);
        const stopped = waitBefore(LAST_GATE);
        return run(stage, [], (progress) => {
          popIn(vaultKey, phase(progress, 0, 0.15));
          popIn(stranger, phase(progress, 0, 0.1));
          slide(stranger, ENTRY, stopped, phase(progress, 0.05, 0.4));
          passedGates(lights, stranger.position.z, LAST_GATE);
          // Two shakes of the head, starting and ending still, so it ends exactly home.
          const refusing = (progress - 0.45) / 0.4;
          const shaking = refusing > 0 && refusing < 1;
          vaultKey.position.x = VAULT.x + (shaking ? Math.sin(refusing * Math.PI * 4) * 0.35 : 0);
        });
      },
    },
    // A leaked key: it lies out on the road, flashing red. Revoking it can't take it back:
    // copies are out there and git history keeps it. So it stays, but goes dark and still:
    // it opens nothing now. A fresh key appears in the vault, and the first gate lights up:
    // a scan that catches the next leak before it's merged.
    'key-revoked': {
      seconds: 2.8,
      start: () => {
        const lights = signals();
        const leaked = key('leaked-key', colors.alert, LEAK_SPOT);
        const fresh = key('fresh-key', colors.glow, VAULT);
        return run(stage, [], (progress) => {
          popIn(leaked, phase(progress, 0, 0.15), 1.3);
          const revoked = progress >= 0.45;
          leaked.rotation.z = revoked ? 0 : Math.sin(progress * 50) * 0.15;
          paintKey(leaked, revoked ? colors.dark : colors.alert);
          popIn(fresh, phase(progress, 0.55, 0.75));
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
  pass.name = 'pass';
  const lights: THREE.Mesh[] = [];
  const beams: THREE.Mesh[] = [];
  GATE_Z.forEach((z, index) => {
    group.add(part(PILLAR, colors.dark, -1.2, 1.2, z), part(PILLAR, colors.dark, 1.2, 1.2, z));
    const beam = part(BEAM, colors.glow, 0, BEAM_Y, z);
    beam.name = `beam-${String(index)}`;
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
