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
 * up beside Otto and the right blocks come out, a loop circles the bench, a magnifier
 * finds the bad line on a PR card, a test gate lets one block through and stops another
 * (or is knocked flat so a bad one rolls over it), an eval grades answers one by one into
 * a score, a fence stops the errand a stranger's note sends Otto on, with the key locked
 * outside it, and a stop sign halts a runaway loop.
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

/**
 * A check that passed. This island's glow is pink, too close to the alert red to tell a
 * pass from a failure at a glance, and the cards call passing CI "green". Made once and
 * shared like the geometry, so a beat swaps to it without making a material.
 */
const PASSED = new THREE.MeshStandardMaterial({
  color: 0x5be38a,
  emissive: 0x3ddc77,
  emissiveIntensity: 1.6,
});

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
  // Beat parts are named for what they stand for, so the tests can check the picture each
  // beat ends on (the passed block is past the gate, the key is outside the fence).

  /** A hidden mesh on the stage, for a beat to pop in later. */
  const hidden = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    at: THREE.Vector3,
  ) => {
    const mesh = part(geometry, material, at.x, at.y, at.z);
    mesh.name = name;
    mesh.visible = false;
    stage.add(mesh);
    return mesh;
  };

  /** An upright card with lines of "text", facing the camera, hidden until popped in. */
  const card = (
    name: string,
    at: THREE.Vector3,
    lineCount: number,
    paper: THREE.Material = colors.light,
    ink: THREE.Material = colors.base,
  ) => {
    const group = new THREE.Group();
    group.name = name;
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
    group.name = 'gate';
    const beam = part(GATE_BEAM, colors.base, 0, 2, 0);
    const posts = [-1, 1].map((side) => part(GATE_POST, colors.base, side, 1, 0));
    group.add(beam, ...posts);
    group.position.set(GATE_X, 0, GATE_Z);
    group.visible = false;
    stage.add(group);
    const meshes = [beam, ...posts];
    return {
      group,
      /** Colours the whole gate: green while it passes work, alert when it stops some. */
      paint: (material: THREE.Material) => {
        meshes.forEach((mesh) => {
          mesh.material = material;
        });
      },
    };
  };

  return {
    // A clear brief goes in, the right thing comes out: a spec card is handed to Otto and
    // propped up beside him, its lines light as he reads them, and three blocks land on the
    // bench one by one. The brief stays up: the spec is what the work is checked against,
    // and a rule in the repo's instructions file is there for every session, not used up.
    'brief-handed': {
      seconds: 2.8,
      start: () => {
        // From the camera's side, where Kyle stands, as if he handed it over.
        const handedFrom = new THREE.Vector3(0.5, 2.8, 4.5);
        // On the bench at Otto's left, clear of his arm, facing the camera.
        const propped = new THREE.Vector3(-1.4, BENCH_TOP + 0.85, -0.5);
        const brief = card('brief', handedFrom, 3);
        // At the bench's front edge, so they aren't read against the glowing gear behind.
        const blocks = [1.1, 1.65, 2.2].map((x) =>
          hidden('built-block', BLOCK, colors.glow, new THREE.Vector3(x, BENCH_TOP + 0.23, -0.3)),
        );
        return run(stage, [], (progress) => {
          popIn(brief.group, phase(progress, 0, 0.12), 0.9);
          slide(brief.group, handedFrom, propped, phase(progress, 0.08, 0.4), 0.6);
          // Otto reads every line before he builds anything.
          brief.lines.forEach((line, index) => {
            line.material = progress >= 0.45 + index * 0.06 ? colors.glow : colors.base;
          });
          blocks.forEach((block, index) => {
            const start = 0.6 + index * 0.12;
            popIn(block, phase(progress, start, start + 0.15));
          });
        });
      },
    },
    // Brief, plan, approve, build, review, the five steps the lesson orders: an orb circles
    // five stations in front of the bench, lighting each as it passes, and comes back to
    // the start.
    'agent-loop': {
      seconds: 3,
      start: () => {
        // Far enough forward that the back station isn't hidden under the bench.
        const center = new THREE.Vector3(0, 0.12, 2.8);
        const radius = 2.2;
        const orbHeight = 0.7;
        /**
         * Puts `target` on the loop, `turn` of the way round from the station nearest the
         * camera. It fills a vector it's given, so the orb moves without a new one a frame.
         */
        const onLoop = (target: THREE.Vector3, turn: number, y: number) =>
          target.set(
            center.x + Math.sin(turn * Math.PI * 2) * radius,
            y,
            center.z + Math.cos(turn * Math.PI * 2) * radius,
          );
        const stationCount = 5;
        const stations = Array.from({ length: stationCount }, (_, index) =>
          // Base, not dark: dark is nearly the island floor's colour, so they'd vanish unlit.
          hidden(
            'station',
            STATION,
            colors.base,
            onLoop(new THREE.Vector3(), index / stationCount, center.y),
          ),
        );
        const orb = hidden('loop-orb', ORB, colors.glow, onLoop(new THREE.Vector3(), 0, orbHeight));
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
            station.material = turn >= index / stationCount + 0.02 ? colors.glow : colors.base;
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
        const pr = card('pr', from, 4);
        // Dark on the light card: a light ring would be lost against the paper, and a
        // glowing pink one blurs into the red line it comes to rest on.
        const lens = part(LENS, colors.dark, 0, lineY(0), 0.12);
        lens.name = 'lens';
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
    // Tests are a gate: a good block passes and it and the gate turn green; a bad one,
    // which looked just like it, is stopped, the gate turns red, and the block is sent back.
    'test-gate': {
      seconds: 3,
      start: () => {
        const checks = gate();
        const passed = new THREE.Vector3(GATE_X, 0.25, 4.4);
        const sentBack = new THREE.Vector3(GATE_X, 0.25, 0.6);
        const good = hidden('good-block', BLOCK, colors.glow, ON_BENCH);
        const bad = hidden('bad-block', BLOCK, colors.glow, ON_BENCH);
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
          // About when the good block's slide carries it through the gate.
          const goodPassed = progress >= 0.3;
          const caught = progress >= 0.72;
          checks.paint(caught ? colors.alert : goodPassed ? PASSED : colors.base);
          good.material = goodPassed ? PASSED : colors.glow;
          bad.material = caught ? colors.alert : colors.glow;
        });
      },
    },
    // Green isn't proof: the gate stops a bad block and turns red, then it's knocked flat
    // (a test bent to agree with the bug, or CI told to ignore failures), glows green
    // again, and the red block rolls straight over it.
    'gate-bent': {
      seconds: 3,
      start: () => {
        const checks = gate();
        const through = new THREE.Vector3(GATE_X, 0.25, 5.2);
        const bad = hidden('bad-block', BLOCK, colors.glow, ON_BENCH);
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
          checks.paint(knockedDown >= 1 ? PASSED : caught ? colors.alert : colors.base);
          bad.material = caught ? colors.alert : colors.glow;
        });
      },
    },
    // An eval is fixed examples, each graded the same way, and a score, not one feeling:
    // five of the model's answers line up, each in turn is checked and turns green or red,
    // and a meter fills a step for every one that passed, as in "41/50 passed".
    'eval-scores': {
      seconds: 2.8,
      start: () => {
        const passes = [true, true, false, true, true];
        const spacing = 0.7;
        const z = 1.6;
        // Graded one after another, left to right, each check taking a moment.
        const answers = passes.map((passed, index) => ({
          mesh: hidden(
            'answer',
            BLOCK,
            colors.light,
            new THREE.Vector3(3.4 + index * spacing, 0.25, z),
          ),
          passed,
          gradedFrom: 0.3 + index * 0.12,
        }));
        const grading = (progress: number, gradedFrom: number) =>
          phase(progress, gradedFrom, gradedFrom + 0.08);
        // The meter's dark frame is a full score; its green fill is the share that passed.
        const meterX = 3.4 + passes.length * spacing + 0.2;
        const meterHeight = 2;
        const step = meterHeight / passes.length;
        const frame = hidden(
          'score-frame',
          SCORE_BAR,
          colors.base,
          new THREE.Vector3(meterX, 0, z),
        );
        const fill = hidden('score', SCORE_BAR, PASSED, new THREE.Vector3(meterX, 0, z));
        /** Stands a bar on the floor at `height`, hidden while it has none. */
        const stand = (bar: THREE.Mesh, height: number, width: number) => {
          bar.scale.set(width, Math.max(0.001, height), width);
          bar.position.y = height / 2;
          bar.visible = height > 0;
        };
        return run(stage, [], (progress) => {
          let score = 0;
          answers.forEach(({ mesh, passed, gradedFrom }, index) => {
            popIn(mesh, phase(progress, index * 0.03, index * 0.03 + 0.15));
            const checked = grading(progress, gradedFrom);
            // A small hop as it's checked, so the eye follows the grading along the row.
            mesh.position.y = 0.25 + Math.sin(checked * Math.PI) * 0.25;
            const graded = progress >= gradedFrom;
            mesh.material = !graded ? colors.light : passed ? PASSED : colors.alert;
            // Only passes add to the score, each as it's graded; a failure adds nothing.
            if (passed) score += step * checked;
          });
          stand(frame, meterHeight * phase(progress, 0.05, 0.25), 1);
          // A little wider than the frame, so the fill wraps it instead of flickering inside it.
          stand(fill, score, 1.15);
        });
      },
    },
    // Guardrails: a fence rises round Otto's bench (limited access) and the key drops into
    // a safe outside it (no secrets in reach). A stranger's red note then flies in over the
    // fence and lands by Otto, because he reads whatever he's given and no fence keeps words
    // out. What the fence stops is the red errand the note sends him on: it heads for the
    // key, hits the rail, and drops inside.
    'guardrails-up': {
      seconds: 3,
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
          hidden('fence-post', FENCE_POST, colors.glow, onFence(degrees, 0.8)),
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
        // In front of the bench, too, so the errand meets the fence over open floor.
        const safeAt = new THREE.Vector3(4, 0.35, 2.6);
        const safe = hidden('safe', SAFE, colors.light, safeAt);
        const key = new THREE.Group();
        key.name = 'key';
        key.add(part(KEY_RING, colors.glow, 0, 0.42, 0), part(KEY_SHAFT, colors.glow, 0, 0, 0));
        key.visible = false;
        stage.add(key);
        const keyAbove = new THREE.Vector3(safeAt.x, 1.7, safeAt.z);
        // Low enough that the shaft is inside the safe and only the ring shows on top.
        const keyLocked = new THREE.Vector3(safeAt.x, 0.55, safeAt.z);
        const outside = new THREE.Vector3(8, 3.2, 4);
        // Propped on the bench at Otto's side, where he reads it.
        const read = new THREE.Vector3(1.5, BENCH_TOP + 0.45, -0.3);
        const note = card('note', outside, 2, colors.alert, colors.dark);
        // The errand leaves Otto's chest, clear of his body, on the straight line to the key.
        const fromOtto = new THREE.Vector3(ROBOT.x + 0.7, BENCH_TOP + 0.7, ROBOT.z + 0.6);
        const towardKey = (Math.atan2(safeAt.x - ROBOT.x, safeAt.z - ROBOT.z) * 180) / Math.PI;
        // Level with the top rail and just inside it, so the orb touches the rail it hits.
        const stopped = onFence(towardKey, 1.3, -0.4);
        const dropped = onFence(towardKey, 0.22, -0.9);
        const errand = hidden('errand', ORB, colors.alert, fromOtto);
        return run(stage, [], (progress) => {
          posts.forEach((post, index) => {
            const start = index * 0.02;
            const rise = phase(progress, start, start + 0.2);
            post.scale.set(1, Math.max(0.001, rise), 1);
            post.position.y = 0.8 * rise;
            post.visible = rise > 0;
          });
          const railed = phase(progress, 0.3, 0.4);
          rails.forEach((rail) => {
            rail.grow(railed);
          });
          popIn(safe, phase(progress, 0.06, 0.16));
          popIn(key, phase(progress, 0.14, 0.2));
          slide(key, keyAbove, keyLocked, phase(progress, 0.2, 0.34));
          // A high arc, so the note clears the fence: it doesn't stop what Otto reads.
          popIn(note.group, phase(progress, 0.38, 0.44), 0.6);
          slide(note.group, outside, read, phase(progress, 0.4, 0.6), 0.6);
          popIn(errand, phase(progress, 0.62, 0.68));
          if (progress < 0.8) {
            slide(errand, fromOtto, stopped, phase(progress, 0.64, 0.8));
          } else {
            slide(errand, stopped, dropped, phase(progress, 0.8, 1), 0.25);
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
        const orb = hidden('stuck-orb', ORB, colors.alert, lapStart);
        const sign = hidden(
          'stop-sign',
          STOP_SIGN,
          colors.alert,
          new THREE.Vector3(1.4, 3.6, -0.6),
        );
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
  robot.name = 'otto';
  robot.add(part(new THREE.BoxGeometry(0.9, 1, 0.6), colors.light, 0, 0.5, 0));
  const head = new THREE.Group();
  head.add(part(new THREE.SphereGeometry(0.4, 20, 16), colors.light, 0, 0, 0));
  const visor = part(new THREE.BoxGeometry(0.55, 0.14, 0.1), colors.glow, 0, 0.02, 0.36);
  visor.name = 'visor';
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
