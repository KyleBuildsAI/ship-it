import { describe, expect, it } from 'vitest';
import {
  actForZone,
  CAMERA_RIGS,
  doorwayAt,
  openActs,
  STEP_THROUGH_DISTANCE,
  zoneForAct,
  type Doorway,
} from './zones';

const toGitWorld: Doorway = { at: { x: 0, z: -11.5 }, to: 'gitworld' };
const home: Doorway = { at: { x: -2, z: -11 }, to: 'campus' };

describe('zoneForAct', () => {
  it('sends Act 2 to the Git World', () => {
    expect(zoneForAct(2)).toBe('gitworld');
  });

  it('has no island for an Act that is not built yet', () => {
    expect(zoneForAct(8)).toBeNull();
  });

  it('finds the Act an island belongs to, and none for Campus', () => {
    expect(actForZone('gitworld')).toBe(2);
    expect(actForZone('campus')).toBeNull();
  });

  it('opens exactly the Acts that have an island', () => {
    expect([...openActs()]).toEqual([2]);
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
});
