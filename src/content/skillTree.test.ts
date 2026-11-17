import { describe, expect, it } from 'vitest';
import { skillTree } from '../game/play/skillTree';
import { createDefaultSave } from '../game/save/schema';
import { TEST_NOW } from '../game/save/testFixtures';
import { partsPerAct } from '../game/world/portalShare';
import { ACT_SUMMARIES } from './actSummaries.generated';

/*
 * The skill tree against the real Acts, from the same summaries the game ships: every
 * part is a node, and every drill attempt belongs to exactly one mission node.
 */

describe('the skill tree over the shipped Acts', () => {
  const fresh = skillTree(ACT_SUMMARIES, createDefaultSave(TEST_NOW));

  it('has a node for every part of every Act', () => {
    expect(fresh.map((branch) => branch.act)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(fresh.map((branch) => branch.nodes.length)).toEqual([7, 6, 5, 5, 5, 5, 5, 5]);
  });

  it("gives each Act's Campus portal a ring segment for every node", () => {
    // The world builds each portal's ring from these counts; a short ring would drop pips.
    const segments = partsPerAct(ACT_SUMMARIES);
    expect([...segments.keys()]).toEqual(fresh.map((branch) => branch.act));
    expect(fresh.map((branch) => segments.get(branch.act))).toEqual(
      fresh.map((branch) => branch.nodes.length),
    );
  });

  it('gives every mission at least 5 drills to count', () => {
    const missions = ACT_SUMMARIES.flatMap(({ parts }) =>
      parts.filter((part) => part.kind === 'mission'),
    );
    expect(missions.length).toBeGreaterThan(0);
    for (const mission of missions) expect(mission.drillIds.length).toBeGreaterThanOrEqual(5);
  });

  it("counts each of an Act's drills for exactly one mission", () => {
    for (const { parts, drills } of ACT_SUMMARIES) {
      const owned = parts.flatMap((part) => part.drillIds);
      expect(owned.toSorted()).toEqual(drills.map((drill) => drill.id).toSorted());
    }
  });

  it('teaches Acts 3 to 8 by lessons and a final only', () => {
    const later = ACT_SUMMARIES.filter(({ act }) => act.act >= 3).flatMap(({ parts }) => parts);
    expect(later.every((part) => part.kind === 'lesson' || part.kind === 'final')).toBe(true);
  });

  it('starts a new player with every node new and none lit', () => {
    const nodes = fresh.flatMap((branch) => branch.nodes);
    expect(nodes.every((node) => node.state === 'new')).toBe(true);
    expect(fresh.every((branch) => branch.lit === 0)).toBe(true);
  });
});
