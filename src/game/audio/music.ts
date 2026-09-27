import { TRACKS, type Track } from '../../content/music';
import { isSavingHere, progress } from '../progress';
import { createStore } from '../store';
import { createPlaylist, currentTrack, musicVolume, nextInPlaylist, rampVolume } from './playlist';

/**
 * Background music. A shuffled playlist of calm classical pieces (src/content/music.ts),
 * streamed one at a time through a single audio element, with a gentle fade in and a
 * short silence between pieces.
 *
 * Browsers refuse to play sound before the player has clicked or pressed a key on the
 * page, so the music waits for that first interaction. The volume setting (0 turns it
 * off) comes from the save, and a tab that has handed the save to another tab goes quiet.
 */

export const FADE_IN_MS = 4000;
export const FADE_OUT_MS = 1500;
/** Quick enough to feel instant when dragging the volume slider, slow enough not to click. */
export const VOLUME_CHANGE_MS = 250;
/** Silence between pieces, so one doesn't crash into the next. */
export const GAP_MS = 4000;
const FADE_STEP_MS = 50;

/**
 * 'waiting': ready to play, but the browser needs a click or key press first.
 * 'unavailable': a piece failed to load, usually because the computer is offline.
 */
export type MusicState = 'off' | 'waiting' | 'loading' | 'playing' | 'unavailable';

export interface MusicStatus {
  state: MusicState;
  /** The piece playing or about to play. */
  track: Track | null;
}

export const music = createStore<MusicStatus>({ state: 'off', track: null });

/** The part of an HTML audio element the player uses, so tests can pass a fake. */
export interface AudioLike {
  src: string;
  volume: number;
  play: () => Promise<void>;
  pause: () => void;
  addEventListener: (type: 'ended', listener: () => void) => void;
  removeEventListener: (type: 'ended', listener: () => void) => void;
}

export interface MusicOptions {
  audio?: AudioLike;
  tracks?: readonly Track[];
  random?: () => number;
  /** Where clicks and key presses are heard. The window in the game. */
  events?: EventTarget;
}

const GESTURES = ['pointerdown', 'keydown'] as const;

/** Starts the music player. Returns a function that stops it and releases everything. */
export function startMusic(options: MusicOptions = {}): () => void {
  const audio = options.audio ?? new Audio();
  const tracks = options.tracks ?? TRACKS;
  const random = options.random ?? Math.random;
  const events = options.events ?? window;

  let playlist = createPlaylist(tracks, random);
  // Sound is allowed once the player has interacted with the page.
  let interacted = false;
  // True from asking a piece to play until it ends or the music stops.
  let active = false;
  // Each request to play gets a number, so a late answer about an older piece is ignored.
  let attempts = 0;
  let fade: ReturnType<typeof setInterval> | null = null;
  let gap: ReturnType<typeof setTimeout> | null = null;

  const setting = () => progress.get().save?.settings.audioVolume ?? 0;
  const wanted = () => progress.get().status === 'ready' && setting() > 0 && isSavingHere();

  const stopFade = () => {
    if (fade !== null) clearInterval(fade);
    fade = null;
  };

  const fadeTo = (target: number, durationMs: number, then?: () => void) => {
    stopFade();
    const from = audio.volume;
    let elapsed = 0;
    fade = setInterval(() => {
      elapsed += FADE_STEP_MS;
      audio.volume = rampVolume(from, target, elapsed, durationMs);
      if (elapsed >= durationMs) {
        stopFade();
        then?.();
      }
    }, FADE_STEP_MS);
  };

  const current = () => currentTrack(playlist);
  const moveOn = () => {
    playlist = nextInPlaylist(playlist, tracks, random);
  };

  const play = () => {
    const track = current();
    if (track === null) return;
    attempts += 1;
    const attempt = attempts;
    active = true;
    stopFade();
    audio.volume = 0;
    audio.src = track.url;
    music.update({ state: 'loading', track });
    audio.play().then(
      () => {
        if (attempt !== attempts || !active) return;
        music.update({ state: 'playing' });
        // Sync again afterwards in case the volume setting moved during the fade.
        fadeTo(musicVolume(setting()), FADE_IN_MS, sync);
      },
      () => {
        // Stopping the music on purpose also rejects play(), and that's not a failure.
        if (attempt !== attempts || !active) return;
        active = false;
        music.update({ state: 'unavailable', track: null });
      },
    );
  };

  const quieten = () => {
    if (gap !== null) clearTimeout(gap);
    gap = null;
    if (!active) return;
    active = false;
    fadeTo(0, FADE_OUT_MS, () => {
      audio.pause();
    });
  };

  // Decides what the music should be doing now. Runs whenever something it depends on changes.
  function sync(): void {
    const { state } = music.get();
    if (state === 'unavailable') return;
    if (!wanted()) {
      quieten();
      music.update({ state: 'off' });
      return;
    }
    if (!interacted) {
      music.update({ state: 'waiting', track: current() });
      return;
    }
    if (!active && gap === null) {
      play();
      return;
    }
    const target = musicVolume(setting());
    if (state === 'playing' && fade === null && Math.abs(audio.volume - target) > 0.001) {
      fadeTo(target, VOLUME_CHANGE_MS);
    }
  }

  const onGesture = () => {
    if (interacted) return;
    interacted = true;
    sync();
  };
  const onEnded = () => {
    active = false;
    moveOn();
    music.update({ track: current() });
    gap = setTimeout(() => {
      gap = null;
      sync();
    }, GAP_MS);
  };
  for (const type of GESTURES) events.addEventListener(type, onGesture, { capture: true });
  audio.addEventListener('ended', onEnded);
  const stopWatching = progress.subscribe(sync);
  sync();

  return () => {
    stopWatching();
    for (const type of GESTURES) events.removeEventListener(type, onGesture, { capture: true });
    audio.removeEventListener('ended', onEnded);
    stopFade();
    if (gap !== null) clearTimeout(gap);
    active = false;
    audio.pause();
    music.update({ state: 'off', track: null });
  };
}
