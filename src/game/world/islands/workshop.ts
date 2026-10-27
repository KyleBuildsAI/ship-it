import * as THREE from 'three/webgpu';
import { phase, type Beat } from '../beatPlayer';
import type { BeatId } from '../beats';
import {
  createStage,
  part,
  popIn,
  remember,
  segment,
  slide,
  type Palette,
  type Props,
  type Stage,
} from './kit';

/*
 * Act 7's island: a workbench with Otto, the AI agent, on it and gears on the wall behind.
 * Its beats act out the Act's ideas with things a non-coder can follow: a brief card goes
 * in and the right blocks come out, a loop circles the bench, a magnifier finds the bad
 * line on a PR card, a test gate lets one block through and stops another (or is knocked
 * flat so a bad one rolls over it), eval scores rise as bars, a fence turns a stranger's
 * note away with the key locked outside it, and a stop sign halts a runaway loop.
 */

/** The bench top's height, where built blocks sit. */
const BENCH_TOP = 1.1;
/** Where Otto stands on the bench. */
const ROBOT = new THREE.Vector3(0, BENCH_TOP, -1);
/** Where the checks' gate stands, on the path from the bench toward the camera. */
const GATE_X = 2.6;
const GATE_Z = 2;
/** A block of Otto's work on the bench, about to head for the gate. */
const ON_BENCH = new THREE.Vector3(GATE_X, BENCH_TOP + 0.23, -0.7);
/** Where a block waits when the gate stops it, just short of it. */
const AT_GATE = new THREE.Vector3(GATE_X, 0.25, GATE_Z - 0.5);

// Shared geometry, made once: beats only place and scale these.
const CARD = new THREE.BoxGeometry(1, 1.3, 0.06);
const CARD_LINE = new THREE.BoxGeometry(0.7, 0.1, 0.04);
const BLOCK = new THREE.BoxGeometry(0.45, 0.45, 0.45);
const ORB = new THREE.SphereGeometry(0.22, 16, 12);
const STATION = new THREE.CylinderGeometry(0.42, 0.42, 0.16, 20);
const LENS = new THREE.TorusGeometry(0.26, 0.05, 10, 28);
const GATE_POST = new THREE.BoxGeometry(0.2, 2, 0.2);
const GATE_BEAM = new THREE.BoxGeometry(2.2, 0.22, 0.22);
const SCORE_BAR = new THREE.BoxGeometry(0.42, 1, 0.42);
const FENCE_POST = new THREE.CylinderGeometry(0.09, 0.09, 1.6, 8);
const SAFE = new THREE.BoxGeometry(0.9, 0.7, 0.9);
const KEY_RING = new THREE.TorusGeometry(0.22, 0.07, 8, 20);
const KEY_SHAFT = new THREE.BoxGeometry(0.09, 0.5, 0.09);
const STOP_SIGN = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 8);

/** How high a card's line of "text" sits on it, by its place from the top. */
function lineY(index: number): number {
  return 0.4 - index * 0.26;
}

/** The parts of the idle workshop that beats change. */
interface Workshop {
  /** Otto's glowing visor: it shows what Otto is doing. */
  readonly visor: THREE.Mesh;
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

function act7Beats(stage: Stage, shop: Workshop, colors: Palette): Record<BeatId<'act7'>, Beat> {
  /** A hidden mesh on the stage, for a beat to pop in later. */
  const hidden = (geometry: THREE.BufferGeometry, material: THREE.Material, at: THREE.Vector3) => {
    const mesh = part(geometry, material, at.x, at.y, at.z);
    mesh.visible = false;
    stage.add(mesh);
    return mesh;
  };

  /** An upright card with lines of "text", facing the camera, hidden until popped in. */
  const card = (
    at: THREE.Vector3,
    lineCount: number,
    paper: THREE.Material = colors.light,
    ink: THREE.Material = colors.base,
  ) => {
    const group = new THREE.Group();
    group.add(part(CARD, paper, 0, 0, 0));
    const lines = Array.from({ length: lineCount }, (_, index) => {
      const line = part(CARD_LINE, ink, 0, lineY(index), 0.05);
      group.add(line);
      return line;
    });
    group.position.copy(at);
    group.visible = false;
    stage.add(group);
    return { group, lines };
  };

  /** The checks as a gate on the bench's path: Otto's work has to pass through it. */
  const gate = () => {
    const group = new THREE.Group();
    const beam = part(GATE_BEAM, colors.base, 0, 2, 0);
    const posts = [-1, 1].map((side) => part(GATE_POST, colors.base, side, 1, 0));
    group.add(beam, ...posts);
    group.position.set(GATE_X, 0, GATE_Z);
    group.visible = false;
    stage.add(group);
    const meshes = [beam, ...posts];
    return {
      group,
      /** Colours the whole gate: glow while it passes work, alert when it stops some. */
      paint: (material: THREE.Material) => {
        meshes.forEach((mesh) => {
          mesh.material = material;
        });
      },
    };
  };

  return {
    // A clear brief goes in, the right thing comes out: a spec card flies to Otto, he
    // takes it, and three blocks land on the bench one by one.
    'brief-handed': {
      seconds: 2.8,
      start: () => {
        const handedFrom = new THREE.Vector3(4, 2.2, 3);
        const brief = card(handedFrom, 3, colors.light, colors.glow);
        const nearOtto = new THREE.Vector3(0.9, 2.4, -0.5);
        const blocks = [1.1, 1.65, 2.2].map((x) =>
          hidden(BLOCK, colors.glow, new THREE.Vector3(x, BENCH_TOP + 0.23, -0.8)),
        );
        return run(stage, [], (progress) => {
          slide(brief.group, handedFrom, nearOtto, phase(progress, 0.1, 0.45), 0.8);
          // The card shrinks away as Otto reads it in.
          const read = phase(progress, 0.45, 0.6);
          popIn(brief.group, Math.min(phase(progress, 0, 0.15), 1 - read), 1.2);
          blocks.forEach((block, index) => {
            const start = 0.6 + index * 0.12;
            popIn(block, phase(progress, start, start + 0.15));
          });
        });
      },
    },
    // Brief, plan, build, review: an orb circles four stations in front of the bench,
    // lighting each as it passes, and comes back to the start.
    'agent-loop': {
      seconds: 3,
      start: () => {
        // Far enough forward that the back station isn't hidden under the bench.
        const center = new THREE.Vector3(0, 0.12, 2.8);
        const radius = 2.2;
        const orbHeight = 0.7;
        /**
         * Puts `target` on the loop, a quarter-turn per station, starting nearest the
         * camera. It fills a vector it's given, so the orb moves without a new one a frame.
         */
        const onLoop = (target: THREE.Vector3, turn: number, y: number) =>
          target.set(
            center.x + Math.sin(turn * Math.PI * 2) * radius,
            y,
            center.z + Math.cos(turn * Math.PI * 2) * radius,
          );
        const stations = [0, 0.25, 0.5, 0.75].map((turn) =>
          // Base, not dark: dark is nearly the island floor's colour, so they'd vanish unlit.
          hidden(STATION, colors.base, onLoop(new THREE.Vector3(), turn, center.y)),
        );
        const orb = hidden(ORB, colors.glow, onLoop(new THREE.Vector3(), 0, orbHeight));
        return run(stage, [], (progress) => {
          const appear = phase(progress, 0, 0.15);
          stations.forEach((station) => {
            popIn(station, appear);
          });
          popIn(orb, appear);
          // Linear, not eased, so the orb keeps one steady pace round the loop.
          const turn = Math.min(1, Math.max(0, (progress - 0.15) / 0.8));
          onLoop(orb.position, turn, orbHeight);
          stations.forEach((station, index) => {
            station.material = turn >= index / 4 + 0.02 ? colors.glow : colors.base;
          });
        });
      },
    },
    // Otto's PR looks tidy, but reading it line by line finds the one that's wrong: a
    // lens sweeps down the card, one line turns red, and the lens goes back to rest on it.
    'diff-inspected': {
      seconds: 2.8,
      start: () => {
        const from = new THREE.Vector3(0.9, 2, -0.6);
        // Right of the wall's gear, so the card isn't read against a glowing ring.
        const to = new THREE.Vector3(4.6, 2.6, 2.4);
        const pr = card(from, 4);
        // Glow, not light: a light ring would be lost against the light card.
        const lens = part(LENS, colors.glow, 0, lineY(0), 0.12);
        lens.visible = false;
        pr.group.add(lens);
        const badLine = 2;
        const lastLine = pr.lines.length - 1;
        return run(stage, [], (progress) => {
          popIn(pr.group, phase(progress, 0, 0.15), 1.7);
          slide(pr.group, from, to, phase(progress, 0.05, 0.35), 0.5);
          // Every line is read, top to bottom, before the lens goes back to the wrong one.
          const read = phase(progress, 0.38, 0.75);
          const back = phase(progress, 0.8, 0.95);
          lens.visible = progress >= 0.38;
          lens.position.y =
            lineY(0) +
            (lineY(lastLine) - lineY(0)) * read +
            (lineY(badLine) - lineY(lastLine)) * back;
          pr.lines.forEach((line, index) => {
            const found = index === badLine && read >= badLine / lastLine;
            line.material = found ? colors.alert : colors.base;
          });
        });
      },
    },
    // Tests are a gate: a good block passes and the gate glows; a bad one is stopped,
    // the gate turns red, and the block is sent back.
    'test-gate': {
      seconds: 3,
      start: () => {
        const checks = gate();
        const passed = new THREE.Vector3(GATE_X, 0.25, 4.4);
        const sentBack = new THREE.Vector3(GATE_X, 0.25, 0.6);
        const good = hidden(BLOCK, colors.glow, ON_BENCH);
        const bad = hidden(BLOCK, colors.glow, ON_BENCH);
        return run(stage, [], (progress) => {
          popIn(checks.group, phase(progress, 0, 0.15));
          popIn(good, phase(progress, 0.1, 0.2));
          slide(good, ON_BENCH, passed, phase(progress, 0.15, 0.45), 0.6);
          popIn(bad, phase(progress, 0.45, 0.55));
          if (progress < 0.78) {
            slide(bad, ON_BENCH, AT_GATE, phase(progress, 0.5, 0.75), 0.6);
          } else {
            slide(bad, AT_GATE, sentBack, phase(progress, 0.78, 1), 0.3);
          }
          const caught = progress >= 0.72;
          checks.paint(caught ? colors.alert : progress >= 0.3 ? colors.glow : colors.base);
          bad.material = caught ? colors.alert : colors.glow;
        });
      },
    },
    // Green isn't proof: the gate stops a bad block and turns red, then it's knocked flat
    // (a test bent to agree with the bug, or CI told to ignore failures), glows "passing"
    // again, and the red block rolls straight over it.
    'gate-bent': {
      seconds: 3,
      start: () => {
        const checks = gate();
        const through = new THREE.Vector3(GATE_X, 0.25, 5.2);
        const bad = hidden(BLOCK, colors.glow, ON_BENCH);
        return run(stage, [], (progress) => {
          popIn(checks.group, phase(progress, 0, 0.12));
          popIn(bad, phase(progress, 0.08, 0.18));
          if (progress < 0.72) {
            slide(bad, ON_BENCH, AT_GATE, phase(progress, 0.12, 0.36), 0.6);
          } else {
            // A high hop, so the block clears the fallen gate rather than passing through it.
            slide(bad, AT_GATE, through, phase(progress, 0.72, 1), 0.7);
          }
          // Tipped forward on its base until it lies flat, lifted by half a beam's
          // thickness so it lies on the floor instead of sinking into it.
          const knockedDown = phase(progress, 0.45, 0.68);
          checks.group.rotation.x = (knockedDown * Math.PI) / 2;
          checks.group.position.y = knockedDown * 0.11;
          const caught = progress >= 0.34;
          checks.paint(knockedDown >= 1 ? colors.glow : caught ? colors.alert : colors.base);
          bad.material = caught ? colors.alert : colors.glow;
        });
      },
    },
    // An eval scores many examples, not one feeling: five score bars rise to different
    // heights, then a line is drawn across at their average.
    'eval-scores': {
      seconds: 2.6,
      start: () => {
        const heights = [1.2, 2, 1.5, 2.3, 1.7];
        const xs = heights.map((_, index) => 3.6 + index * 0.8);
        const z = 1.5;
        const bars = xs.map((x) => hidden(SCORE_BAR, colors.glow, new THREE.Vector3(x, 0, z)));
        const average = heights.reduce((sum, height) => sum + height, 0) / heights.length;
        const level = segment(
          new THREE.Vector3((xs[0] ?? 0) - 0.4, average, z + 0.3),
          new THREE.Vector3((xs.at(-1) ?? 0) + 0.4, average, z + 0.3),
          colors.light,
        );
        level.grow(0);
        stage.add(level.mesh);
        return run(stage, [], (progress) => {
          bars.forEach((bar, index) => {
            const start = index * 0.1;
            const rise = phase(progress, start, start + 0.35);
            const height = Math.max(0.001, (heights[index] ?? 1) * rise);
            bar.scale.set(1, height, 1);
            bar.position.y = height / 2;
            bar.visible = rise > 0;
          });
          level.grow(phase(progress, 0.7, 1));
        });
      },
    },
    // Guardrails, the three the lesson names: a fence rises round Otto's bench (limited
    // access), the key drops into a safe outside it (no secrets in reach), and a
    // stranger's red note flying in with orders bounces off the fence and drops outside.
    'guardrails-up': {
      seconds: 2.8,
      start: () => {
        const radius = 3.2;
        /** A point on the fence's arc round Otto, `degrees` from straight in front of him. */
        const onFence = (degrees: number, y: number, outward = 0) => {
          const angle = (degrees * Math.PI) / 180;
          return new THREE.Vector3(
            Math.sin(angle) * (radius + outward),
            y,
            ROBOT.z + Math.cos(angle) * (radius + outward),
          );
        };
        const postDegrees = [-80, -55, -30, -10, 10, 30, 55, 80];
        const posts = postDegrees.map((degrees) =>
          hidden(FENCE_POST, colors.glow, onFence(degrees, 0.8)),
        );
        // Rails between the posts, so the note meets a fence, not a gap between two poles.
        const spans = postDegrees
          .slice(1)
          .map((to, index) => ({ from: postDegrees[index] ?? to, to }));
        const rails = [0.55, 1.3].flatMap((y) =>
          spans.map(({ from, to }) => {
            const rail = segment(onFence(from, y), onFence(to, y), colors.glow);
            rail.grow(0);
            stage.add(rail.mesh);
            return rail;
          }),
        );
        // Light and in front, not base and behind: a dark box at the back was lost on the floor.
        const safeAt = new THREE.Vector3(4.8, 0.35, 0.4);
        const safe = hidden(SAFE, colors.light, safeAt);
        const key = new THREE.Group();
        key.add(part(KEY_RING, colors.glow, 0, 0.42, 0), part(KEY_SHAFT, colors.glow, 0, 0, 0));
        key.visible = false;
        stage.add(key);
        const keyAbove = new THREE.Vector3(safeAt.x, 1.7, safeAt.z);
        // Low enough that the shaft is inside the safe and only the ring shows on top.
        const keyLocked = new THREE.Vector3(safeAt.x, 0.55, safeAt.z);
        const outside = new THREE.Vector3(8, 3.2, 4);
        const hit = onFence(42, 1.5, 0.3);
        const dropped = new THREE.Vector3(5.2, 0.4, 3.4);
        const note = card(outside, 2, colors.alert, colors.dark);
        return run(stage, [], (progress) => {
          posts.forEach((post, index) => {
            const start = index * 0.03;
            const rise = phase(progress, start, start + 0.22);
            post.scale.set(1, Math.max(0.001, rise), 1);
            post.position.y = 0.8 * rise;
            post.visible = rise > 0;
          });
          const railed = phase(progress, 0.38, 0.5);
          rails.forEach((rail) => {
            rail.grow(railed);
          });
          popIn(safe, phase(progress, 0.08, 0.2));
          popIn(key, phase(progress, 0.18, 0.26));
          slide(key, keyAbove, keyLocked, phase(progress, 0.28, 0.42));
          popIn(note.group, phase(progress, 0.5, 0.56), 0.6);
          if (progress < 0.74) {
            slide(note.group, outside, hit, phase(progress, 0.52, 0.74));
          } else {
            slide(note.group, hit, dropped, phase(progress, 0.74, 1), 0.6);
          }
        });
      },
    },
    // Knowing when to stop: Otto is stuck in a loop, an orb racing round his head and his
    // visor red, until a stop sign goes up, the orb drops, and his visor goes dark.
    'agent-halted': {
      seconds: 2.6,
      start: () => {
        const head = new THREE.Vector3(ROBOT.x, ROBOT.y + 1.35, ROBOT.z);
        const orbitRadius = 0.9;
        // Every lap starts and ends here, in front of Otto's face, so the drop starts here too.
        const lapStart = new THREE.Vector3(head.x, head.y, head.z + orbitRadius);
        const rest = new THREE.Vector3(-1.4, BENCH_TOP + 0.22, -0.6);
        const orb = hidden(ORB, colors.alert, lapStart);
        const sign = hidden(STOP_SIGN, colors.alert, new THREE.Vector3(1.4, 3.6, -0.6));
        // Stood up to face the camera, like a road sign.
        sign.rotation.x = Math.PI / 2;
        const stopAt = 0.6;
        return run(stage, [shop.visor], (progress) => {
          popIn(orb, phase(progress, 0, 0.1));
          if (progress < stopAt) {
            // Speeding up while it runs: the loop gets faster, not closer to done.
            const running = progress / stopAt;
            const angle = 4 * running * running * Math.PI * 2;
            orb.position.set(
              head.x + Math.sin(angle) * orbitRadius,
              head.y,
              head.z + Math.cos(angle) * orbitRadius,
            );
          } else {
            orb.position.lerpVectors(lapStart, rest, phase(progress, stopAt, 0.85));
          }
          const halted = progress >= stopAt;
          orb.material = halted ? colors.dark : colors.alert;
          shop.visor.material = halted
            ? colors.dark
            : progress >= 0.15
              ? colors.alert
              : colors.glow;
          popIn(sign, phase(progress, stopAt - 0.05, 0.8));
        });
      },
    },
  };
}

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
  const visor = part(new THREE.BoxGeometry(0.55, 0.14, 0.1), colors.glow, 0, 0.02, 0.36);
  head.add(visor);
  head.position.y = 1.35;
  robot.add(head);
  const arm = new THREE.BoxGeometry(0.18, 0.75, 0.18);
  robot.add(part(arm, colors.base, -0.6, 0.55, 0), part(arm, colors.base, 0.6, 0.55, 0));
  robot.position.copy(ROBOT);
  group.add(robot);
  // The wall behind, with gears.
  group.add(part(new THREE.BoxGeometry(7, 3.4, 0.2), colors.dark, 0, 1.7, -3));
  const gear = new THREE.TorusGeometry(0.6, 0.16, 8, 12);
  const gears = [-2.2, 2.2].map((x, index) => {
    const mesh = part(gear, colors.glow, x, 2.3 - index * 0.5, -2.85);
    group.add(mesh);
    return mesh;
  });
  const stage = createStage(group);
  return {
    group,
    animate: (elapsed) => {
      gears.forEach((mesh, index) => {
        mesh.rotation.z = elapsed * (index === 0 ? 0.8 : -0.8);
      });
      head.rotation.y = Math.sin(elapsed * 0.9) * 0.5;
    },
    beats: act7Beats(stage, { visor }, colors),
  };
}
