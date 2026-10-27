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
 * Act 4's island: a town square. The notice board in the middle is GitHub, the copy the
 * whole team shares; the houses around it are teammates (Marco's, Dex's, Otto's and
 * Priya's, left to right); the laptop at the front is yours. Its beats act out the team
 * flow on those props: work travels from your laptop to the board only when pushed, issues
 * get pinned, pull requests walk up to the board, wait at a gate for checks and an
 * approval, and releases get a flag.
 */

const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The houses stand on a ring around the square, at these angles from straight back. */
const HOUSE_ANGLES = [-0.9, -0.3, 0.3, 0.9];
const HOUSE_RING = 8;
/** A spot in front of a house, toward the square, where things arrive and leave. */
function doorstep(angle: number, y = 0.9): THREE.Vector3 {
  const radius = 6.2;
  return at(Math.sin(angle) * radius, y, -Math.cos(angle) * radius);
}
const MARCO_DOOR = doorstep(-0.9);
const DEX_DOOR = doorstep(-0.3);
const OTTO_DOOR = doorstep(0.3);
const PRIYA_DOOR = doorstep(0.9);
const PRIYA_ROOF = at(Math.sin(0.9) * HOUSE_RING, 2.3, -Math.cos(0.9) * HOUSE_RING);

/** Where your work sits before it's pushed: on the laptop at the front of the square. */
const LAPTOP = at(-2.4, 0.75, 2.6);
/**
 * Where new work on main lands, pushed or merged: the empty middle of the board's bottom
 * row. Kept clear of notices so a card landing there reads as new rather than blending in.
 */
const BOARD_FRONT = at(0, 1.33, -1.3);
/** The top-right card on the board, the one beats treat as "the issue". */
const ISSUE_SLOT = at(0.98, 1.95, -1.43);
/** Where an open pull request stands in the square, waiting to be read. */
const PR_SPOT = at(1.7, 1, 0.8);
/** A merged PR shrinks to a notice's size: once on the board it's one more card of main. */
const MERGED_SCALE = 0.7;
/** The board's top edge, where a release's number stands. */
const BOARD_TOP = 2.35;
const BOARD_Z = -1.5;

// Shared geometry, made once: beats reuse it and the palette's materials, so clearing
// the stage after a beat has nothing to dispose.
const NOTICE = new THREE.BoxGeometry(0.55, 0.4, 0.04);
const COMMIT_HEIGHT = 0.32;
const COMMIT_CARD = new THREE.BoxGeometry(0.45, COMMIT_HEIGHT, 0.05);
const PR_CARD = new THREE.BoxGeometry(0.8, 0.55, 0.06);
const PIN = new THREE.SphereGeometry(0.08, 10, 8);
const COMMENT = new THREE.SphereGeometry(0.18, 14, 10);
const GATE_POST = new THREE.BoxGeometry(0.12, 1.4, 0.12);
const GATE_BAR = new THREE.BoxGeometry(1.5, 0.12, 0.12);
const LAMP = new THREE.SphereGeometry(0.14, 12, 10);
const FLAG_POLE_HEIGHT = 2;
const FLAG_POLE = new THREE.CylinderGeometry(0.05, 0.05, FLAG_POLE_HEIGHT, 8);
const FLAG = new THREE.BoxGeometry(0.7, 0.42, 0.04);
const VERSION_BLOCK = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const DESK = new THREE.BoxGeometry(0.9, 0.3, 0.6);
const SCREEN = new THREE.BoxGeometry(0.8, 0.5, 0.05);

/** The idle props that beats change and must put back. */
interface TownParts {
  readonly issueCard: THREE.Mesh;
}

/** A gate across a path: two posts, a barrier that blocks, and a lamp on each post. */
interface Gate {
  readonly group: THREE.Group;
  /** The barrier's hinge: turn it to swing the bar up. */
  readonly boom: THREE.Group;
  readonly bar: THREE.Mesh;
  /** Lights when the checks pass. */
  readonly checksLamp: THREE.Mesh;
  /** Lights when a reviewer approves. */
  readonly approvalLamp: THREE.Mesh;
}

const BAR_HEIGHT = 1.15;
const LAMP_OFFSET = 0.75;
const LAMP_HEIGHT = 1.5;
/** The bar hangs this far in front of the posts, so it swings up clear of the lamp. */
const BAR_FRONT = -0.22;

/**
 * A gate halfway along a path, turned to stand across it. Turned by the path's direction
 * alone, not lookAt, which would aim in world space and this island floats far away.
 */
function gateAcross(from: THREE.Vector3, to: THREE.Vector3, colors: Palette): Gate {
  const group = new THREE.Group();
  const middle = new THREE.Vector3().lerpVectors(from, to, 0.5);
  group.position.set(middle.x, 0.1, middle.z);
  group.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
  // Hinged at one post like a car park barrier: opening swings it upright beside the path,
  // where it hides nothing, rather than lifting it across the board behind.
  const boom = new THREE.Group();
  boom.position.set(-LAMP_OFFSET, BAR_HEIGHT, BAR_FRONT);
  const bar = part(GATE_BAR, colors.alert, LAMP_OFFSET, 0, 0);
  boom.add(bar);
  const checksLamp = part(LAMP, colors.dark, -LAMP_OFFSET, LAMP_HEIGHT, 0);
  const approvalLamp = part(LAMP, colors.dark, LAMP_OFFSET, LAMP_HEIGHT, 0);
  group.add(
    part(GATE_POST, colors.dark, -LAMP_OFFSET, 0.7, 0),
    part(GATE_POST, colors.dark, LAMP_OFFSET, 0.7, 0),
    boom,
    checksLamp,
    approvalLamp,
  );
  group.visible = false;
  return { group, boom, bar, checksLamp, approvalLamp };
}

/** Where a gate's approval lamp stands in the island's space, for things to fly to it. */
function approvalLampSpot(gate: Gate): THREE.Vector3 {
  return gate.approvalLamp.position
    .clone()
    .applyEuler(gate.group.rotation)
    .add(gate.group.position);
}

/** A beat's run that, on reset, clears the stage and puts the changed props back. */
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

function act4Beats(stage: Stage, parts: TownParts, colors: Palette): Record<BeatId<'act4'>, Beat> {
  /** A hidden mesh on the stage, at a point, for a beat to pop in and move. */
  const piece = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    point: THREE.Vector3,
  ) => {
    const mesh = part(geometry, material, point.x, point.y, point.z);
    mesh.visible = false;
    stage.add(mesh);
    return mesh;
  };
  const gate = (from: THREE.Vector3, to: THREE.Vector3) => {
    const built = gateAcross(from, to, colors);
    stage.add(built.group);
    return built;
  };

  return {
    // Your commit sits on the laptop (committed, still only yours). A push sends a copy to
    // the board, and only then can a teammate copy it home (a fetch): the copies sync only
    // when someone says so. Every copy stays put, the laptop's too, because pushing and
    // fetching copy commits rather than move them.
    'sync-origin': {
      seconds: 2.8,
      start: () => {
        const local = piece(COMMIT_CARD, colors.glow, LAPTOP);
        const pushed = piece(COMMIT_CARD, colors.glow, LAPTOP);
        const fetched = piece(COMMIT_CARD, colors.glow, BOARD_FRONT);
        return run(stage, [], (progress) => {
          popIn(local, phase(progress, 0, 0.12));
          popIn(pushed, phase(progress, 0.2, 0.28));
          slide(pushed, LAPTOP, BOARD_FRONT, phase(progress, 0.22, 0.5), 1.5);
          popIn(fetched, phase(progress, 0.5, 0.58));
          slide(fetched, BOARD_FRONT, PRIYA_DOOR, phase(progress, 0.55, 0.95), 1.5);
        });
      },
    },
    // Dex's commit reaches the board first. Yours flies up after it, bumps into the newer
    // copy, turns red and drops home: git refuses a push that would bury a teammate's work
    // until you bring theirs in.
    'push-behind': {
      seconds: 2.8,
      start: () => {
        const theirs = piece(COMMIT_CARD, colors.light, DEX_DOOR);
        const yours = piece(COMMIT_CARD, colors.glow, LAPTOP);
        const bump = new THREE.Vector3().lerpVectors(LAPTOP, BOARD_FRONT, 0.8);
        return run(stage, [], (progress) => {
          popIn(theirs, phase(progress, 0, 0.1));
          slide(theirs, DEX_DOOR, BOARD_FRONT, phase(progress, 0.05, 0.35), 1.2);
          popIn(yours, phase(progress, 0, 0.1));
          if (progress < 0.7) slide(yours, LAPTOP, bump, phase(progress, 0.4, 0.62), 0.8);
          else slide(yours, bump, LAPTOP, phase(progress, 0.7, 1), 0.4);
          yours.material = progress >= 0.62 ? colors.alert : colors.glow;
        });
      },
    },
    // A push straight to main meets a closed gate: protection lets only pull requests in.
    // The commit stops short, turns red, and drops back to the laptop. It's still yours;
    // nothing on the board changed.
    'main-protected': {
      seconds: 2.6,
      start: () => {
        const card = piece(COMMIT_CARD, colors.glow, LAPTOP);
        const blocked = gate(LAPTOP, BOARD_FRONT);
        const stop = new THREE.Vector3().lerpVectors(LAPTOP, BOARD_FRONT, 0.42);
        return run(stage, [], (progress) => {
          popIn(blocked.group, phase(progress, 0, 0.2));
          popIn(card, phase(progress, 0, 0.12));
          if (progress < 0.6) slide(card, LAPTOP, stop, phase(progress, 0.1, 0.45), 0.6);
          else slide(card, stop, LAPTOP, phase(progress, 0.6, 1), 0.4);
          card.material = progress >= 0.45 ? colors.alert : colors.glow;
        });
      },
    },
    // Marco's request flies from his house to an empty spot on the board and gets a red
    // pin: the work is written down where everyone can see it before anyone starts it.
    'issue-pinned': {
      seconds: 2.4,
      start: () => {
        const slot = at(ISSUE_SLOT.x, ISSUE_SLOT.y, ISSUE_SLOT.z + 0.03);
        const issue = piece(NOTICE, colors.glow, MARCO_DOOR);
        issue.rotation.z = parts.issueCard.rotation.z;
        // On the card's top edge, so the red shows against the dark board, not the glow.
        const pin = piece(PIN, colors.alert, at(slot.x, slot.y + 0.2, slot.z + 0.06));
        return run(stage, [parts.issueCard], (progress) => {
          // The slot starts empty, so the new issue reads as new rather than as a card
          // that was always there.
          parts.issueCard.visible = false;
          popIn(issue, phase(progress, 0, 0.15));
          slide(issue, MARCO_DOOR, slot, phase(progress, 0.1, 0.65), 1.6);
          popIn(pin, phase(progress, 0.65, 0.9), 2);
        });
      },
    },
    // A pull request walks from Otto's house to the square, and a thread links it to the
    // issue it answers.
    'pr-opened': {
      seconds: 2.6,
      start: () => {
        const request = piece(PR_CARD, colors.light, OTTO_DOOR);
        const top = at(PR_SPOT.x, PR_SPOT.y + 0.3, PR_SPOT.z);
        const thread = segment(
          top,
          at(ISSUE_SLOT.x, ISSUE_SLOT.y, ISSUE_SLOT.z + 0.06),
          colors.glow,
        );
        thread.grow(0);
        stage.add(thread.mesh);
        return run(stage, [], (progress) => {
          popIn(request, phase(progress, 0, 0.15));
          slide(request, OTTO_DOOR, PR_SPOT, phase(progress, 0.1, 0.6), 1.2);
          thread.grow(phase(progress, 0.6, 0.95));
        });
      },
    },
    // Priya's review comment flies over and the PR turns red (changes requested); Otto's
    // fix follows, the comment is resolved, and the PR glows again. Reviewing is a loop,
    // not a stamp.
    'review-changes': {
      seconds: 3,
      start: () => {
        const request = piece(PR_CARD, colors.light, PR_SPOT);
        const besideCard = at(PR_SPOT.x + 0.55, PR_SPOT.y + 0.35, PR_SPOT.z + 0.1);
        const comment = piece(COMMENT, colors.alert, PRIYA_ROOF);
        const fix = piece(COMMENT, colors.glow, OTTO_DOOR);
        return run(stage, [], (progress) => {
          popIn(request, phase(progress, 0, 0.12));
          popIn(
            comment,
            progress < 0.85 ? phase(progress, 0.08, 0.2) : 1 - phase(progress, 0.85, 0.95),
          );
          slide(comment, PRIYA_ROOF, besideCard, phase(progress, 0.1, 0.42), 1.5);
          // The fix is absorbed into the PR when it lands, so it's only seen in flight.
          popIn(fix, progress < 0.85 ? phase(progress, 0.55, 0.62) : 0, 0.8);
          slide(fix, OTTO_DOOR, PR_SPOT, phase(progress, 0.55, 0.85), 1.5);
          const changesRequested = progress >= 0.42 && progress < 0.85;
          request.material = changesRequested
            ? colors.alert
            : progress >= 0.85
              ? colors.glow
              : colors.light;
        });
      },
    },
    // The PR waits at main's gate. One lamp lights for passing checks; Priya's approval
    // flies over from her house to light the other. Only then the barrier swings up, the
    // PR joins the board, and the issue it closes greys out.
    'checks-gate': {
      seconds: 3,
      start: () => {
        const request = piece(PR_CARD, colors.light, PR_SPOT);
        const guard = gate(PR_SPOT, BOARD_FRONT);
        const lampSpot = approvalLampSpot(guard);
        const approval = piece(COMMENT, colors.glow, PRIYA_ROOF);
        return run(stage, [parts.issueCard], (progress) => {
          popIn(request, phase(progress, 0, 0.12));
          popIn(guard.group, phase(progress, 0, 0.18));
          guard.checksLamp.material = progress >= 0.25 ? colors.glow : colors.dark;
          // The approval is absorbed into its lamp when it lands, so it's only seen in flight.
          popIn(approval, progress < 0.5 ? phase(progress, 0.25, 0.32) : 0, 0.8);
          slide(approval, PRIYA_ROOF, lampSpot, phase(progress, 0.28, 0.5), 1.2);
          guard.approvalLamp.material = progress >= 0.5 ? colors.glow : colors.dark;
          const lift = phase(progress, 0.52, 0.65);
          guard.boom.rotation.z = (Math.PI / 2) * lift;
          guard.bar.material = lift > 0 ? colors.glow : colors.alert;
          const merge = phase(progress, 0.65, 0.9);
          slide(request, PR_SPOT, BOARD_FRONT, merge, 0.3);
          // After popIn has set its size, so the shrink isn't overwritten.
          request.scale.multiplyScalar(1 - (1 - MERGED_SCALE) * merge);
          request.material = progress >= 0.9 ? colors.glow : colors.light;
          // Muted, not dark: a dark card would vanish into the board instead of reading closed.
          parts.issueCard.material = progress >= 0.95 ? colors.base : colors.glow;
        });
      },
    },
    // A release: the commit that ships sits on main, MAJOR, MINOR and PATCH are set block by
    // block on top of the board, then a flag goes up on that one commit and stays. A tag
    // names one exact commit for good, so the flag stands on a card, not over the whole
    // board. No block is singled out, so the picture fits whichever number a card bumps.
    'release-tag': {
      seconds: 2.6,
      start: () => {
        const shipped = piece(COMMIT_CARD, colors.glow, BOARD_FRONT);
        // The mast's origin is the foot of its pole, on the commit's top edge, so it grows
        // up out of that card rather than in from the middle of the pole.
        const mast = new THREE.Group();
        mast.position.set(BOARD_FRONT.x, BOARD_FRONT.y + COMMIT_HEIGHT / 2, BOARD_FRONT.z);
        mast.add(part(FLAG_POLE, colors.light, 0, FLAG_POLE_HEIGHT / 2, 0));
        const flagLow = at(0.4, 0.5, 0);
        const flagHigh = at(0.4, FLAG_POLE_HEIGHT - 0.25, 0);
        const flag = part(FLAG, colors.glow, flagLow.x, flagLow.y, flagLow.z);
        mast.add(flag);
        mast.visible = false;
        stage.add(mast);
        // Left of the pole, so the number reads as the name on that flag.
        const versionBlock = (x: number) =>
          piece(VERSION_BLOCK, colors.light, at(x, BOARD_TOP + 0.15, BOARD_Z));
        const major = versionBlock(-0.95);
        const minor = versionBlock(-0.6);
        const patch = versionBlock(-0.25);
        return run(stage, [], (progress) => {
          popIn(shipped, phase(progress, 0, 0.15));
          popIn(major, phase(progress, 0.1, 0.28));
          popIn(minor, phase(progress, 0.18, 0.36));
          popIn(patch, phase(progress, 0.26, 0.44));
          popIn(mast, phase(progress, 0.4, 0.55));
          slide(flag, flagLow, flagHigh, phase(progress, 0.5, 0.95));
        });
      },
    },
  };
}

/** Act 4: a town square with a notice board of issues, and houses for the team around it. */
export function town(colors: Palette): Props {
  const group = new THREE.Group();
  group.add(part(new THREE.CylinderGeometry(4, 4, 0.1, 48), colors.base, 0, 0.05, 0));
  // The notice board: two posts, a board, and coloured cards pinned on it.
  const post = new THREE.BoxGeometry(0.15, 2.2, 0.15);
  group.add(part(post, colors.dark, -1.3, 1.1, -1.5), part(post, colors.dark, 1.3, 1.1, -1.5));
  group.add(part(new THREE.BoxGeometry(2.9, 1.5, 0.1), colors.dark, 0, 1.6, -1.5));
  const cards: THREE.Mesh[] = [];
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 4; column++) {
      // The bottom row's middle stays empty: beats land new work on main there.
      if (row === 1 && (column === 1 || column === 2)) continue;
      const material = (row + column) % 3 === 0 ? colors.glow : colors.light;
      const mesh = part(NOTICE, material, -1 + column * 0.66, 1.95 - row * 0.62, -1.43);
      mesh.rotation.z = ((row * 4 + column) % 3) * 0.05 - 0.05;
      cards.push(mesh);
      group.add(mesh);
    }
  }
  // Your laptop at the front of the square: where work lives until it's pushed.
  const screen = part(SCREEN, colors.light, LAPTOP.x, 0.65, LAPTOP.z - 0.25);
  screen.rotation.x = -0.25;
  group.add(part(DESK, colors.dark, LAPTOP.x, 0.25, LAPTOP.z), screen);
  // The houses around the square, one per teammate.
  const body = new THREE.BoxGeometry(1.6, 1.3, 1.6);
  const roof = new THREE.ConeGeometry(1.3, 0.9, 4);
  HOUSE_ANGLES.forEach((angle) => {
    const x = Math.sin(angle) * HOUSE_RING;
    const z = -Math.cos(angle) * HOUSE_RING;
    const house = new THREE.Group();
    house.add(part(body, colors.base, 0, 0.65, 0));
    const top = part(roof, colors.glow, 0, 1.75, 0);
    top.rotation.y = Math.PI / 4;
    house.add(top);
    house.position.set(x, 0, z);
    // Turned toward the square by its angle on the ring (lookAt would aim in world space).
    house.rotation.y = -angle;
    group.add(house);
  });
  const issueCard = cards[3];
  if (!issueCard) throw new Error('The town island lost the card its beats call the issue.');
  const stage = createStage(group);
  return {
    group,
    animate: (elapsed) => {
      const lit = Math.floor(elapsed) % cards.length;
      cards.forEach((mesh, index) => {
        mesh.scale.setScalar(index === lit ? 1.12 : 1);
      });
    },
    beats: act4Beats(stage, { issueCard }, colors),
  };
}
