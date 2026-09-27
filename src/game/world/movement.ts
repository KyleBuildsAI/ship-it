/** A point on the ground plane (y is up in three.js, so the ground uses x and z). */
export interface Flat {
  x: number;
  z: number;
}

export const WALK_SPEED = 4.5;

/** Keys that move the avatar, as held right now. */
export interface MoveKeys {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Turns held WASD keys into a unit direction on the ground, relative to where the
 * camera looks, so W always walks "into the screen" wherever the camera has orbited.
 * `cameraYaw` is the camera's angle around the vertical axis (0 = looking along -z).
 */
export function keyDirection(keys: MoveKeys, cameraYaw: number): Flat | null {
  const forward = Number(keys.forward) - Number(keys.back);
  const strafe = Number(keys.right) - Number(keys.left);
  if (forward === 0 && strafe === 0) return null;
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  // Forward is -z rotated by yaw; right is +x rotated by yaw.
  const x = -sin * forward + cos * strafe;
  const z = -cos * forward - sin * strafe;
  const length = Math.hypot(x, z);
  return { x: x / length, z: z / length };
}

/**
 * Moves `from` toward `to` by at most `speed * dt`. Returns the new position and whether
 * it arrived, so click-to-walk stops exactly on the clicked spot instead of jittering.
 */
export function stepToward(
  from: Flat,
  to: Flat,
  speed: number,
  dt: number,
): { position: Flat; arrived: boolean } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  const step = speed * dt;
  if (distance <= step || distance < 1e-6) return { position: { ...to }, arrived: true };
  return {
    position: { x: from.x + (dx / distance) * step, z: from.z + (dz / distance) * step },
    arrived: false,
  };
}

/** Keeps a position inside a circle, so nobody walks off the edge of a floating island. */
export function clampToDisc(position: Flat, center: Flat, radius: number): Flat {
  const dx = position.x - center.x;
  const dz = position.z - center.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= radius) return position;
  return { x: center.x + (dx / distance) * radius, z: center.z + (dz / distance) * radius };
}

/** The angle a character should face to look along a direction (three.js y rotation). */
export function headingOf(direction: Flat): number {
  return Math.atan2(direction.x, direction.z);
}

/** Smoothly turns `current` toward `target` along the shortest way round the circle. */
export function turnToward(current: number, target: number, rate: number, dt: number): number {
  let delta = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * Math.min(1, rate * dt);
}

/** Takeoff speed, in world units per second. With GRAVITY this makes a jump about 1 unit high. */
export const JUMP_SPEED = 6;
/** Stronger than real gravity, so a jump feels light and quick (about two thirds of a second). */
export const GRAVITY = 18;

/** How high the avatar is off the ground, and how fast it's moving up (negative: falling). */
export interface Jump {
  height: number;
  velocity: number;
}

export const GROUNDED: Jump = { height: 0, velocity: 0 };

export function isGrounded(jump: Jump): boolean {
  return jump.height <= 0 && jump.velocity <= 0;
}

/** Leaves the ground, but only from the ground: no jumping again in mid-air. */
export function startJump(jump: Jump): Jump {
  return isGrounded(jump) ? { height: 0, velocity: JUMP_SPEED } : jump;
}

/** Advances a jump by dt seconds, landing exactly on the ground instead of sinking into it. */
export function stepJump(jump: Jump, dt: number): Jump {
  if (isGrounded(jump)) return GROUNDED;
  const velocity = jump.velocity - GRAVITY * dt;
  // The average of the old and new speeds keeps the arc the same at any frame rate.
  const height = jump.height + ((jump.velocity + velocity) / 2) * dt;
  return height <= 0 ? GROUNDED : { height, velocity };
}
