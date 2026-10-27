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
 * Act 8's island: an interview hall, a table with the panel on the far side and the
 * candidate's chair on the near side, and a whiteboard behind. Its beats act out the
 * rounds of the loop: words travelling to the panel, a bug found on the board, a trail of
 * evidence, a design fixed where it breaks, a customer heard before the answer, a story
 * built in order, and Otto's loop of brief, work and check.
 */

const BUBBLE = new THREE.SphereGeometry(0.18, 16, 12);
/** A request, the pointer reading code, a clue: big enough to follow from the player's spot. */
const DOT = new THREE.SphereGeometry(0.13, 12, 8);
/** One line of code on the whiteboard, one unit wide, stretched to each line's length. */
const CODE_LINE = new THREE.BoxGeometry(1, 0.14, 0.02);
/** A box in a design sketch on the whiteboard: a client, a server, a queue. */
const BOARD_BOX = new THREE.BoxGeometry(0.86, 0.5, 0.03);
/*
 * A symptom or a cause, stood up on the table facing the player. Lying flat, the camera's
 * low angle squashed a card to a sliver.
 */
const STANDING_CARD_HALF_WIDTH = 0.4;
const STANDING_CARD = new THREE.BoxGeometry(STANDING_CARD_HALF_WIDTH * 2, 0.55, 0.05);
/*
 * A sheet in flight, held up to face the player: Otto's brief going out, his result coming
 * back. A flat sheet would show only its edge from the player's spot.
 */
const NOTE = new THREE.BoxGeometry(0.45, 0.32, 0.04);
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
/** The middle of a standing card whose bottom edge rests on the table. */
const STANDING_Y = TABLE_TOP + 0.275;
/** Where the candidate's head would be, over the near chair. */
const CANDIDATE = at(0, 1.6, -0.9);
/** Where each panel member's head would be, over the far chairs. */
const PANEL = [at(-1, 1.6, -3.1), at(0, 1.6, -3.1), at(1, 1.6, -3.1)];
/*
 * The whiteboard behind the panel. It's far from the camera, so it's big enough for a
 * beat's code lines and design sketches to read from where the player stands.
 */
const BOARD_WIDTH = 4.4;
const BOARD_HEIGHT = 2.5;
const BOARD_MIDDLE = 2.35;
/** Just in front of the whiteboard's face, so what a beat draws sits on the board. */
const BOARD_Z = -6.42;
/** The customer stands off to the right of the table, in the camera's view. */
const CUSTOMER = at(4, 0.65, 0.4);
const CUSTOMER_HEAD = at(4, 1.6, 0.4);

/*
 * The design sketch both design beats draw on the whiteboard: the simplest design that
 * works, a client, a server and a database in a row, with room under it for what a fix adds.
 */
const SKETCH_TOP = 2.95;
const SKETCH_LOW = 1.85;
const SKETCH_STEP = 1.45;
const CLIENT = at(-SKETCH_STEP, SKETCH_TOP, BOARD_Z);
const SERVER = at(0, SKETCH_TOP, BOARD_Z);
const DATABASE = at(SKETCH_STEP, SKETCH_TOP, BOARD_Z);
const UNDER_SERVER = at(0, SKETCH_LOW, BOARD_Z);
const UNDER_DATABASE = at(SKETCH_STEP, SKETCH_LOW, BOARD_Z);
/** The same spot, a little off the board, so a request travelling past a box shows over it. */
const overBoard = (point: THREE.Vector3) => point.clone().setZ(BOARD_Z + 0.1);

/** The parts of the idle hall that beats change. */
interface HallParts {
  /**
   * The backs of the three panel chairs, left to right. They light up when the panel
   * follows along: from where the player stands the table hides the seats, not the backs.
   */
  readonly panelBacks: readonly THREE.Mesh[];
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
    const mesh = stage.part(geometry, material, point.x, point.y, point.z);
    mesh.visible = false;
    return mesh;
  };
  /** A line drawn on the whiteboard between two of its boxes. */
  const boardLink = (from: THREE.Vector3, to: THREE.Vector3) => {
    const stick = stage.segment(from, to, colors.dark);
    stick.grow(0);
    return stick;
  };
  /**
   * The simple design, ready to draw: its three boxes and the two lines between them.
   * `draw(amount)` puts it on the board, 0 to 1.
   */
  const simpleDesign = () => {
    const boxes = [CLIENT, SERVER, DATABASE].map((point) => add(BOARD_BOX, colors.base, point));
    const links = [boardLink(CLIENT, SERVER), boardLink(SERVER, DATABASE)];
    const [client, server, database] = boxes;
    if (!client || !server || !database) throw new Error('The design sketch lost a box.');
    return {
      server,
      database,
      draw: (amount: number) => {
        boxes.forEach((box, index) => {
          popIn(box, phase(amount, index * 0.2, index * 0.2 + 0.5));
        });
        links.forEach((link) => {
          link.grow(phase(amount, 0.6, 1));
        });
      },
    };
  };

  return {
    // Thinking out loud: your words travel to each panel member, and each one lights up
    // as they follow your reasoning. The words stay with them: they heard every step.
    'think-aloud': {
      seconds: 2.4,
      start: () => {
        const bubbles = PANEL.map(() => add(BUBBLE, colors.glow, CANDIDATE));
        return run(stage, hall.panelBacks, (progress) => {
          bubbles.forEach((bubble, index) => {
            const start = index * 0.22;
            const flight = phase(progress, start, start + 0.45);
            const target = PANEL[index] ?? CANDIDATE;
            slide(bubble, CANDIDATE, target, flight, 0.6);
            popIn(bubble, Math.min(1, flight * 4));
            const chairBack = hall.panelBacks[index];
            if (chairBack) chairBack.material = flight >= 1 ? colors.glow : colors.base;
          });
        });
      },
    },
    // Reading code for a bug: lines of code appear on the board, a pointer reads down
    // them one by one, and the faulty line turns red.
    'spot-the-bug': {
      seconds: 2.6,
      start: () => {
        const widths = [3.0, 2.2, 2.6, 1.7, 2.8];
        const left = -1.85;
        const lineY = (index: number) => 3.2 - index * 0.38;
        const lines = widths.map((width, index) => {
          const line = add(CODE_LINE, colors.dark, at(left + width / 2, lineY(index), BOARD_Z));
          line.scale.x = width;
          return line;
        });
        const buggy = 2;
        const firstLine = overBoard(at(left - 0.2, lineY(0), BOARD_Z));
        const bugLineStart = overBoard(at(left - 0.2, lineY(buggy), BOARD_Z));
        const pointer = add(DOT, colors.glow, firstLine);
        return run(stage, [hall.marker], (progress) => {
          hall.marker.visible = false;
          lines.forEach((line, index) => {
            line.visible = progress >= index * 0.06;
          });
          pointer.visible = progress >= 0.3;
          slide(pointer, firstLine, bugLineStart, phase(progress, 0.3, 0.75));
          const found = progress >= 0.8;
          const bugLine = lines[buggy];
          if (bugLine) bugLine.material = found ? colors.alert : colors.dark;
          pointer.material = found ? colors.alert : colors.glow;
        });
      },
    },
    // Debugging from symptoms: a red symptom goes up on the table, a trail of evidence
    // leads from it clue by clue, and the cause lights up at its end. The symptom stays
    // red: finding the cause isn't fixing it, and these cards stop before anyone changes code.
    'trace-evidence': {
      seconds: 2.8,
      start: () => {
        const symptom = add(STANDING_CARD, colors.alert, at(-1.2, STANDING_Y, TABLE_Z));
        const cause = add(STANDING_CARD, colors.glow, at(1.2, STANDING_Y, TABLE_Z));
        // The trail runs between the cards' facing edges, so it never cuts across one.
        const trailFrom = at(-1.2 + STANDING_CARD_HALF_WIDTH, STANDING_Y, TABLE_Z);
        const trailTo = at(1.2 - STANDING_CARD_HALF_WIDTH, STANDING_Y, TABLE_Z);
        const trail = stage.segment(trailFrom, trailTo, colors.glow);
        trail.grow(0);
        const clueShares = [0.25, 0.5, 0.75];
        const clues = clueShares.map((share) =>
          add(
            DOT,
            colors.light,
            new THREE.Vector3().lerpVectors(trailFrom, trailTo, share).setZ(TABLE_Z + 0.12),
          ),
        );
        return run(stage, [], (progress) => {
          popIn(symptom, phase(progress, 0, 0.2));
          const reach = phase(progress, 0.2, 0.75);
          trail.grow(reach);
          // Each clue turns up as the trail reaches it: evidence, not a leap to the answer.
          clues.forEach((clue, index) => {
            popIn(clue, (reach - (clueShares[index] ?? 0)) * 5);
          });
          popIn(cause, phase(progress, 0.75, 0.9));
        });
      },
    },
    // Fixing the busy path: the simple design goes on the board, a stream of reads piles
    // onto the database until it turns red, then a cache goes in front of it. The same
    // reads now stop at the cache, and the database calms down.
    'cache-the-reads': {
      seconds: 3,
      start: () => {
        const design = simpleDesign();
        const cache = add(BOARD_BOX, colors.glow, UNDER_SERVER);
        const cacheLink = boardLink(SERVER, UNDER_SERVER);
        const toDatabase = [CLIENT, SERVER, DATABASE].map(overBoard);
        const toCache = [CLIENT, SERVER, UNDER_SERVER].map(overBoard);
        const before = [0, 1, 2].map(() => add(DOT, colors.light, CLIENT));
        const after = [0, 1, 2].map(() => add(DOT, colors.light, CLIENT));
        /** How much of the beat one read takes to cross the board. */
        const readTime = 0.16;
        const cachedReadsStart = 0.65;
        return run(stage, [hall.marker], (progress) => {
          hall.marker.visible = false;
          design.draw(phase(progress, 0, 0.2));
          before.forEach((read, index) => {
            const start = 0.2 + index * 0.07;
            const going = phase(progress, start, start + readTime);
            travel(read, toDatabase, going);
            inFlight(read, going);
          });
          // The cache doesn't calm the database by appearing: reads answered there stop
          // reaching it, so it stays red until the first one lands at the cache.
          const overloaded = progress >= 0.32 && progress < cachedReadsStart + readTime;
          design.database.material = overloaded ? colors.alert : colors.base;
          popIn(cache, phase(progress, 0.5, 0.62));
          cacheLink.grow(phase(progress, 0.55, 0.65));
          after.forEach((read, index) => {
            const start = cachedReadsStart + index * 0.08;
            const going = phase(progress, start, start + readTime);
            travel(read, toCache, going);
            // These stay where they landed: answered at the cache, never reaching the database.
            read.visible = going > 0;
          });
        });
      },
    },
    // Slow work goes on a queue: a slow job jams the server, which turns red as the request
    // times out. A queue and a worker go on the board, the job moves off to the worker, and a
    // quick request flows through the freed server again.
    'queue-slow-work': {
      seconds: 3,
      start: () => {
        const design = simpleDesign();
        const queue = add(BOARD_BOX, colors.glow, UNDER_SERVER);
        const worker = add(BOARD_BOX, colors.glow, UNDER_DATABASE);
        const laterLinks = [
          boardLink(SERVER, UNDER_SERVER),
          boardLink(UNDER_SERVER, UNDER_DATABASE),
        ];
        const toServer = [CLIENT, SERVER].map(overBoard);
        const offToWorker = [SERVER, UNDER_SERVER, UNDER_DATABASE].map(overBoard);
        const quickPath = [CLIENT, SERVER, DATABASE].map(overBoard);
        const job = add(BUBBLE, colors.glow, CLIENT);
        const quick = add(DOT, colors.light, CLIENT);
        return run(stage, [hall.marker], (progress) => {
          hall.marker.visible = false;
          design.draw(phase(progress, 0, 0.2));
          job.visible = progress >= 0.15;
          if (progress < 0.6) travel(job, toServer, phase(progress, 0.15, 0.3));
          else travel(job, offToWorker, phase(progress, 0.6, 0.85));
          const jammed = progress >= 0.32 && progress < 0.6;
          design.server.material = jammed ? colors.alert : colors.base;
          popIn(queue, phase(progress, 0.42, 0.52));
          popIn(worker, phase(progress, 0.47, 0.57));
          laterLinks.forEach((link) => {
            link.grow(phase(progress, 0.5, 0.6));
          });
          const zipping = phase(progress, 0.82, 1);
          travel(quick, quickPath, zipping);
          inFlight(quick, zipping);
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
        const rests = materials.map((_, index) => at(0, TABLE_TOP + 0.1 + index * 0.22, TABLE_Z));
        const drops = rests.map((rest) => rest.clone().setY(rest.y + 1.2));
        const blocks = materials.map((material, index) =>
          add(STORY_BLOCK, material, rests[index] ?? CANDIDATE),
        );
        return run(stage, [], (progress) => {
          blocks.forEach((block, index) => {
            const start = index * 0.22;
            const landing = phase(progress, start, start + 0.25);
            const rest = rests[index];
            const drop = drops[index];
            if (rest && drop) slide(block, drop, rest, landing);
            popIn(block, Math.min(1, landing * 3));
          });
        });
      },
    },
    // Directing an agent: you hand Otto a brief, he runs a lap of work around the table,
    // brings back his result, and only then does the check over your chair light up.
    'agent-loop': {
      seconds: 3,
      start: () => {
        const ottoHeight = 1.7;
        /*
         * Otto waits beside your chair, not in front of it, so the brief and the result
         * travel across the player's view instead of straight toward the camera.
         */
        const lapStart = 0.15;
        /** Where Otto is `turn` (0 to 1) of the way round the table, written into `into`. */
        const lapPoint = (turn: number, into: THREE.Vector3) => {
          const angle = (lapStart + turn) * Math.PI * 2;
          return into.set(Math.sin(angle) * 2.8, ottoHeight, TABLE_Z + Math.cos(angle) * 2);
        };
        const home = lapPoint(0, new THREE.Vector3());
        const otto = new THREE.Group();
        otto.add(
          stage.part(OTTO_BODY, colors.glow, 0, 0, 0),
          stage.part(OTTO_VISOR, colors.dark, 0, 0.05, 0.3),
        );
        otto.position.copy(home);
        otto.visible = false;
        stage.add(otto);
        const brief = add(NOTE, colors.light, CANDIDATE);
        const check = add(CHECK_RING, colors.light, at(CANDIDATE.x, 2.4, CANDIDATE.z));
        return run(stage, [], (progress) => {
          popIn(otto, phase(progress, 0, 0.12));
          popIn(check, phase(progress, 0, 0.12));
          lapPoint(phase(progress, 0.25, 0.8), otto.position);
          // The brief goes out to Otto, and his result comes back the same way.
          const handing = phase(progress, 0.1, 0.25);
          const returning = phase(progress, 0.8, 0.92);
          if (progress < 0.8) {
            slide(brief, CANDIDATE, home, handing, 0.4);
            inFlight(brief, handing);
            brief.material = colors.light;
          } else {
            slide(brief, home, CANDIDATE, returning, 0.4);
            brief.visible = returning < 1;
            brief.material = colors.glow;
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
  const panelBacks: THREE.Mesh[] = [];
  // The panel on the far side, and the candidate's chair on the near side.
  for (const [x, z, facing] of [
    [-1, -3.1, 1],
    [0, -3.1, 1],
    [1, -3.1, 1],
    [0, -0.9, -1],
  ] as const) {
    group.add(part(seat, colors.base, x, 0.55, z));
    const chairBack = part(back, colors.base, x, 0.9, z - facing * 0.28);
    group.add(chairBack);
    if (facing === 1) panelBacks.push(chairBack);
  }
  group.add(
    part(
      new THREE.BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, 0.1),
      colors.light,
      0,
      BOARD_MIDDLE,
      -6.5,
    ),
  );
  const marker = part(new THREE.BoxGeometry(3.2, 0.08, 0.02), colors.glow, 0, 3.1, -6.44);
  group.add(marker);
  const stage = createStage(group);
  return {
    group,
    animate: (elapsed) => {
      // Someone is drawing on the whiteboard: the line grows and starts again.
      marker.scale.x = 0.2 + ((elapsed * 0.25) % 1) * 0.8;
    },
    beats: act8Beats(stage, { panelBacks, marker }, colors),
  };
}
