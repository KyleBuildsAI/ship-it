import type { Track } from '../../content/music';

/**
 * The pure parts of the music player: what plays next, and how loud. No audio element,
 * no timers, so every rule has a quick unit test.
 */

/** How loud music plays with the volume setting at 100%: background, under everything. */
export const MUSIC_LEVEL = 0.4;

/** A shuffled copy (Fisher-Yates), so every order is equally likely. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}

/** The pieces in the order they'll play, and which one is up. */
export interface Playlist {
  readonly order: readonly Track[];
  readonly position: number;
}

export function createPlaylist(tracks: readonly Track[], random: () => number): Playlist {
  return { order: shuffled(tracks, random), position: 0 };
}

export function currentTrack(playlist: Playlist): Track | null {
  return playlist.order[playlist.position] ?? null;
}

/** The next piece. After the last one, a fresh shuffle that doesn't repeat it straight away. */
export function nextInPlaylist(
  playlist: Playlist,
  tracks: readonly Track[],
  random: () => number,
): Playlist {
  const position = playlist.position + 1;
  if (position < playlist.order.length) return { order: playlist.order, position };
  const last = playlist.order.at(-1);
  const next = shuffled(tracks, random);
  const order =
    next.length > 1 && next[0] === last ? [...next.slice(1), ...next.slice(0, 1)] : next;
  return { order, position: 0 };
}

/** The element volume for a volume setting from 0 to 1. */
export function musicVolume(setting: number): number {
  return Math.min(1, Math.max(0, setting)) * MUSIC_LEVEL;
}

/** The volume partway through a fade: a straight line from `from` to `to`. */
export function rampVolume(from: number, to: number, elapsedMs: number, durationMs: number) {
  const progressed = durationMs <= 0 ? 1 : Math.min(1, Math.max(0, elapsedMs / durationMs));
  return from + (to - from) * progressed;
}
