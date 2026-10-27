import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createBeatPlayer } from '../beatPlayer';
import { ISLAND_BEATS, type BeatId } from '../beats';
import { actIsland } from '../zones';
import { palette, type Palette, type Props } from './kit';
import { workshop } from './workshop';

/*
 * Act 7's island plays every beat it lists and puts itself back afterwards. A beat that
 * left a mesh behind, or a recoloured visor, would show on the next card's scene. Each
 * beat also has to end on the picture its cards teach: the held frame is what Kyle looks
 * at while he reads, so a wrong one teaches the wrong idea.
 */

/** Every mesh's place, size, turn, visibility and material: what a reset must restore. */
function snapshot(group: THREE.Group): string[] {
  const looks: string[] = [];
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material as THREE.Material;
    looks.push(
      [
        object.position.toArray().join(','),
        object.scale.toArray().join(','),
        object.rotation.toArray().join(','),
        String(object.visible),
        material.uuid,
      ].join('|'),
    );
  });
  return looks;
}

describe('the Act 7 workshop island', () => {
  it('has every beat beats.ts lists for act7, and no others', () => {
    const props = workshop(palette(0x66ccff));
    expect(Object.keys(props.beats).sort()).toEqual([...ISLAND_BEATS.act7].sort());
  });

  it('plays each beat start to finish, then resets to its idle look', () => {
    const props = workshop(palette(0x66ccff));
    const idle = snapshot(props.group);
    for (const [id, beat] of Object.entries(props.beats)) {
      expect(beat.seconds, id).toBeGreaterThanOrEqual(1.5);
      expect(beat.seconds, id).toBeLessThanOrEqual(3);
      const played = beat.start();
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) played.frame(progress);
      expect(snapshot(props.group), id).not.toEqual(idle);
      played.reset();
      expect(snapshot(props.group), id).toEqual(idle);
    }
  });

  it('draws the same last frame however it got there', () => {
    // Reduced motion jumps straight to frame 1, so the held picture can't depend on the
    // frames before it.
    const props = workshop(palette(0x66ccff));
    for (const [id, beat] of Object.entries(props.beats)) {
      const jumped = beat.start();
      jumped.frame(1);
      const direct = snapshot(props.group);
      jumped.reset();
      const played = beat.start();
      for (const progress of [0, 0.3, 0.6, 0.9, 1]) played.frame(progress);
      // Beats reuse the palette's materials, so even the material ids match.
      expect(snapshot(props.group), id).toEqual(direct);
      played.reset();
    }
  });

  it('goes back to idle when the next card cuts a beat off, and when the lesson ends', () => {
    const props: Props = workshop(palette(0x66ccff));
    const idle = snapshot(props.group);
    const player = createBeatPlayer(props.beats, false);
    let clock = 0;
    for (const id of ISLAND_BEATS.act7) {
      const seconds = props.beats[id]?.seconds ?? 0;
      player.play(id);
      // The first update starts the beat's clock; the second is halfway through it. Then
      // the loop plays the next card's beat over it.
      player.update(clock);
      player.update(clock + seconds / 2);
      expect(player.current()).toBe(id);
      clock += seconds;
    }
    player.play(null);
    expect(player.current()).toBeNull();
    expect(snapshot(props.group)).toEqual(idle);
  });

  it('shows the held picture at once with reduced motion', () => {
    const props: Props = workshop(palette(0x66ccff));
    const idle = snapshot(props.group);
    const player = createBeatPlayer(props.beats, true);
    for (const id of ISLAND_BEATS.act7) {
      const beat = props.beats[id];
      if (beat === undefined) throw new Error(`The workshop has no ${id} beat.`);
      // The player's last beat is still held; end it so the picture below is this beat's alone.
      player.play(null);
      const played = beat.start();
      played.frame(1);
      const held = snapshot(props.group);
      played.reset();
      player.play(id);
      // No update needed: the last frame is drawn the moment the beat is played.
      expect(snapshot(props.group), id).toEqual(held);
    }
    player.play(null);
    expect(snapshot(props.group)).toEqual(idle);
  });
});

/** One beat played through to the frame it holds, on the island in Act 7's own colours. */
interface Held {
  readonly colors: Palette;
  /** The part with this name; throws if the beat has none, so a renamed part fails loudly. */
  readonly find: (name: string) => THREE.Object3D;
  /** Every part with this name, in the order the beat made them. */
  readonly all: (name: string) => THREE.Object3D[];
}

function heldFrame(id: string): Held {
  // The real accent, not a test one: Act 7's pink is what made pass and fail look alike.
  const colors = palette(actIsland('act7').accent);
  const props: Props = workshop(colors);
  const beat = props.beats[id];
  if (beat === undefined) throw new Error(`The workshop has no ${id} beat.`);
  beat.start().frame(1);
  return {
    colors,
    find: (name) => {
      const found = props.group.getObjectByName(name);
      if (found === undefined) throw new Error(`The ${id} beat has no part named ${name}.`);
      return found;
    },
    all: (name) => props.group.getObjectsByProperty('name', name),
  };
}

function materialOf(object: THREE.Object3D): THREE.MeshStandardMaterial {
  if (!(object instanceof THREE.Mesh)) throw new Error(`${object.name} isn't a mesh.`);
  return object.material as THREE.MeshStandardMaterial;
}

/** Green like passing CI: clearly more green than red, which the island's pink is not. */
function isGreen(object: THREE.Object3D): boolean {
  const { color } = materialOf(object);
  return color.g > color.r * 1.5;
}

/** How far apart two parts stand on the island floor, ignoring height. */
function across(a: THREE.Object3D, b: THREE.Object3D): number {
  return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
}

/**
 * What each beat must end on, in the words of the cards that name it. Typed by beat id,
 * so a new beat doesn't typecheck until its picture is pinned down here too.
 */
const PICTURES: Record<BeatId<'act7'>, { shows: string; check: (held: Held) => void }> = {
  'brief-handed': {
    shows: 'the brief still up beside Otto, every line read, and the work built',
    check: ({ colors, find, all }) => {
      const brief = find('brief');
      expect(brief.visible).toBe(true);
      expect(brief.scale.x).toBeGreaterThan(0.5);
      const [, ...lines] = brief.children;
      expect(lines).toHaveLength(3);
      for (const line of lines) expect(materialOf(line)).toBe(colors.glow);
      const built = all('built-block');
      expect(built).toHaveLength(3);
      for (const block of built) expect(block.visible).toBe(true);
    },
  },
  'agent-loop': {
    shows: 'all five steps lit and the orb back at the first',
    check: ({ colors, find, all }) => {
      const stations = all('station');
      expect(stations).toHaveLength(5);
      for (const station of stations) expect(materialOf(station)).toBe(colors.glow);
      const [first] = stations;
      if (first === undefined) throw new Error('The loop has no stations.');
      expect(across(find('loop-orb'), first)).toBeCloseTo(0);
    },
  },
  'diff-inspected': {
    shows: 'one red line on the PR and the lens resting on it',
    check: ({ colors, find }) => {
      const wrong = find('pr').children.filter((part) => materialOf(part) === colors.alert);
      expect(wrong).toHaveLength(1);
      const lens = find('lens');
      expect(lens.visible).toBe(true);
      expect(lens.position.y).toBeCloseTo(wrong[0]?.position.y ?? Number.NaN);
    },
  },
  'test-gate': {
    shows: 'the good block through the gate in green and the bad one sent back in red',
    check: ({ colors, find }) => {
      const gate = find('gate');
      const good = find('good-block');
      const bad = find('bad-block');
      expect(good.position.z).toBeGreaterThan(gate.position.z);
      expect(isGreen(good)).toBe(true);
      expect(bad.position.z).toBeLessThan(gate.position.z);
      expect(materialOf(bad)).toBe(colors.alert);
      // It stopped the last block that came, so it's showing a failure.
      for (const part of gate.children) expect(materialOf(part)).toBe(colors.alert);
    },
  },
  'gate-bent': {
    shows: 'the gate flat and green with the red block past it',
    check: ({ colors, find }) => {
      const gate = find('gate');
      expect(gate.rotation.x).toBeCloseTo(Math.PI / 2);
      for (const part of gate.children) expect(isGreen(part)).toBe(true);
      const bad = find('bad-block');
      expect(materialOf(bad)).toBe(colors.alert);
      // Past the fallen beam, which lies a gate's height in front of where it stood.
      expect(bad.position.z).toBeGreaterThan(gate.position.z + 2);
    },
  },
  'eval-scores': {
    shows: 'every answer graded and the score filled to the share that passed',
    check: ({ colors, find, all }) => {
      const answers = all('answer');
      const passed = answers.filter(isGreen).length;
      const failed = answers.filter((answer) => materialOf(answer) === colors.alert).length;
      expect(passed + failed).toBe(answers.length);
      expect(passed).toBeGreaterThan(0);
      expect(failed).toBeGreaterThan(0);
      const score = find('score');
      expect(isGreen(score)).toBe(true);
      expect(score.scale.y / find('score-frame').scale.y).toBeCloseTo(passed / answers.length);
    },
  },
  'guardrails-up': {
    shows: 'the note in with Otto, his errand stopped inside the fence, the key outside it',
    check: ({ colors, find, all }) => {
      const otto = find('otto');
      const [post] = all('fence-post');
      if (post === undefined) throw new Error('The fence has no posts.');
      const fence = across(post, otto);
      // He reads what he's given: the fence doesn't keep the note out.
      expect(across(find('note'), otto)).toBeLessThan(fence);
      const errand = find('errand');
      expect(materialOf(errand)).toBe(colors.alert);
      expect(across(errand, otto)).toBeLessThan(fence);
      const key = find('key');
      const safe = find('safe');
      expect(across(key, safe)).toBeCloseTo(0);
      expect(across(safe, otto)).toBeGreaterThan(fence);
    },
  },
  'agent-halted': {
    shows: 'the stop sign up, the orb dropped, and Otto switched off',
    check: ({ colors, find }) => {
      expect(find('stop-sign').visible).toBe(true);
      const orb = find('stuck-orb');
      expect(materialOf(orb)).toBe(colors.dark);
      expect(orb.position.y).toBeLessThan(find('otto').position.y + 0.5);
      expect(materialOf(find('visor'))).toBe(colors.dark);
    },
  },
};

describe('the picture each Act 7 beat ends on', () => {
  for (const [id, picture] of Object.entries(PICTURES)) {
    it(`${id} holds ${picture.shows}`, () => {
      picture.check(heldFrame(id));
    });
  }
});
