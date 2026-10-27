import { describe, expect, it } from 'vitest';
import { ISLAND_BEATS } from '../beats';
import { gates } from './gates';
import { palette } from './kit';

/**
 * Every object's place, turn, size, visibility and material, to compare before and after
 * a beat.
 */
function snapshot(props: ReturnType<typeof gates>): string[] {
  const looks: string[] = [];
  props.group.traverse((object) => {
    const material = 'material' in object ? String((object.material as { id: number }).id) : '';
    looks.push(
      [
        object.type,
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

describe('the Act 5 gates island beats', () => {
  it('plays every listed beat, and puts the island back exactly as it was', () => {
    const props = gates(palette(0x7ee2a8));
    props.animate(0);
    const idle = snapshot(props);
    for (const id of ISLAND_BEATS.act5) {
      const beat = props.beats[id];
      expect(beat, id).toBeDefined();
      if (!beat) continue;
      expect(beat.seconds, id).toBeGreaterThanOrEqual(1.5);
      expect(beat.seconds, id).toBeLessThanOrEqual(3);
      const run = beat.start();
      // Reduced motion jumps straight to the end, so every frame must stand on its own.
      for (const progress of [1, 0, 0.25, 0.5, 0.75, 1]) run.frame(progress);
      expect(snapshot(props), id).not.toEqual(idle);
      run.reset();
      expect(snapshot(props), id).toEqual(idle);
    }
  });

  it('draws the same picture for the same moment, whatever came before', () => {
    const props = gates(palette(0x7ee2a8));
    for (const id of ISLAND_BEATS.act5) {
      const run = props.beats[id]?.start();
      if (!run) continue;
      run.frame(0.7);
      const direct = snapshot(props);
      run.frame(0.2);
      run.frame(0.7);
      expect(snapshot(props), id).toEqual(direct);
      run.reset();
    }
  });

  it('cleans up a beat cut off halfway, when the player answers before it ends', () => {
    const props = gates(palette(0x7ee2a8));
    props.animate(0);
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
