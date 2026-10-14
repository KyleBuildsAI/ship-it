import { describe, expect, it } from 'vitest';
import { beatsForAct, beatZoneForAct, ISLAND_BEATS } from './beats';
import { ACT_ISLANDS } from './zones';

describe('lesson scene beats', () => {
  it('lists beats for every Act island, each a unique kebab-case id', () => {
    expect(Object.keys(ISLAND_BEATS).sort()).toEqual(ACT_ISLANDS.map((island) => island.zone));
    for (const ids of Object.values(ISLAND_BEATS)) {
      const list: readonly string[] = ids;
      expect(new Set(list).size).toBe(list.length);
      for (const id of list) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("gives Act 3's branching island the git beats its lessons name", () => {
    expect(beatZoneForAct(3)).toBe('act3');
    expect(beatsForAct(3)).toEqual(
      expect.arrayContaining(['branch-splits', 'fast-forward', 'merge-commit', 'conflict-clash']),
    );
  });

  it('gives Acts without an Act island no beats', () => {
    for (const act of [1, 2, 99]) {
      expect(beatZoneForAct(act)).toBeNull();
      expect(beatsForAct(act)).toEqual([]);
    }
  });
});
