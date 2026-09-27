import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../../content/music';
import { progress } from '../progress';
import { createDefaultSave } from '../save/schema';
import { TEST_NOW } from '../save/testFixtures';
import { FADE_IN_MS, FADE_OUT_MS, GAP_MS, music, startMusic, type AudioLike } from './music';
import { MUSIC_LEVEL, musicVolume } from './playlist';

type AudioEvent = 'ended';

/** Plays nothing, but behaves like an audio element: play() answers the way a test says. */
class FakeAudio implements AudioLike {
  src = '';
  volume = 1;
  paused = true;
  answer: () => Promise<void> = () => Promise.resolve();
  private readonly listeners = new Map<AudioEvent, Set<() => void>>();

  play(): Promise<void> {
    this.paused = false;
    return this.answer();
  }
  pause(): void {
    this.paused = true;
  }
  addEventListener(type: AudioEvent, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: AudioEvent, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: AudioEvent): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

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

function withVolume(audioVolume: number) {
  const save = createDefaultSave(TEST_NOW);
  progress.update({
    status: 'ready',
    save: { ...save, settings: { ...save.settings, audioVolume } },
    problem: null,
  });
}

/** Lets play()'s promise settle, then runs the timers due in `ms`. */
async function advance(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('the music player', () => {
  let audio: FakeAudio;
  let events: EventTarget;

  let stop: () => void = () => undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    audio = new FakeAudio();
    events = new EventTarget();
    withVolume(1);
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  const begin = () => {
    stop = startMusic({
      audio,
      tracks: TRACKS,
      random: KEEP_ORDER,
      events,
    });
  };
  const click = () => events.dispatchEvent(new Event('pointerdown'));

  it('waits for a click or key press before making a sound', async () => {
    begin();
    await advance(1000);

    expect(music.get()).toEqual({ state: 'waiting', track: TRACKS[0] });
    expect(audio.paused).toBe(true);
  });

  it('starts the first piece on the first click and fades it in', async () => {
    begin();
    click();
    await advance();

    expect(audio.src).toBe(TRACKS[0]?.url);
    expect(music.get().state).toBe('playing');
    expect(audio.volume).toBe(0);

    await advance(FADE_IN_MS / 2);
    expect(audio.volume).toBeCloseTo(MUSIC_LEVEL / 2);
    await advance(FADE_IN_MS / 2);
    expect(audio.volume).toBeCloseTo(MUSIC_LEVEL);
  });

  it('a key press counts as the first interaction too', async () => {
    begin();
    events.dispatchEvent(new Event('keydown'));
    await advance();

    expect(music.get().state).toBe('playing');
  });

  it('leaves a short silence, then plays the next piece', async () => {
    begin();
    click();
    await advance(FADE_IN_MS);
    audio.emit('ended');

    expect(music.get().track).toEqual(TRACKS[1]);
    await advance(GAP_MS - 100);
    expect(audio.src).toBe(TRACKS[0]?.url);
    await advance(100);
    expect(audio.src).toBe(TRACKS[1]?.url);
  });

  it('starts a fresh round after the last piece', async () => {
    begin();
    click();
    for (const piece of TRACKS) {
      await advance(FADE_IN_MS);
      expect(audio.src).toBe(piece.url);
      audio.emit('ended');
      await advance(GAP_MS);
    }

    expect(audio.src).toBe(TRACKS[0]?.url);
    expect(music.get().track).toEqual(TRACKS[0]);
  });

  it('says unavailable when a piece fails to load', async () => {
    audio.answer = () => Promise.reject(new DOMException('offline', 'NetworkError'));
    begin();
    click();
    await advance();

    expect(music.get()).toEqual({ state: 'unavailable', track: null });
  });

  it('fades out and stops when the volume goes to 0, and comes back when raised', async () => {
    begin();
    click();
    await advance(FADE_IN_MS);

    withVolume(0);
    expect(music.get().state).toBe('off');
    await advance(FADE_OUT_MS);
    expect(audio.paused).toBe(true);
    expect(audio.volume).toBe(0);

    withVolume(0.5);
    await advance(FADE_IN_MS);
    expect(music.get().state).toBe('playing');
    expect(audio.volume).toBeCloseTo(musicVolume(0.5));
  });

  it('follows the volume setting while playing', async () => {
    begin();
    click();
    await advance(FADE_IN_MS);

    withVolume(0.25);
    await advance(1000);

    expect(audio.volume).toBeCloseTo(musicVolume(0.25));
  });

  it('goes quiet when another tab takes the save', async () => {
    begin();
    click();
    await advance(FADE_IN_MS);

    progress.update({ status: 'elsewhere' });
    await advance(FADE_OUT_MS);

    expect(music.get().state).toBe('off');
    expect(audio.paused).toBe(true);
  });

  it('stays silent until the save has loaded', async () => {
    progress.update({ status: 'loading', save: null });
    begin();
    click();
    await advance();
    expect(music.get().state).toBe('off');

    withVolume(1);
    await advance();
    expect(music.get().state).toBe('playing');
  });

  it('stops everything when stopped', async () => {
    begin();
    click();
    await advance(FADE_IN_MS);

    stop();

    expect(audio.paused).toBe(true);
    expect(music.get()).toEqual({ state: 'off', track: null });
  });
});
