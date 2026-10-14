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
 * Act 8's island: an interview hall, a table with the panel on the far side and the
 * candidate's chair on the near side, and a whiteboard behind. Its beats act out the
 * rounds of the loop: words travelling to the panel, a bug found on the board, a trail of
 * evidence, a design drawn box by box, a customer heard before the answer, a story built
 * in order, and Otto's loop of brief, work and check.
 */

const BUBBLE = new THREE.SphereGeometry(0.18, 16, 12);
const DOT = new THREE.SphereGeometry(0.09, 12, 8);
/** One line of code on the whiteboard, one unit wide, stretched to each line's length. */
const CODE_LINE = new THREE.BoxGeometry(1, 0.1, 0.02);
/** A box in a design sketch on the whiteboard: a client, a server, a queue. */
const BOARD_BOX = new THREE.BoxGeometry(0.62, 0.36, 0.03);
/** A note or log card lying on the table. */
const TABLE_CARD = new THREE.BoxGeometry(0.6, 0.05, 0.42);
/** One part of a story, stacked on the table: situation, action, result, lesson. */
const STORY_BLOCK = new THREE.BoxGeometry(1, 0.2, 0.55);
const OTTO_BODY = new THREE.SphereGeometry(0.32, 20, 14);
const OTTO_VISOR = new THREE.BoxGeometry(0.4, 0.1, 0.06);
const CHECK_RING = new THREE.TorusGeometry(0.28, 0.06, 10, 28);
const PERSON = new THREE.CylinderGeometry(0.22, 0.3, 1.3, 14);

/** A point in the hall's own space. */
const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const TABLE_Z = -2;
/** The table's top surface, where cards and story blocks rest. */
const TABLE_TOP = 1.05;
/** Where the candidate's head would be, over the near chair. */
const CANDIDATE = at(0, 1.6, -0.9);
/** Where each panel member's head would be, over the far chairs. */
const PANEL = [at(-1, 1.6, -3.1), at(0, 1.6, -3.1), at(1, 1.6, -3.1)];
/** Just in front of the whiteboard's face, so what a beat draws sits on the board. */
const BOARD_Z = -6.42;
/** The customer stands off to the right of the table, in the camera's view. */
const CUSTOMER = at(4, 0.65, 0.4);
const CUSTOMER_HEAD = at(4, 1.6, 0.4);

/** The parts of the idle hall that beats change. */
interface HallParts {
  /** The three panel seats, left to right. They light up when the panel follows along. */
  readonly panelSeats: readonly THREE.Mesh[];
  /** The idle scribble on the whiteboard, hidden while a beat draws there. */
  readonly marker: THREE.Mesh;
}

/** Moves an object along a path of points, `amount` 0 to 1 covering every leg evenly. */
function travel(object: THREE.Object3D, points: readonly THREE.Vector3[], amount: number): void {
  const legs = points.length - 1;
  const clamped = Math.min(1, Math.max(0, amount));
  const leg = Math.min(legs - 1, Math.floor(clamped * legs));
  const from = points[leg];
  const to = points[leg + 1];
  if (!from || !to) return;
  slide(object, from, to, clamped * legs - leg);
}

/** Shows an object only while `amount` is part way, for things that pass through. */
function inFlight(object: THREE.Object3D, amount: number): void {
  object.visible = amount > 0 && amount < 1;
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

function act8Beats(stage: Stage, hall: HallParts, colors: Palette): Record<BeatId<'act8'>, Beat> {
  /** A mesh the beat adds, hidden until its moment. */
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    point: THREE.Vector3,
  ): THREE.Mesh => {
    const mesh = part(geometry, material, point.x, point.y, point.z);
    mesh.visible = false;
    stage.add(mesh);
    return mesh;
  };
  /** A line drawn on the whiteboard between two of its boxes. */
  const boardLink = (from: THREE.Vector3, to: THREE.Vector3) => {
    const stick = segment(from, to, colors.dark);
    stick.mesh.scale.y = 0.4;
    stick.grow(0);
    stage.add(stick.mesh);
    return stick;
  };

  return {
    // Thinking out loud: your words travel to each panel member, and each one lights up
    // as they follow your reasoning.
    'think-aloud': {
      seconds: 2.4,
      start: () => {
        const bubbles = PANEL.map(() => add(BUBBLE, colors.glow, CANDIDATE));
        return run(stage, hall.panelSeats, (progress) => {
          bubbles.forEach((bubble, index) => {
            const start = index * 0.22;
            const flight = phase(progress, start, start + 0.45);
            const target = PANEL[index] ?? CANDIDATE;
            slide(bubble, CANDIDATE, target, flight, 0.6);
            popIn(bubble, Math.min(1, flight * 4) * (1 - phase(progress, start + 0.45, 1)));
            const seat = hall.panelSeats[index];
            if (seat) seat.material = flight >= 1 ? colors.glow : colors.base;
          });
        });
      },
    },
    // Reading code for a bug: lines of code appear on the board, a pointer reads down
    // them one by one, and the faulty line turns red.
    'spot-the-bug': {
      seconds: 2.6,
      start: () => {
        const widths = [2.2, 1.6, 1.9, 1.2, 2.0];
        const left = -1.35;
        const lineY = (index: number) => 2.85 - index * 0.28;
        const lines = widths.map((width, index) => {
          const line = add(CODE_LINE, colors.dark, at(left + width / 2, lineY(index), BOARD_Z));
          line.scale.x = width;
          return line;
        });
        const buggy = 2;
        const pointer = add(DOT, colors.glow, at(left - 0.15, lineY(0), BOARD_Z));
        return run(stage, [hall.marker], (progress) => {
          hall.marker.visible = false;
          lines.forEach((line, index) => {
            line.visible = progress >= index * 0.06;
          });
          const reading = phase(progress, 0.3, 0.75);
          pointer.visible = progress >= 0.3;
          slide(
            pointer,
            at(left - 0.15, lineY(0), BOARD_Z),
            at(left - 0.15, lineY(buggy), BOARD_Z),
            reading,
          );
          const found = progress >= 0.8;
          const bugLine = lines[buggy];
          if (bugLine) bugLine.material = found ? colors.alert : colors.dark;
          pointer.material = found ? colors.alert : colors.glow;
        });
      },
    },
    // Debugging from symptoms: a red symptom lands on the table, a trail of evidence
    // leads from it to the cause, and only once the cause is found does the red calm down.
    'trace-evidence': {
      seconds: 2.8,
      start: () => {
        const symptomAt = at(-1.2, TABLE_TOP, TABLE_Z);
        const causeAt = at(1.2, TABLE_TOP, TABLE_Z);
        const symptom = add(TABLE_CARD, colors.alert, symptomAt);
        const trail = segment(symptomAt, causeAt, colors.glow);
        trail.mesh.scale.y = 0.4;
        trail.grow(0);
        stage.add(trail.mesh);
        const clues = [0.3, 0.5, 0.7].map((share) =>
          add(
            DOT,
            colors.light,
            new THREE.Vector3().lerpVectors(symptomAt, causeAt, share).setY(1.18),
          ),
        );
        const cause = add(TABLE_CARD, colors.glow, causeAt);
        return run(stage, [], (progress) => {
          popIn(symptom, phase(progress, 0, 0.2));
          const tracing = phase(progress, 0.2, 0.7);
          trail.grow(tracing);
          clues.forEach((clue, index) => {
            popIn(clue, phase(progress, 0.25 + index * 0.13, 0.35 + index * 0.13), 1);
          });
          popIn(cause, phase(progress, 0.7, 0.85), 1);
          symptom.material = progress >= 0.9 ? colors.light : colors.alert;
        });
      },
    },
    // A design round on the whiteboard: client, server and database, then requests
    // flowing through. The slow job gets a queue and a worker of its own, off the path.
    'design-on-board': {
      seconds: 3,
      start: () => {
        const top = 2.5;
        const low = 1.75;
        const client = at(-1.05, top, BOARD_Z);
        const server = at(0, top, BOARD_Z);
        const database = at(1.05, top, BOARD_Z);
        const queue = at(0, low, BOARD_Z);
        const worker = at(1.05, low, BOARD_Z);
        const firstBoxes = [client, server, database].map((point) =>
          add(BOARD_BOX, colors.base, point),
        );
        const laterBoxes = [queue, worker].map((point) => add(BOARD_BOX, colors.glow, point));
        const firstLinks = [boardLink(client, server), boardLink(server, database)];
        const laterLinks = [boardLink(server, queue), boardLink(queue, worker)];
        const request = add(DOT, colors.light, client);
        const slowJob = add(DOT, colors.glow, server);
        return run(stage, [hall.marker], (progress) => {
          hall.marker.visible = false;
          firstBoxes.forEach((box, index) => {
            popIn(box, phase(progress, index * 0.08, index * 0.08 + 0.15));
          });
          firstLinks.forEach((link) => {
            link.grow(phase(progress, 0.2, 0.32));
          });
          const flowing = phase(progress, 0.32, 0.55);
          travel(request, [client, server, database], flowing);
          inFlight(request, flowing);
          laterBoxes.forEach((box, index) => {
            popIn(box, phase(progress, 0.55 + index * 0.06, 0.68 + index * 0.06));
          });
          laterLinks.forEach((link) => {
            link.grow(phase(progress, 0.65, 0.75));
          });
          const queued = phase(progress, 0.75, 1);
          travel(slowJob, [server, queue, worker], queued);
          slowJob.visible = progress >= 0.75;
        });
      },
    },
    // A customer round: the customer's complaint arrives in red, you wait and hear it out,
    // and only then does your answer go back. The complaint calms once it's been heard.
    'listen-first': {
      seconds: 2.8,
      start: () => {
        const customer = add(PERSON, colors.light, CUSTOMER);
        const complaint = add(BUBBLE, colors.alert, CUSTOMER_HEAD);
        const reply = add(BUBBLE, colors.glow, CANDIDATE);
        return run(stage, [], (progress) => {
          popIn(customer, phase(progress, 0, 0.15));
          const arriving = phase(progress, 0.12, 0.4);
          slide(complaint, CUSTOMER_HEAD, CANDIDATE, arriving, 0.8);
          popIn(complaint, Math.min(1, arriving * 5), 1.3);
          // A pause while you listen: the complaint pulses where you sit, then calms.
          const listening = phase(progress, 0.4, 0.65);
          const pulse = 1.3 + Math.sin(listening * Math.PI * 3) * 0.15 * (1 - listening);
          if (arriving >= 1) complaint.scale.setScalar(pulse);
          complaint.material = progress >= 0.65 ? colors.light : colors.alert;
          const answering = phase(progress, 0.65, 1);
          reply.visible = answering > 0;
          slide(reply, CANDIDATE, CUSTOMER_HEAD, answering, 0.8);
        });
      },
    },
    // Telling your story: it's built in order, one block on the last, situation, what you
    // did, the result, and what you learned on top.
    'tell-your-story': {
      seconds: 2.6,
      start: () => {
        const materials = [colors.base, colors.base, colors.glow, colors.light];
        const blocks = materials.map((material, index) =>
          add(STORY_BLOCK, material, at(0, TABLE_TOP + 0.1 + index * 0.22, TABLE_Z)),
        );
        return run(stage, [], (progress) => {
          blocks.forEach((block, index) => {
            const start = index * 0.22;
            const landing = phase(progress, start, start + 0.25);
            const rest = at(0, TABLE_TOP + 0.1 + index * 0.22, TABLE_Z);
            slide(block, at(rest.x, rest.y + 1.2, rest.z), rest, landing);
            popIn(block, Math.min(1, landing * 3));
          });
        });
      },
    },
    // Directing an agent: you hand Otto a brief, he runs a lap of work around the table,
    // brings back his result, and the check over your chair turns green only then.
    'agent-loop': {
      seconds: 3,
      start: () => {
        const ottoHeight = 1.7;
        const lapCentre = at(0, ottoHeight, TABLE_Z);
        const lapPoint = (turn: number) =>
          at(
            lapCentre.x + Math.sin(turn * Math.PI * 2) * 2.8,
            ottoHeight,
            lapCentre.z + Math.cos(turn * Math.PI * 2) * 2,
          );
        const home = lapPoint(0);
        const otto = new THREE.Group();
        otto.add(
          part(OTTO_BODY, colors.glow, 0, 0, 0),
          part(OTTO_VISOR, colors.dark, 0, 0.05, 0.3),
        );
        otto.position.copy(home);
        otto.visible = false;
        stage.add(otto);
        const brief = add(TABLE_CARD, colors.light, CANDIDATE);
        const check = add(CHECK_RING, colors.light, at(CANDIDATE.x, 2.4, CANDIDATE.z));
        return run(stage, [], (progress) => {
          popIn(otto, phase(progress, 0, 0.12));
          popIn(check, phase(progress, 0, 0.12));
          const handing = phase(progress, 0.1, 0.25);
          slide(brief, CANDIDATE, home, handing, 0.4);
          inFlight(brief, handing);
          const lap = phase(progress, 0.25, 0.8);
          otto.position.copy(lapPoint(lap));
          // The result comes back the way the brief went out.
          const returning = phase(progress, 0.8, 0.92);
          const result = progress >= 0.8;
          if (result) {
            brief.visible = returning < 1;
            slide(brief, home, CANDIDATE, returning, 0.4);
            brief.material = colors.glow;
          } else {
            brief.material = colors.light;
          }
          check.material = progress >= 0.92 ? colors.glow : colors.light;
        });
      },
    },
  };
}

/** Act 8: an interview hall: pillars in a half circle, a table, chairs and a whiteboard. */
export function hall(colors: Palette): Props {
  const group = new THREE.Group();
  group.add(part(new THREE.CylinderGeometry(6, 6, 0.12, 48), colors.base, 0, 0.06, -2));
  const pillar = new THREE.CylinderGeometry(0.3, 0.35, 3.6, 16);
  for (let index = 0; index < 7; index++) {
    const angle = -Math.PI / 2 + (index / 6) * Math.PI;
    group.add(part(pillar, colors.light, Math.sin(angle) * 6, 1.8, -2 - Math.cos(angle) * 6));
  }
  group.add(part(new THREE.BoxGeometry(3.4, 0.15, 1.2), colors.dark, 0, 0.95, TABLE_Z));
  const tableLeg = new THREE.BoxGeometry(0.15, 0.9, 0.15);
  for (const x of [-1.5, 1.5]) group.add(part(tableLeg, colors.dark, x, 0.45, TABLE_Z));
  const seat = new THREE.BoxGeometry(0.6, 0.1, 0.6);
  const back = new THREE.BoxGeometry(0.6, 0.7, 0.1);
  const panelSeats: THREE.Mesh[] = [];
  // The panel on the far side, and the candidate's chair on the near side.
  for (const [x, z, facing] of [
    [-1, -3.1, 1],
    [0, -3.1, 1],
    [1, -3.1, 1],
    [0, -0.9, -1],
  ] as const) {
    const chairSeat = part(seat, colors.base, x, 0.55, z);
    group.add(chairSeat);
    if (facing === 1) panelSeats.push(chairSeat);
    group.add(part(back, colors.base, x, 0.9, z - facing * 0.28));
  }
  group.add(part(new THREE.BoxGeometry(3.2, 1.8, 0.1), colors.light, 0, 2.2, -6.5));
  const marker = part(new THREE.BoxGeometry(2.4, 0.06, 0.02), colors.glow, 0, 2.6, -6.44);
  group.add(marker);
  const stage = createStage(group);
  return {
    group,
    animate: (elapsed) => {
      // Someone is drawing on the whiteboard: the line grows and starts again.
      marker.scale.x = 0.2 + ((elapsed * 0.25) % 1) * 0.8;
    },
    beats: act8Beats(stage, { panelSeats, marker }, colors),
  };
}
