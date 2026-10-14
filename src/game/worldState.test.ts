import { afterEach, describe, expect, it } from 'vitest';
import { travelTo, worldState } from './worldState';

afterEach(() => {
  worldState.update({ zone: 'campus', destination: null });
});

describe('travelTo', () => {
  it('asks the world to go to another island', () => {
    travelTo('gitworld');
    expect(worldState.get().destination).toBe('gitworld');
  });

  it('asks for nothing when the player is already there', () => {
    worldState.update({ zone: 'machine' });
    travelTo('machine');
    expect(worldState.get().destination).toBeNull();
  });

  it('asks for nothing when an Act has no island', () => {
    travelTo(null);
    expect(worldState.get().destination).toBeNull();
  });
});
