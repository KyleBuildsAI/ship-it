import { describe, expect, it } from 'vitest';
import { TRACKS } from '../content/music';
import { describeMusic } from './musicText';

const clair = TRACKS.find((track) => track.id === 'debussy-clair-de-lune') ?? null;

describe('describeMusic', () => {
  it('says how to turn it back on when the volume is 0, whatever the player is doing', () => {
    expect(describeMusic({ state: 'playing', track: clair }, 0)).toBe(
      'Music is off. Raise the volume to hear it.',
    );
  });

  it('names the piece, composer, and performer while playing', () => {
    expect(describeMusic({ state: 'playing', track: clair }, 0.7)).toBe(
      'Now playing: Claude Debussy, Clair de lune. Performed by Laurens Goedhart.',
    );
  });

  it.each([
    ['waiting', 'Music starts when you click or press a key.'],
    ['loading', 'Loading Clair de lune…'],
    ['off', 'Music is paused.'],
  ] as const)('explains the %s state', (state, text) => {
    expect(describeMusic({ state, track: clair }, 0.7)).toBe(text);
  });

  it('points at the network when nothing could load', () => {
    expect(describeMusic({ state: 'unavailable', track: null }, 0.7)).toContain(
      'internet connection',
    );
  });

  it('still reads well without a track', () => {
    expect(describeMusic({ state: 'playing', track: null }, 0.7)).toBe('Playing.');
    expect(describeMusic({ state: 'loading', track: null }, 0.7)).toBe('Loading…');
  });
});
