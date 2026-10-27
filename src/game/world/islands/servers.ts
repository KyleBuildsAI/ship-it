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
 * Act 6's island: racks of servers joined by a pipe to a database drum, and a client
 * screen out front where a writer sits. Its beats act out the Act's lesson cards with
 * glowing packets: a request travels in and a response travels back, a gate checks who's
 * asking, a query runs down the pipe, a cache answers early, jobs wait in a queue, a log
 * scrolls to its one red line, database connections run out, and a bad release is rolled
 * back.
 */

const PACKET = new THREE.BoxGeometry(0.34, 0.34, 0.34);
const SMALL_PACKET = new THREE.BoxGeometry(0.24, 0.24, 0.24);
/**
 * The pass a signed-in request carries: a card standing up on its packet, facing the
 * camera. Lying flat on top, it was seen edge-on from the camera's height and barely showed.
 */
const PASS = new THREE.BoxGeometry(0.3, 0.24, 0.04);
/** How high the pass's middle stands above its packet's middle. */
const PASS_HEIGHT = 0.31;
const GATE_POST = new THREE.BoxGeometry(0.14, 2.4, 0.14);
const GATE_BAR = new THREE.BoxGeometry(1.74, 0.16, 0.16);
const CACHE_BOX = new THREE.BoxGeometry(0.8, 0.6, 0.7);
const BELT = new THREE.BoxGeometry(3.4, 0.1, 0.6);
const LOG_LINE = new THREE.BoxGeometry(1.8, 0.14, 0.05);
const MARKER = new THREE.ConeGeometry(0.15, 0.4, 12);
/** One database connection: a ring, a link the server borrows. It faces the camera. */
const RING = new THREE.TorusGeometry(0.16, 0.05, 8, 20);
/** The connection pool: the tray the rings wait in while they're free. */
const TRAY = new THREE.BoxGeometry(1.7, 0.08, 0.45);
/** A release, sitting on top of the rack that runs it. */
const CRATE = new THREE.BoxGeometry(1, 0.5, 0.8);
const SCREEN = new THREE.BoxGeometry(1.4, 0.9, 0.08);
const STAND = new THREE.BoxGeometry(0.1, 0.6, 0.1);
const FOOT = new THREE.BoxGeometry(0.6, 0.05, 0.4);
const RACK = new THREE.BoxGeometry(1.2, 2.6, 1);
const STRIP = new THREE.BoxGeometry(0.9, 0.06, 0.02);
const PIPE = new THREE.CylinderGeometry(0.15, 0.15, 9, 12);
const PIPE_DROP = new THREE.CylinderGeometry(0.15, 0.15, 2, 12);
const DRUM = new THREE.CylinderGeometry(1, 1, 0.55, 32);

const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/*
 * Where things go. Every path a beat moves along is built once here, so drawing a frame
 * allocates nothing.
 */

/** Where packets leave and reach the writer's screen: just over its top edge. */
const CLIENT = point(2.5, 1.9, 4.4);
/** The front of the rack (x = 2) that answers requests. */
const RACK_DOOR = point(2, 1.4, -1.2);
const TO_RACK = [CLIENT, RACK_DOOR];
const FROM_RACK = [RACK_DOOR, CLIENT];
/** A query's way to the database: down to the pipe, along it, and along the drop. */
const RACK_FOOT = point(2, 0.5, -0.8);
const PIPE_BEND = point(5, 0.5, -0.8);
const DRUM_EDGE = point(5, 0.5, 0.8);
const TO_DATABASE = [RACK_FOOT, PIPE_BEND, DRUM_EDGE];
const FROM_DATABASE = [DRUM_EDGE, PIPE_BEND, RACK_FOOT];
/** The gate stands across the request's path, halfway between screen and rack. */
const GATE = point(2.25, 0, 1.6);
const GATE_FRONT = point(2.25, 1.65, 2.3);
const TO_GATE = [CLIENT, GATE_FRONT];
/**
 * A turned-back request lands on the ground on the writer's side of the gate, left of the
 * screen so the screen can't hide it. Landing right of the screen put it against the
 * database's drums, as if it had been sent there.
 */
const TURNED_BACK = [GATE_FRONT, point(1, 0.17, 3)];
/**
 * The cache stands in the gap between the middle rack and the answering one: against the
 * dark racks it reads clearly, where beside the writer's screen it blurred into its glow.
 */
const CACHE_SPOT = point(1, 0.3, -0.3);
const CACHE_TOP = point(1, 0.8, -0.3);
const TO_CACHE = [CLIENT, RACK_DOOR, CACHE_TOP];
/**
 * The cached answer goes back through the server that looked it up, not straight from the
 * cache to the writer: the cache sits inside our system, and only the server answers.
 */
const FROM_CACHE = [CACHE_TOP, RACK_DOOR, CLIENT];
/** The rack (x = -2) that works through the queue, and the belt's slots, nearest first. */
const WORKER_DOOR = point(-2, 0.6, -1.2);
const QUEUE_SLOTS = [point(-1, 0.3, 0.9), point(-0.2, 0.3, 0.9), point(0.6, 0.3, 0.9)];
/**
 * Each job's two legs: from the screen through the answering rack onto its slot, then from
 * its slot into the worker. The browser never touches the queue: it asks our server, and the
 * server records the job.
 */
const QUEUE_PATHS = QUEUE_SLOTS.map((slot) => ({
  toSlot: [CLIENT, RACK_DOOR, slot],
  toWorker: [slot, WORKER_DOOR],
}));
/**
 * The worker's turns, by job: when it takes the job off the belt and when it's finished.
 * The beat ends mid-work, the second job inside the worker and the third still waiting,
 * so the held picture shows the writer already answered while the work goes on.
 */
const JOB_TURNS = [
  { takenAt: 0.38, doneAt: 0.62 },
  // Finished after the beat ends: still being worked on in the held picture.
  { takenAt: 0.66, doneAt: 2 },
];
/** How long a job takes to move from the belt to the worker's door. */
const TO_WORKER_TIME = 0.12;
/** How long a job takes to shrink into the worker once it reaches the door. */
const INTO_WORKER_TIME = 0.04;
/**
 * The log hangs to the right of the drum, far enough out that the drum doesn't hide its
 * lower lines from the camera: lines stacked upward from LOG_BASE.
 */
const LOG_X = 7.6;
const LOG_BASE_Y = 0.4;
const LOG_STEP = 0.32;
const LOG_Z = -1;
/** How much of a full line each log line fills, so the log looks like ragged text. */
const LOG_WIDTHS = [1, 0.7, 0.9, 0.6, 0.85, 0.75, 0.95];
/** Which line of the log is the error. */
const ERROR_LINE = 4;
/** The connection pool's tray rests on the pipe beside the answering rack. */
const TRAY_SPOT = point(3.45, 0.39, -0.8);
const POOL_SLOTS = [2.85, 3.25, 3.65, 4.05].map((x) => point(x, 0.64, -0.8));
/** Where a ring stands while its connection is open: on the database's top drum. */
const IN_USE_SPOTS = [4.55, 4.85, 5.15, 5.45].map((x) => point(x, 1.99, 1.8));
/** When each ring leaves the tray for good, once the leak starts. */
const LEAK_START = 0.36;
const LEAK_GAP = 0.08;
const POOL_EMPTY_AT = LEAK_START + (POOL_SLOTS.length - 1) * LEAK_GAP + LEAK_GAP;
/** Where a release sits, on top of the middle rack (x = 0). */
const CRATE_SPOT = point(0, 2.85, -2);

/** The parts of the idle island that beats move or recolour. */
interface ServerParts {
  /** The racks, left to right (x = -4, -2, 0, 2). */
  readonly racks: readonly THREE.Mesh[];
  readonly blinkers: readonly THREE.Mesh[];
  /** The database's three drums, bottom first. */
  readonly drums: readonly THREE.Mesh[];
  readonly screen: THREE.Mesh;
}

/**
 * Moves an object along a path of points by `amount` (0 to 1) of its whole length, with an
 * optional hop over the middle, so a packet can follow the pipe round its corners. It runs
 * every frame, so it walks the path with plain loops instead of building arrays.
 */
function travel(
  object: THREE.Object3D,
  points: readonly THREE.Vector3[],
  amount: number,
  hop = 0,
): void {
  const clamped = Math.min(1, Math.max(0, amount));
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    if (from !== undefined && to !== undefined) total += from.distanceTo(to);
  }
  let left = clamped * total;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    if (from === undefined || to === undefined) break;
    const length = from.distanceTo(to);
    if (left <= length || index === points.length - 1) {
      slide(object, from, to, length === 0 ? 1 : Math.min(1, left / length));
      break;
    }
    left -= length;
  }
  object.position.y += Math.sin(clamped * Math.PI) * hop;
}

/** A beat's run that, on reset, clears the stage and puts the moved parts back. */
function run(
  stage: Stage,
  moved: readonly THREE.Mesh[],
  frame: (progress: number) => void,
): ReturnType<Beat['start']> {
  const restores = moved.map(remember);
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

function rackAt(parts: ServerParts, index: number): THREE.Mesh {
  const rack = parts.racks[index];
  if (rack === undefined) throw new Error(`The servers island has no rack ${String(index)}.`);
  return rack;
}

function act6Beats(
  stage: Stage,
  parts: ServerParts,
  colors: Palette,
): Record<BeatId<'act6'>, Beat> {
  /** A packet added to the stage, hidden until its beat pops it in. */
  const packet = (material: THREE.Material, geometry: THREE.BufferGeometry = PACKET) => {
    const mesh = part(geometry, material, CLIENT.x, CLIENT.y, CLIENT.z);
    mesh.visible = false;
    stage.add(mesh);
    return mesh;
  };
  const answering = rackAt(parts, 3);
  const worker = rackAt(parts, 1);
  const { screen } = parts;
  /** The middle drum always glows; the outer two light up while the database reads. */
  const readingDrums = parts.drums.filter((_, index) => index !== 1);
  /** The gate that checks who's asking, across the path to the racks, hidden until popped in. */
  const gate = () => {
    const group = new THREE.Group();
    const bar = part(GATE_BAR, colors.base, 0, 2.4, 0);
    group.add(
      part(GATE_POST, colors.light, -0.8, 1.2, 0),
      part(GATE_POST, colors.light, 0.8, 1.2, 0),
      bar,
    );
    group.position.copy(GATE);
    group.visible = false;
    stage.add(group);
    return { group, bar };
  };
  /** A request carrying its session's pass, hidden at the writer's screen until popped in. */
  const passHolder = () => {
    const body = part(PACKET, colors.glow, 0, 0, 0);
    const holder = new THREE.Group();
    holder.add(body, part(PASS, colors.light, 0, PASS_HEIGHT, 0));
    holder.position.copy(CLIENT);
    holder.visible = false;
    stage.add(holder);
    return { holder, body };
  };

  return {
    // A request leaves the writer's screen, the server works on it, and a response comes
    // back: the screen lights up with the answer.
    'request-response': {
      seconds: 2.4,
      start: () => {
        const request = packet(colors.glow);
        const response = packet(colors.light);
        return run(stage, [answering, screen], (progress) => {
          popIn(request, phase(progress, 0, 0.08) - phase(progress, 0.4, 0.48));
          travel(request, TO_RACK, phase(progress, 0.05, 0.4), 0.5);
          // A busy server glows, as the drums do while they read. Swapping to the slightly
          // lighter base colour didn't show from the camera against the dark racks.
          answering.material = progress >= 0.4 && progress < 0.6 ? colors.glow : colors.dark;
          popIn(response, phase(progress, 0.5, 0.58));
          travel(response, FROM_RACK, phase(progress, 0.55, 0.9), 0.5);
          screen.material = progress >= 0.9 ? colors.glow : colors.light;
        });
      },
    },
    // A gate checks who's asking. A request with no pass is turned back red (401) and
    // left lying on the writer's side; one carrying its session's pass lights the gate up
    // and goes through to the server. The held picture keeps both outcomes side by side.
    'auth-gate': {
      seconds: 2.8,
      start: () => {
        const { group: checkpoint, bar } = gate();
        const stranger = packet(colors.glow);
        const { holder: member } = passHolder();
        return run(stage, [], (progress) => {
          popIn(checkpoint, phase(progress, 0, 0.15));
          popIn(stranger, phase(progress, 0.08, 0.15));
          const turnedBack = progress >= 0.35;
          stranger.material = turnedBack ? colors.alert : colors.glow;
          if (turnedBack) {
            travel(stranger, TURNED_BACK, phase(progress, 0.38, 0.55), 0.5);
          } else {
            travel(stranger, TO_GATE, phase(progress, 0.1, 0.33));
          }
          popIn(member, phase(progress, 0.55, 0.62));
          travel(member, TO_RACK, phase(progress, 0.6, 0.95));
          const refusing = progress >= 0.33 && progress < 0.58;
          const letIn = progress >= 0.68;
          bar.material = refusing ? colors.alert : letIn ? colors.glow : colors.base;
        });
      },
    },
    // The server asks the database: a query runs down the pipe, the drums light up while
    // it reads, and the rows come back up and out to the writer as the response.
    'database-query': {
      seconds: 3,
      start: () => {
        const request = packet(colors.glow);
        const query = packet(colors.glow, SMALL_PACKET);
        const rows = packet(colors.light, SMALL_PACKET);
        const response = packet(colors.light);
        return run(stage, [screen, ...readingDrums], (progress) => {
          popIn(request, phase(progress, 0, 0.05) - phase(progress, 0.22, 0.27));
          travel(request, TO_RACK, phase(progress, 0, 0.22), 0.4);
          popIn(query, phase(progress, 0.24, 0.3) - phase(progress, 0.5, 0.55));
          travel(query, TO_DATABASE, phase(progress, 0.25, 0.5));
          const reading = progress >= 0.5 && progress < 0.65;
          readingDrums.forEach((drum) => {
            drum.material = reading ? colors.glow : colors.light;
          });
          popIn(rows, phase(progress, 0.6, 0.65) - phase(progress, 0.8, 0.84));
          travel(rows, FROM_DATABASE, phase(progress, 0.62, 0.8));
          popIn(response, phase(progress, 0.8, 0.85));
          travel(response, FROM_RACK, phase(progress, 0.82, 0.98), 0.4);
          screen.material = progress >= 0.98 ? colors.glow : colors.light;
        });
      },
    },
    // The first read pays the slow trip: the database reads (its drums light up) and a copy
    // is kept in a cache box by the rack. The next request is answered from that copy,
    // through the server, while the database stays dark: a hit never touches it.
    'cache-hit': {
      seconds: 3,
      start: () => {
        const query = packet(colors.glow, SMALL_PACKET);
        const cache = part(CACHE_BOX, colors.glow, CACHE_SPOT.x, CACHE_SPOT.y, CACHE_SPOT.z);
        cache.visible = false;
        stage.add(cache);
        const request = packet(colors.glow);
        const response = packet(colors.light);
        return run(stage, [screen, ...readingDrums], (progress) => {
          popIn(query, phase(progress, 0, 0.04) - phase(progress, 0.38, 0.42));
          // Out to the database, a pause while it reads, then back with the answer.
          const answered = progress >= 0.24;
          if (answered) travel(query, FROM_DATABASE, phase(progress, 0.24, 0.4));
          else travel(query, TO_DATABASE, phase(progress, 0, 0.16));
          query.material = answered ? colors.light : colors.glow;
          const reading = progress >= 0.16 && progress < 0.26;
          readingDrums.forEach((drum) => {
            drum.material = reading ? colors.glow : colors.light;
          });
          popIn(cache, phase(progress, 0.38, 0.5));
          popIn(request, phase(progress, 0.5, 0.55) - phase(progress, 0.72, 0.76));
          travel(request, TO_CACHE, phase(progress, 0.5, 0.74));
          const hit = progress >= 0.72 && progress < 0.82;
          cache.material = hit ? colors.light : colors.glow;
          popIn(response, phase(progress, 0.76, 0.8));
          travel(response, FROM_CACHE, phase(progress, 0.78, 0.95), 0.6);
          screen.material = progress >= 0.95 ? colors.glow : colors.light;
        });
      },
    },
    // Slow work leaves the request: the server drops each export onto a belt as a job and
    // the screen hears back at once, then a worker server takes the jobs one at a time at
    // its own pace. It ends mid-work: one job done, one in the worker, one still waiting.
    'queue-worker': {
      seconds: 3,
      start: () => {
        const belt = part(BELT, colors.base, 0.2, 0.05, 0.9);
        belt.visible = false;
        stage.add(belt);
        const jobs = QUEUE_PATHS.map(() => packet(colors.glow));
        return run(stage, [worker, screen], (progress) => {
          popIn(belt, phase(progress, 0, 0.1));
          jobs.forEach((job, index) => {
            const paths = QUEUE_PATHS[index];
            if (paths === undefined) return;
            const turn = JOB_TURNS[index];
            if (turn === undefined || progress < turn.takenAt) {
              const queuedAt = 0.04 + index * 0.08;
              popIn(job, phase(progress, queuedAt, queuedAt + 0.06), 0.8);
              travel(job, paths.toSlot, phase(progress, queuedAt, queuedAt + 0.16), 0.5);
              return;
            }
            // Off the belt to the worker's door, then into the worker. Left at the door, it
            // was lost in the glow of the busy worker behind it.
            const arrived = turn.takenAt + TO_WORKER_TIME;
            popIn(job, 1 - phase(progress, arrived, arrived + INTO_WORKER_TIME), 0.8);
            travel(job, paths.toWorker, phase(progress, turn.takenAt, arrived), 0.4);
          });
          // The worker glows while it has a job inside, and goes dark between jobs.
          const working = JOB_TURNS.some(
            (turn) => progress >= turn.takenAt + TO_WORKER_TIME && progress < turn.doneAt,
          );
          worker.material = working ? colors.glow : colors.dark;
          screen.material = progress >= 0.2 ? colors.glow : colors.light;
        });
      },
    },
    // The log writes itself line by line; one line is red. A marker points at it and the
    // rest dims: the system already wrote down what went wrong.
    'log-trail': {
      seconds: 2.6,
      start: () => {
        const lines = LOG_WIDTHS.map((width, index) => {
          const line = part(
            LOG_LINE,
            index === ERROR_LINE ? colors.alert : colors.light,
            // Left-aligned like text: a shorter line keeps its left edge.
            LOG_X - (1 - width) * 0.9,
            LOG_BASE_Y + index * LOG_STEP,
            LOG_Z,
          );
          line.visible = false;
          return line;
        });
        const errorY = LOG_BASE_Y + ERROR_LINE * LOG_STEP;
        // The marker slides in from the left and stops with its tip at the lines' left edge.
        const markerFrom = point(LOG_X - 1.9, errorY, LOG_Z);
        const markerTo = point(LOG_X - 1.2, errorY, LOG_Z);
        const marker = part(MARKER, colors.light, markerFrom.x, errorY, LOG_Z);
        // The cone points along +x, at the line.
        marker.rotation.z = -Math.PI / 2;
        marker.visible = false;
        stage.add(...lines, marker);
        return run(stage, [], (progress) => {
          const focused = progress >= 0.72;
          lines.forEach((line, index) => {
            const start = index * 0.06;
            popIn(line, phase(progress, start, start + 0.12));
            line.scale.x *= LOG_WIDTHS[index] ?? 1;
            // Dimmed to the pipe's grey-blue, not near-black, so the rest still reads as text.
            if (index !== ERROR_LINE) line.material = focused ? colors.base : colors.light;
          });
          popIn(marker, phase(progress, 0.55, 0.7));
          slide(marker, markerFrom, markerTo, phase(progress, 0.55, 0.8));
        });
      },
    },
    // The server borrows a database connection (a ring from the tray) for each request and
    // should hand it back. One ring makes that round trip. Then rings go out and never come
    // back, the tray runs empty and turns red, and the next request waits at the rack with
    // no connection to use until it times out red.
    'connections-run-out': {
      seconds: 3,
      start: () => {
        const tray = part(TRAY, colors.base, TRAY_SPOT.x, TRAY_SPOT.y, TRAY_SPOT.z);
        tray.visible = false;
        const rings = POOL_SLOTS.map((slot) => {
          const ring = part(RING, colors.light, slot.x, slot.y, slot.z);
          ring.visible = false;
          return ring;
        });
        stage.add(tray, ...rings);
        const request = packet(colors.glow);
        return run(stage, [screen], (progress) => {
          const shown = phase(progress, 0, 0.08);
          popIn(tray, shown);
          rings.forEach((ring, index) => {
            const slot = POOL_SLOTS[index] ?? TRAY_SPOT;
            const spot = IN_USE_SPOTS[index] ?? TRAY_SPOT;
            // The first ring shows the healthy way once: out to the database and back.
            const returned =
              index === 0 ? phase(progress, 0.1, 0.18) - phase(progress, 0.22, 0.3) : 0;
            const leakedAt = LEAK_START + index * LEAK_GAP;
            const out = returned + phase(progress, leakedAt, leakedAt + LEAK_GAP);
            popIn(ring, shown);
            slide(ring, slot, spot, out, 0.7);
            ring.material = out > 0 ? colors.glow : colors.light;
          });
          tray.material = progress >= POOL_EMPTY_AT ? colors.alert : colors.base;
          popIn(request, phase(progress, 0.62, 0.68));
          travel(request, TO_RACK, phase(progress, 0.62, 0.76), 0.5);
          // It fidgets at the rack while it waits for a ring that never comes.
          const waiting = progress >= 0.76 && progress < 0.92;
          if (waiting) request.position.x += Math.sin(progress * 120) * 0.05;
          request.material = progress >= 0.92 ? colors.alert : colors.glow;
          screen.material = progress >= 0.95 ? colors.alert : colors.light;
        });
      },
    },
    // A bad release breaks things: every light turns red and the writer's screen errors.
    // The release is lifted off and set aside, still red, the last good one goes back on,
    // and the lights recover: service is back, and the broken version waits for a fix.
    'incident-rollback': {
      seconds: 3,
      start: () => {
        const bad = part(CRATE, colors.alert, CRATE_SPOT.x, CRATE_SPOT.y, CRATE_SPOT.z);
        const good = part(CRATE, colors.light, CRATE_SPOT.x, CRATE_SPOT.y, CRATE_SPOT.z);
        good.visible = false;
        stage.add(bad, good);
        // On the floor in the gap in front of the middle and answering racks.
        const setAside = point(1, 0.25, 0.3);
        const comesFrom = point(-1.6, 4.2, -2);
        const { blinkers } = parts;
        return run(stage, [...blinkers, screen], (progress) => {
          slide(bad, CRATE_SPOT, setAside, phase(progress, 0.35, 0.58), 1.2);
          popIn(good, phase(progress, 0.5, 0.6));
          slide(good, comesFrom, CRATE_SPOT, phase(progress, 0.5, 0.72));
          blinkers.forEach((light, index) => {
            const share = index / blinkers.length;
            const broken = progress >= 0.25 * share && progress < 0.74 + 0.24 * share;
            light.material = broken ? colors.alert : colors.glow;
          });
          screen.material = progress >= 0.12 && progress < 0.8 ? colors.alert : colors.light;
        });
      },
    },
  };
}

/** Act 6: racks of servers joined by pipes, a database drum, and a writer's screen. */
export function servers(colors: Palette): Props {
  const group = new THREE.Group();
  const racks: THREE.Mesh[] = [];
  const blinkers: THREE.Mesh[] = [];
  [-4, -2, 0, 2].forEach((x) => {
    const rack = part(RACK, colors.dark, x, 1.3, -2);
    racks.push(rack);
    group.add(rack);
    for (let level = 0; level < 5; level++) {
      const light = part(STRIP, colors.glow, x, 0.5 + level * 0.45, -1.49);
      blinkers.push(light);
      group.add(light);
    }
  });
  // The pipe runs along the racks' feet to the database.
  const pipe = part(PIPE, colors.base, 0.5, 0.2, -0.8);
  pipe.rotation.z = Math.PI / 2;
  group.add(pipe);
  const drop = part(PIPE_DROP, colors.base, 5, 0.2, 0.2);
  drop.rotation.x = Math.PI / 2;
  group.add(drop);
  const drums = [0, 1, 2].map((level) => {
    const drum = part(DRUM, level === 1 ? colors.glow : colors.light, 5, 0.3 + level * 0.6, 1.8);
    group.add(drum);
    return drum;
  });
  // The writer's screen out front: where requests start and responses land.
  const screen = part(SCREEN, colors.light, CLIENT.x, 1.1, CLIENT.z + 0.6);
  group.add(
    screen,
    part(STAND, colors.base, CLIENT.x, 0.35, CLIENT.z + 0.55),
    part(FOOT, colors.base, CLIENT.x, 0.03, CLIENT.z + 0.55),
  );
  const stage = createStage(group);
  return {
    group,
    animate: (elapsed) => {
      blinkers.forEach((light, index) => {
        light.visible = Math.sin(elapsed * 3 + index * 1.7) > -0.4;
      });
    },
    beats: act6Beats(stage, { racks, blinkers, drums, screen }, colors),
  };
}
