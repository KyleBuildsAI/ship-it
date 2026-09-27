import { describe, expect, it } from 'vitest';
import type { Track } from '../../content/music';
import {
  createPlaylist,
  currentTrack,
  MUSIC_LEVEL,
  musicVolume,
  nextInPlaylist,
  rampVolume,
  shuffled,
} from './playlist';

const track = (id: string): Track => ({
  id,
  composer: 'Composer',
  title: `Piece ${id}`,
  performer: 'Performer',
  url: `https://upload.wikimedia.org/${id}.ogg`,
  page: `https://commons.wikimedia.org/wiki/File:${id}.ogg`,
  license: 'Public domain',
  seconds: 60,
});
const TRACKS = [track('a'), track('b'), track('c')];
// Math.floor(0.999 * (index + 1)) === index, so every swap is with itself: the order stays.
const KEEP_ORDER = () => 0.999;

describe('shuffled', () => {
  it('returns a new array with the same items, leaving the original alone', () => {
    const items = [1, 2, 3, 4];
    const result = shuffled(items, () => 0);

    expect(result).not.toBe(items);
    expect([...result].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4]);
  });

  it('keeps the order when every swap is with itself', () => {
    expect(shuffled([1, 2, 3], KEEP_ORDER)).toEqual([1, 2, 3]);
  });

  it('can produce every order of three items', () => {
    const orders = new Set<string>();
    // Random values chosen to walk every branch of the two swaps.
    for (const first of [0, 0.4, 0.8]) {
      for (const second of [0, 0.6]) {
        const values = [first, second];
        orders.add(shuffled(['a', 'b', 'c'], () => values.shift() ?? 0).join(''));
      }
    }

    expect(orders.size).toBe(6);
  });
});

describe('playlist', () => {
  it('starts at the first piece of the shuffled order', () => {
    const playlist = createPlaylist(TRACKS, KEEP_ORDER);

    expect(currentTrack(playlist)).toBe(TRACKS[0]);
  });

  it('moves through the order one piece at a time', () => {
    const second = nextInPlaylist(createPlaylist(TRACKS, KEEP_ORDER), TRACKS, KEEP_ORDER);

    expect(currentTrack(second)).toBe(TRACKS[1]);
  });

  it('reshuffles after the last piece', () => {
    const next = nextInPlaylist({ order: TRACKS, position: 2 }, TRACKS, KEEP_ORDER);

    expect(next).toEqual({ order: TRACKS, position: 0 });
  });

  it("doesn't repeat the piece that just ended", () => {
    // This round ended on a, and the new shuffle (order kept) would start with a again.
    const endedOnA = { order: [...TRACKS].reverse(), position: 2 };
    const next = nextInPlaylist(endedOnA, TRACKS, KEEP_ORDER);

    expect(next.order.map((piece) => piece.id)).toEqual(['b', 'c', 'a']);
  });

  it('has nothing to play when there are no pieces', () => {
    expect(currentTrack(createPlaylist([], KEEP_ORDER))).toBeNull();
  });
});

describe('volume', () => {
  it('scales the setting down to background level, within 0 to 1', () => {
    expect(musicVolume(1)).toBe(MUSIC_LEVEL);
    expect(musicVolume(0.5)).toBe(MUSIC_LEVEL / 2);
    expect(musicVolume(2)).toBe(MUSIC_LEVEL);
    expect(musicVolume(-1)).toBe(0);
  });

  it('ramps in a straight line and stops at the target', () => {
    expect(rampVolume(0, 1, 0, 1000)).toBe(0);
    expect(rampVolume(0, 1, 250, 1000)).toBe(0.25);
    expect(rampVolume(1, 0, 1500, 1000)).toBe(0);
    expect(rampVolume(0, 1, 10, 0)).toBe(1);
  });
});
