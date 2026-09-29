import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserMotion } from './browserMotion';
import type { FeedBeat } from './feed';
import {
  advance,
  choosePace,
  INSTANT_PACE,
  NORMAL_PACE,
  START,
  totalMs,
  type MotionEnvironment,
  type Playhead,
} from './pace';

/** A browser with the given answers, so each test sets both environment reads itself. */
const env = (reduced: boolean, automated = false): MotionEnvironment => ({
  prefersReducedMotion: () => reduced,
  automated: () => automated,
});

/** Otto runs `cd api`: a prompt, the typed line, Enter, one line of output, the result. */
const CD_API: readonly FeedBeat[] = [
  { kind: 'prompt', tab: 1, text: 'PS C:\\Users\\kyle> ' },
  { kind: 'type', tab: 1, text: 'cd api', by: 'otto' },
  { kind: 'enter', tab: 1 },
  { kind: 'output', tab: 1, lines: [{ text: 'Set-Location: Cannot find path', tone: 'error' }] },
  { kind: 'result', tab: 1, exitCode: 1, asking: false },
];

describe('choosePace', () => {
  it('types about 40 characters a second by default', () => {
    expect(choosePace(env(false))).toEqual(NORMAL_PACE);
    expect(1000 / NORMAL_PACE.charMs).toBe(40);
  });

  it("is instant under reduced motion, whether it's the setting or the system's", () => {
    expect(choosePace(env(true))).toEqual(INSTANT_PACE);
    expect(choosePace(env(false), { reducedMotion: 'on' })).toEqual(INSTANT_PACE);
    // The player turned motion back on, overriding Windows, as the world does.
    expect(choosePace(env(true), { reducedMotion: 'off' })).toEqual(NORMAL_PACE);
  });

  it('is instant when a test robot drives the browser, whatever the setting', () => {
    expect(choosePace(env(false, true), { reducedMotion: 'off' })).toEqual(INSTANT_PACE);
  });

  it('speeds up by a factor, or to instant, and refuses a speed of 0', () => {
    expect(choosePace(env(false), { speed: 2 })).toEqual({
      charMs: 12.5,
      thinkMs: 200,
      settleMs: 300,
    });
    expect(choosePace(env(false), { speed: 'instant' })).toEqual(INSTANT_PACE);
    expect(() => choosePace(env(false), { speed: 0 })).toThrow(RangeError);
  });

  it('refuses a bad speed even when Otto would be instant anyway', () => {
    // Playwright always runs as a test robot, so this is where a bad speed must still fail.
    expect(() => choosePace(env(false, true), { speed: 0 })).toThrow(RangeError);
    expect(() => choosePace(env(true), { speed: -1 })).toThrow(RangeError);
    expect(() => choosePace(env(false, true), { speed: Number.NaN })).toThrow(RangeError);
  });
});

describe('advance', () => {
  /** Plays on by each step in turn, returning the reveals of each as short strings. */
  function play(pace = NORMAL_PACE, ...steps: number[]) {
    let head: Playhead = START;
    return steps.map((elapsed) => {
      const next = advance(CD_API, pace, head, elapsed);
      head = next.head;
      const shown = next.reveals.map((r) => (r.kind === 'keys' ? `keys:${r.text}` : r.beat.kind));
      return { shown, done: next.done };
    });
  }

  it('shows the prompt, waits, then types the line a few characters at a time', () => {
    const [start, thinking, typing, rest, settling, settled] = play(
      NORMAL_PACE,
      0,
      NORMAL_PACE.thinkMs,
      50,
      100,
      NORMAL_PACE.settleMs - 1,
      1,
    );
    expect(start).toEqual({ shown: ['prompt'], done: false });
    expect(thinking).toEqual({ shown: [], done: false });
    expect(typing).toEqual({ shown: ['keys:cd'], done: false });
    expect(rest).toEqual({ shown: ['keys: api', 'enter', 'output', 'result'], done: false });
    // The result waits out the settle, so the world can move before Otto's next line.
    expect(settling).toEqual({ shown: [], done: false });
    expect(settled).toEqual({ shown: [], done: true });
  });

  it('says where in the line each run of keys starts', () => {
    const typed = advance(CD_API, NORMAL_PACE, START, NORMAL_PACE.thinkMs + 50);
    const more = advance(CD_API, NORMAL_PACE, typed.head, 25);
    expect(more.reveals).toEqual([{ kind: 'keys', tab: 1, by: 'otto', text: ' ', from: 2 }]);
  });

  it('carries a long frame into the next beats, so nothing is lost', () => {
    const [all] = play(NORMAL_PACE, totalMs(CD_API, NORMAL_PACE));
    expect(all).toEqual({
      shown: ['prompt', 'keys:cd api', 'enter', 'output', 'result'],
      done: true,
    });
  });

  it('shows everything in one call at the instant pace, and ignores time going backwards', () => {
    expect(play(INSTANT_PACE, -5)).toEqual([
      { shown: ['prompt', 'keys:cd api', 'enter', 'output', 'result'], done: true },
    ]);
  });

  it('counts a gap that is not a number as no time, so the typed line still plays', () => {
    // A first frame with no previous time: `now - undefined` is NaN.
    const first = advance(CD_API, NORMAL_PACE, START, Number.NaN);
    expect(first.reveals.map((r) => r.kind)).toEqual(['beat']);
    expect(first.done).toBe(false);
    const rest = advance(CD_API, NORMAL_PACE, first.head, totalMs(CD_API, NORMAL_PACE));
    expect(rest.reveals[0]).toEqual({ kind: 'keys', tab: 1, by: 'otto', text: 'cd api', from: 0 });
  });

  it('never types a character twice when the pace slows down mid-line', () => {
    const line: FeedBeat = { kind: 'type', tab: 1, text: 'mkdir notes', by: 'otto' };
    const fast = choosePace(env(false), { speed: 2 });
    const typed: string[] = [];
    let step = advance([line], fast, START, fast.thinkMs + 5 * fast.charMs);
    for (let frame = 0; frame < 200 && !step.done; frame += 1) {
      for (const r of step.reveals) if (r.kind === 'keys') typed.push(r.text);
      // The player switched 2× back to 1× while the line was being typed.
      step = advance([line], NORMAL_PACE, step.head, 16);
    }
    for (const r of step.reveals) if (r.kind === 'keys') typed.push(r.text);
    expect(typed.join('')).toBe('mkdir notes');
    expect(step.done).toBe(true);
  });

  it("types Kyle's look lines at once, with no pause to think", () => {
    const look: FeedBeat = { kind: 'type', tab: 1, text: 'Get-Location', by: 'kyle' };
    const shown = advance([look], NORMAL_PACE, START, 0);
    expect(shown.reveals).toEqual([
      { kind: 'keys', tab: 1, by: 'kyle', text: 'Get-Location', from: 0 },
    ]);
    expect(shown.done).toBe(true);
  });
});

describe('totalMs', () => {
  it('adds the pause to think, the typing, and the settle', () => {
    expect(totalMs(CD_API, NORMAL_PACE)).toBe(400 + 6 * 25 + 600);
    expect(totalMs(CD_API, INSTANT_PACE)).toBe(0);
  });

  it("is exactly when playback ends, even at a drill's 3× pace", () => {
    const drill = choosePace(env(false), { speed: 3 });
    const unfinished: number[] = [];
    // Two lines of every length up to 60: fractions of a millisecond must never add up to
    // a playhead a hair short of the end.
    for (let length = 1; length <= 60; length += 1) {
      const beats = [...CD_API, ...CD_API].map((beat) =>
        beat.kind === 'type' ? { ...beat, text: 'x'.repeat(length) } : beat,
      );
      if (!advance(beats, drill, START, totalMs(beats, drill)).done) unfinished.push(length);
    }
    expect(unfinished).toEqual([]);
  });
});

describe('browserMotion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the system's reduced-motion query and the automation flag each time", () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('window', { matchMedia });
    vi.stubGlobal('navigator', { webdriver: false });
    expect(browserMotion.prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(browserMotion.automated()).toBe(false);
    vi.stubGlobal('navigator', { webdriver: true });
    expect(choosePace(browserMotion, { reducedMotion: 'off' })).toEqual(INSTANT_PACE);
  });
});
