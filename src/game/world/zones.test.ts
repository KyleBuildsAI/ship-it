import { describe, expect, it } from 'vitest';
import { ACTS } from '../../content';
import { ROADMAP } from '../../content/roadmap';
import { ACTS as CAMPUS_ACTS } from './campus';
import {
  ACT_ISLANDS,
  actForZone,
  actIsland,
  CAMERA_RIGS,
  perActIsland,
  doorwayAt,
  openActs,
  STEP_THROUGH_DISTANCE,
  usesTerminal,
  zoneForAct,
  type Doorway,
} from './zones';

const toGitWorld: Doorway = { at: { x: 0, z: -11.5 }, to: 'gitworld' };
const home: Doorway = { at: { x: -2, z: -11 }, to: 'campus' };

describe('zoneForAct', () => {
  it('sends Act 1 to the machine island, and Act 2 to the Git World', () => {
    expect(zoneForAct(1)).toBe('machine');
    expect(zoneForAct(2)).toBe('gitworld');
  });

  it('gives Acts 3 to 8 each a themed island of its own', () => {
    expect([3, 4, 5, 6, 7, 8].map(zoneForAct)).toEqual([
      'act3',
      'act4',
      'act5',
      'act6',
      'act7',
      'act8',
    ]);
  });

  it('has no island for an Act outside the course', () => {
    expect(zoneForAct(0)).toBeNull();
    expect(zoneForAct(9)).toBeNull();
  });

  it('finds the Act an island belongs to, and none for Campus', () => {
    expect(actForZone('machine')).toBe(1);
    expect(actForZone('gitworld')).toBe(2);
    expect(actForZone('act5')).toBe(5);
    expect(actForZone('campus')).toBeNull();
  });

  it('opens every Campus portal: each Act 1 to 8 has an island', () => {
    expect([...openActs()].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const { act } of CAMPUS_ACTS) expect(openActs().has(act)).toBe(true);
  });

  it("sends every catalog Act's portal to an island that opens that same Act's menu", () => {
    // The Acts menu and the portals must agree: arriving shows the Act you walked into.
    for (const { act } of ACTS) {
      const island = zoneForAct(act.act);
      expect(island).not.toBeNull();
      if (island !== null) expect(actForZone(island)).toBe(act.act);
    }
  });
});

describe('the Act islands', () => {
  it('match the roadmap: same Act, same title', () => {
    for (const island of ACT_ISLANDS) {
      expect(island.title).toBe(ROADMAP.find((entry) => entry.act === island.act)?.title);
    }
  });

  it('each have their own accent, theme and place, far apart from every other island', () => {
    const unique = (values: readonly unknown[]) => new Set(values).size === values.length;
    expect(unique(ACT_ISLANDS.map((island) => island.accent))).toBe(true);
    expect(unique(ACT_ISLANDS.map((island) => island.theme))).toBe(true);
    // Campus, the Git World and the machine island float here too.
    const centers = [
      { x: 0, z: 0 },
      { x: 140, z: 0 },
      { x: -140, z: 0 },
      ...ACT_ISLANDS.map((island) => island.center),
    ];
    centers.forEach((a, index) => {
      for (const b of centers.slice(index + 1)) {
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(100);
      }
    });
  });

  it('point the player at a lesson that ships: their Act’s first, by number and title', () => {
    for (const island of ACT_ISLANDS) {
      const content = ACTS.find(({ act }) => act.act === island.act);
      const first = content !== undefined && 'lessons' in content ? content.lessons[0] : undefined;
      expect(first).toBeDefined();
      expect(island.hint).toContain(`${String(island.act)}.1 ${String(first?.title)}`);
    }
  });

  it('builds one value per island, keyed by zone', () => {
    expect(perActIsland((island) => island.act)).toEqual({
      act3: 3,
      act4: 4,
      act5: 5,
      act6: 6,
      act7: 7,
      act8: 8,
    });
    expect(actIsland('act4').title).toBe('GitHub Team Flow');
  });
});

describe('usesTerminal', () => {
  it('keeps the terminal on Campus, the machine island and the Git World, not on lesson islands', () => {
    expect(usesTerminal('campus')).toBe(true);
    expect(usesTerminal('machine')).toBe(true);
    expect(usesTerminal('gitworld')).toBe(true);
    for (const island of ACT_ISLANDS) expect(usesTerminal(island.zone)).toBe(false);
  });
});

describe('doorwayAt', () => {
  it('steps through a portal once the avatar is within reach of its ring', () => {
    const justInside = STEP_THROUGH_DISTANCE - 0.05;
    expect(doorwayAt({ x: 0, z: -11.5 + justInside }, [toGitWorld])).toBe(toGitWorld);
  });

  it('does nothing a little further away, in front of the ring', () => {
    expect(doorwayAt({ x: 0, z: -9.9 }, [toGitWorld])).toBeNull();
    expect(doorwayAt({ x: 0, z: 0 }, [])).toBeNull();
  });

  it('picks the nearest when two portals are close together', () => {
    expect(doorwayAt({ x: -1.3, z: -11.2 }, [toGitWorld, home])).toBe(home);
    expect(doorwayAt({ x: -0.5, z: -11.4 }, [toGitWorld, home])).toBe(toGitWorld);
  });
});

describe('CAMERA_RIGS', () => {
  it('frames the Git World from further back than Campus', () => {
    expect(CAMERA_RIGS.gitworld.back).toBeGreaterThan(CAMERA_RIGS.campus.back);
  });

  it('has a rig for every island', () => {
    for (const island of ACT_ISLANDS) expect(CAMERA_RIGS[island.zone].height).toBeGreaterThan(0);
  });
});
