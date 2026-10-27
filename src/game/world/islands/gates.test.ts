import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { ISLAND_BEATS, type BeatId } from '../beats';
import { actIsland } from '../zones';
import { gates } from './gates';
import { palette, type Palette, type Props } from './kit';

/** The moments each beat is drawn at, from just started to held. */
const MOMENTS = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1];

/**
 * Every object's place, turn, size, visibility and material, to compare before and after
 * a beat.
 */
function snapshot(props: Props): string[] {
  const looks: string[] = [];
  props.group.traverse((object) => {
    const material =
      object instanceof THREE.Mesh ? String((object.material as { id: number }).id) : '';
    looks.push(
      [
        object.type,
        object.name,
        object.position.toArray().join(','),
        object.rotation.toArray().join(','),
        object.scale.toArray().join(','),
        String(object.visible),
        material,
      ].join(' '),
    );
  });
  return looks;
}

/** The island in its idle look, built with Act 5's own colours. */
function build(): { props: Props; colors: Palette } {
  const colors = palette(actIsland('act5').accent);
  const props = gates(colors);
  props.animate(0);
  return { props, colors };
}

/** Starts one beat on a fresh island, with ways to draw a moment and look at its parts. */
function play(id: BeatId<'act5'>) {
  const { props, colors } = build();
  const beat = props.beats[id];
  if (!beat) throw new Error(`The gates island has no beat ${id}.`);
  const run = beat.start();
  const find = (name: string): THREE.Object3D => {
    const found = props.group.getObjectByName(name);
    if (!found) throw new Error(`The gates island has no ${name} during ${id}.`);
    return found;
  };
  const mesh = (name: string): THREE.Mesh => {
    const found = find(name);
    if (!(found instanceof THREE.Mesh)) throw new Error(`${name} is not a mesh.`);
    // instanceof narrows to Mesh<any>; every mesh here is a plain one.
    return found as THREE.Mesh;
  };
  /** What a gate's light says: dark (not checked), green (passed) or red (failed). */
  const light = (gate: number): string => {
    const { material } = mesh(`light-${String(gate)}`);
    if (material === colors.dark) return 'dark';
    if (material === colors.alert) return 'red';
    return (material as THREE.Material).name === 'pass' ? 'green' : 'unknown';
  };
  const lights = () => [0, 1, 2, 3].map(light);
  /** Where a gate stands along the road. */
  const gateZ = (gate: number) => mesh(`beam-${String(gate)}`).position.z;
  return { props, colors, run, find, mesh, light, lights, gateZ };
}

describe('the Act 5 gates island beats', () => {
  it('plays every listed beat, and puts the island back exactly as it was', () => {
    const { props } = build();
    const idle = snapshot(props);
    for (const id of ISLAND_BEATS.act5) {
      const beat = props.beats[id];
      expect(beat, id).toBeDefined();
      if (!beat) continue;
      expect(beat.seconds, id).toBeGreaterThanOrEqual(1.5);
      expect(beat.seconds, id).toBeLessThanOrEqual(3);
      const run = beat.start();
      // Reduced motion jumps straight to the end, so every frame must stand on its own.
      for (const progress of [1, ...MOMENTS]) run.frame(progress);
      expect(snapshot(props), id).not.toEqual(idle);
      run.reset();
      expect(snapshot(props), id).toEqual(idle);
    }
  });

  it('draws the same picture for a moment, whatever moment came before', () => {
    const { props } = build();
    for (const id of ISLAND_BEATS.act5) {
      const run = props.beats[id]?.start();
      if (!run) continue;
      const inOrder = MOMENTS.map((progress) => {
        run.frame(progress);
        return snapshot(props);
      });
      // The same moments again, each drawn straight after a different one.
      [...MOMENTS].reverse().forEach((progress, index) => {
        run.frame(MOMENTS[index] ?? 0);
        run.frame(progress);
        expect(snapshot(props), `${id} at ${String(progress)}`).toEqual(
          inOrder[MOMENTS.length - 1 - index],
        );
      });
      run.reset();
    }
  });

  it('cleans up a beat cut off halfway, when the player answers before it ends', () => {
    const { props } = build();
    const idle = snapshot(props);
    for (const id of ISLAND_BEATS.act5) {
      const run = props.beats[id]?.start();
      if (!run) continue;
      run.frame(0.5);
      run.reset();
      expect(snapshot(props), id).toEqual(idle);
    }
  });
});

// What each beat must show. A wrong picture teaches a beginner the wrong idea, so these
// pin down the parts that carry the lesson.
describe('what the gates island shows', () => {
  it('a failing check stops the change, and the gate after it never runs', () => {
    const beat = play('gate-blocks');
    beat.run.frame(1);
    expect(beat.lights()).toEqual(['green', 'green', 'red', 'dark']);
    expect(beat.mesh('change').position.z).toBeLessThan(beat.gateZ(2));
    expect(beat.mesh('boom').visible).toBe(true);
  });

  it('a fixed change is a new push: it runs every gate again from the start', () => {
    const beat = play('red-to-green');
    beat.run.frame(0.4);
    expect(beat.light(2)).toBe('red');
    beat.run.frame(0.52);
    expect(beat.lights()).toEqual(['dark', 'dark', 'dark', 'dark']);
    beat.run.frame(1);
    expect(beat.lights()).toEqual(['green', 'green', 'green', 'green']);
    expect(beat.mesh('change').position.z).toBeGreaterThan(beat.gateZ(3));
    expect(beat.mesh('change').material).toBe(beat.colors.glow);
    expect(beat.mesh('boom').visible).toBe(false);
  });

  it('a revert passes every gate, and the broken change stays in history, undone', () => {
    const beat = play('change-reverted');
    beat.run.frame(0.3);
    expect(beat.mesh('broken').material).toBe(beat.colors.alert);
    beat.run.frame(1);
    expect(beat.lights()).toEqual(['green', 'green', 'green', 'green']);
    expect(beat.mesh('revert').position.z).toBeGreaterThan(beat.gateZ(3));
    expect(beat.mesh('broken').visible).toBe(true);
    expect(beat.mesh('broken').material).toBe(beat.colors.dark);
  });

  it('a switched-off gate stays dark, in place, while a bug rolls through', () => {
    const beat = play('gate-bypassed');
    const beamHeight = beat.mesh('beam-2').position.y;
    beat.run.frame(1);
    expect(beat.lights()).toEqual(['green', 'green', 'dark', 'green']);
    expect(beat.mesh('beam-2').material).toBe(beat.colors.dark);
    // Raised, it would cover the farther gates' lights from the lesson camera.
    expect(beat.mesh('beam-2').position.y).toBe(beamHeight);
    expect(beat.mesh('bug').position.z).toBeGreaterThan(beat.gateZ(3));
  });

  it('a bug no gate looks for passes every working gate, all green', () => {
    const beat = play('bug-slips-through');
    beat.run.frame(1);
    expect(beat.lights()).toEqual(['green', 'green', 'green', 'green']);
    for (const gate of [0, 1, 2, 3]) {
      expect(beat.mesh(`beam-${String(gate)}`).material).toBe(beat.colors.glow);
    }
    expect(beat.mesh('change').material).toBe(beat.colors.alert);
    expect(beat.mesh('change').position.z).toBeGreaterThan(beat.gateZ(3));
  });

  it('a flaky gate passes one change, then stops an identical one', () => {
    const beat = play('flaky-check');
    beat.run.frame(0.6);
    expect(beat.light(3)).toBe('green');
    beat.run.frame(1);
    expect(beat.light(3)).toBe('red');
    expect(beat.mesh('second').material).toBe(beat.mesh('first').material);
    expect(beat.mesh('first').position.z).toBeGreaterThan(beat.gateZ(3));
    expect(beat.mesh('second').position.z).toBeLessThan(beat.gateZ(3));
    expect(beat.mesh('boom').visible).toBe(true);
  });

  it('a key comes from the vault to the gate and goes home, never riding the road', () => {
    const beat = play('secret-vault');
    beat.run.frame(0);
    const home = beat.find('vault-key').position.clone();
    for (const progress of MOMENTS) {
      beat.run.frame(progress);
      // Higher than any crate's top: it never travels with the change.
      expect(beat.find('vault-key').position.y, String(progress)).toBeGreaterThan(1);
    }
    beat.run.frame(0.55);
    expect(beat.find('vault-key').position.distanceTo(home)).toBeGreaterThan(3);
    beat.run.frame(1);
    expect(beat.find('vault-key').position.distanceTo(home)).toBeCloseTo(0);
    expect(beat.mesh('change').position.z).toBeGreaterThan(beat.gateZ(3));
  });

  it("a fork's change never gets the key, and the gate that needs it never passes", () => {
    const beat = play('secret-withheld');
    beat.run.frame(0);
    const home = beat.find('vault-key').position.clone();
    for (const progress of MOMENTS) {
      beat.run.frame(progress);
      // It shakes "no" where it is, and nothing more.
      expect(beat.find('vault-key').position.distanceTo(home), String(progress)).toBeLessThan(0.5);
      expect(beat.light(3), String(progress)).toBe('dark');
    }
    beat.run.frame(1);
    expect(beat.mesh('stranger').position.z).toBeLessThan(beat.gateZ(3));
  });

  it('a revoked key stays where it leaked, dead, and a fresh one waits in the vault', () => {
    const beat = play('key-revoked');
    beat.run.frame(0.2);
    const leakedAt = beat.find('leaked-key').position.clone();
    beat.run.frame(1);
    const leaked = beat.find('leaked-key');
    expect(leaked.visible).toBe(true);
    expect(leaked.position.distanceTo(leakedAt)).toBeCloseTo(0);
    for (const piece of leaked.children) {
      expect((piece as THREE.Mesh).material).toBe(beat.colors.dark);
    }
    expect(beat.find('fresh-key').visible).toBe(true);
  });

  it('the testing pyramid: many unit tests, fewer integration tests, one end-to-end', () => {
    const beat = play('test-layers');
    beat.run.frame(1);
    const layer = (name: string) =>
      beat.props.group.getObjectsByProperty('name', name).filter((block) => block.visible);
    const [unit, integration, endToEnd] = [
      layer('unit-test'),
      layer('integration-test'),
      layer('end-to-end-test'),
    ];
    expect([unit.length, integration.length, endToEnd.length]).toEqual([5, 3, 1]);
    const height = (blocks: THREE.Object3D[]) => blocks[0]?.position.y ?? 0;
    expect(height(integration)).toBeGreaterThan(height(unit));
    expect(height(endToEnd)).toBeGreaterThan(height(integration));
  });
});
