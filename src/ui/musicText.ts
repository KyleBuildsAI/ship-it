import type { MusicStatus } from '../game/audio/music';

/** One plain line for Settings about what the music is doing, and what to do about it. */
export function describeMusic(status: MusicStatus, volume: number): string {
  const { state, track } = status;
  if (volume === 0) return 'Music is off. Raise the volume to hear it.';
  switch (state) {
    case 'waiting':
      return 'Music starts when you click or press a key.';
    case 'loading':
      return track ? `Loading ${track.title}…` : 'Loading…';
    case 'playing':
      return track
        ? `Now playing: ${track.composer}, ${track.title}. Performed by ${track.performer}.`
        : 'Playing.';
    case 'unavailable':
      return "Music couldn't load. Check your internet connection: it tries again once you're back online.";
    case 'off':
      return 'Music is paused.';
  }
}
