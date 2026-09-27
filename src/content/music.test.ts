import { describe, expect, it } from 'vitest';
import { creditFor, trackSchema, TRACKS } from './music';

describe('music tracks', () => {
  it.each(TRACKS.map((track) => [track.id, track] as const))('%s is valid', (_id, track) => {
    expect(trackSchema.parse(track)).toEqual(track);
  });

  it('has unique ids and unique files', () => {
    expect(new Set(TRACKS.map((track) => track.id)).size).toBe(TRACKS.length);
    expect(new Set(TRACKS.map((track) => track.url)).size).toBe(TRACKS.length);
  });

  it('has enough music that a session rarely repeats', () => {
    const minutes = TRACKS.reduce((total, track) => total + track.seconds, 0) / 60;

    expect(minutes).toBeGreaterThan(30);
  });

  it('refuses a file from anywhere but Wikimedia', () => {
    const [first] = TRACKS;

    expect(trackSchema.safeParse({ ...first, url: 'https://example.com/a.ogg' }).success).toBe(
      false,
    );
  });

  it('credits the composer, performer, and license', () => {
    const clair = TRACKS.find((track) => track.id === 'debussy-clair-de-lune');

    expect(clair && creditFor(clair)).toBe(
      'Claude Debussy, Clair de lune. Performed by Laurens Goedhart. CC BY 3.0, via Wikimedia Commons.',
    );
  });
});
