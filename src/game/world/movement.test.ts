import { describe, expect, it } from 'vitest';
import {
  clampToDisc,
  GRAVITY,
  GROUNDED,
  headingOf,
  isGrounded,
  JUMP_SPEED,
  keyDirection,
  startJump,
  stepJump,
  stepToward,
  turnToward,
} from './movement';

const none = { forward: false, back: false, left: false, right: false };
const close = (value: number, expected: number) => {
  expect(value).toBeCloseTo(expected, 6);
};

describe('keyDirection', () => {
  it('returns nothing when no key is held, or opposite keys cancel out', () => {
    expect(keyDirection(none, 0)).toBeNull();
    expect(keyDirection({ ...none, forward: true, back: true }, 0)).toBeNull();
  });

  it('walks into the screen with W when the camera looks along -z', () => {
    const direction = keyDirection({ ...none, forward: true }, 0);
    close(direction?.x ?? NaN, 0);
    close(direction?.z ?? NaN, -1);
  });

  it('strafes right with D and turns with the camera', () => {
    const right = keyDirection({ ...none, right: true }, 0);
    close(right?.x ?? NaN, 1);
    const turned = keyDirection({ ...none, forward: true }, Math.PI / 2);
    close(turned?.x ?? NaN, -1);
    close(turned?.z ?? NaN, 0);
  });

  it('normalises diagonals so they are not faster', () => {
    const diagonal = keyDirection({ ...none, forward: true, right: true }, 0);
    close(Math.hypot(diagonal?.x ?? 0, diagonal?.z ?? 0), 1);
  });
});

describe('stepToward', () => {
  it('moves by speed times time and reports arrival', () => {
    const halfway = stepToward({ x: 0, z: 0 }, { x: 10, z: 0 }, 5, 1);
    expect(halfway).toEqual({ position: { x: 5, z: 0 }, arrived: false });
    expect(stepToward({ x: 9, z: 0 }, { x: 10, z: 0 }, 5, 1)).toEqual({
      position: { x: 10, z: 0 },
      arrived: true,
    });
    expect(stepToward({ x: 1, z: 1 }, { x: 1, z: 1 }, 5, 1).arrived).toBe(true);
  });
});

describe('clampToDisc', () => {
  it('leaves inside points alone and pulls outside points to the edge', () => {
    expect(clampToDisc({ x: 1, z: 1 }, { x: 0, z: 0 }, 5)).toEqual({ x: 1, z: 1 });
    const pulled = clampToDisc({ x: 10, z: 0 }, { x: 0, z: 0 }, 5);
    close(pulled.x, 5);
    close(pulled.z, 0);
  });
});

describe('headings', () => {
  it('faces along a direction', () => {
    close(headingOf({ x: 0, z: 1 }), 0);
    close(headingOf({ x: 1, z: 0 }), Math.PI / 2);
  });

  it('turns the short way round', () => {
    const turned = turnToward(Math.PI - 0.1, -Math.PI + 0.1, 100, 1);
    close(turned, Math.PI + 0.1);
    close(turnToward(0, 1, 0.5, 1), 0.5);
    close(turnToward(0, -2 * Math.PI + 0.2, 1, 1), 0.2);
  });
});

describe('jumping', () => {
  it('only takes off from the ground', () => {
    const inAir = startJump(GROUNDED);
    expect(inAir).toEqual({ height: 0, velocity: JUMP_SPEED });
    const higher = stepJump(inAir, 0.1);
    expect(startJump(higher)).toBe(higher);
  });

  it('rises about one unit, then lands exactly on the ground', () => {
    let jump = startJump(GROUNDED);
    let peak = 0;
    let frames = 0;
    while (frames === 0 || !isGrounded(jump)) {
      jump = stepJump(jump, 1 / 60);
      peak = Math.max(peak, jump.height);
      frames++;
    }
    expect(peak).toBeCloseTo((JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY), 1);
    expect(jump).toEqual(GROUNDED);
    // About two thirds of a second at 60 frames per second.
    expect(frames).toBeGreaterThan(35);
    expect(frames).toBeLessThan(45);
  });

  it('keeps the same arc at any frame rate', () => {
    const peakAt = (dt: number) => {
      let jump = startJump(GROUNDED);
      let peak = 0;
      for (let time = 0; time < 1; time += dt) {
        jump = stepJump(jump, dt);
        peak = Math.max(peak, jump.height);
      }
      return peak;
    };
    expect(peakAt(1 / 30)).toBeCloseTo(peakAt(1 / 144), 1);
  });

  it('stays grounded when not jumping', () => {
    expect(stepJump(GROUNDED, 0.1)).toBe(GROUNDED);
  });
});
