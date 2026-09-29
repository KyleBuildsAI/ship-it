import type { Settings } from '../save/schema';
import type { FeedBeat, Typist } from './feed';

/** How fast Otto works, in milliseconds. All zero is instant: everything shows at once. */
export interface Pace {
  /** Per character he types. 25 ms is about 40 characters a second (spec 1.2). */
  readonly charMs: number;
  /** Before he starts typing a line, as if reading it over. */
  readonly thinkMs: number;
  /** After an action's result, so its output can be read and the world can move. */
  readonly settleMs: number;
}

export const NORMAL_PACE: Pace = { charMs: 25, thinkMs: 400, settleMs: 600 };
export const INSTANT_PACE: Pace = { charMs: 0, thinkMs: 0, settleMs: 0 };

/**
 * The two facts about the browser that make Otto instant. They're passed in rather than
 * read here, so this file stays pure and tests can set both. `browserMotion.ts` has the
 * real ones.
 */
export interface MotionEnvironment {
  /** The operating system asks for less motion (the prefers-reduced-motion media query). */
  readonly prefersReducedMotion: () => boolean;
  /** A test robot drives the browser (navigator.webdriver): waiting only slows the tests. */
  readonly automated: () => boolean;
}

export interface PaceOptions {
  /** The game's reduced-motion setting, where 'system' follows the operating system. */
  readonly reducedMotion?: Settings['reducedMotion'];
  /** How many times faster than normal: 2 for the 2× setting, 3 for a drill's scene. */
  readonly speed?: number | 'instant';
}

/**
 * Otto's pace for this player. Reduced motion (the setting, or the system's when the
 * setting follows it, as the world does) and a test robot both make him instant.
 */
export function choosePace(env: MotionEnvironment, options: PaceOptions = {}): Pace {
  const { reducedMotion = 'system', speed = 1 } = options;
  // Only code passes a speed, so a bad one is a bug. It's checked before the instant cases,
  // or the end-to-end tests, where a test robot always makes Otto instant, would hide it.
  if (speed !== 'instant' && !(speed > 0))
    throw new RangeError(`Otto's speed must be above 0, not ${String(speed)}.`);
  const reduced = reducedMotion === 'on' || (reducedMotion !== 'off' && env.prefersReducedMotion());
  if (reduced || env.automated() || speed === 'instant') return INSTANT_PACE;
  return {
    charMs: NORMAL_PACE.charMs / speed,
    thinkMs: NORMAL_PACE.thinkMs / speed,
    settleMs: NORMAL_PACE.settleMs / speed,
  };
}

/**
 * When a beat plays: `lead` ms of waiting before it shows, then `span` ms while it plays.
 * Both are whole milliseconds. A 3× pace has fractions like 8.333…, and adding them up in
 * `totalMs` then taking them away one by one in `advance` can leave a hair of time over,
 * so playing a list for exactly its `totalMs` would stop just short of done.
 */
export function timing(beat: FeedBeat, pace: Pace): { lead: number; span: number } {
  // Kyle's own look lines appear at once: he clicked a chip, so there's no typing to watch.
  if (beat.kind === 'type' && beat.by === 'otto')
    return { lead: Math.round(pace.thinkMs), span: Math.round(beat.text.length * pace.charMs) };
  if (beat.kind === 'result') return { lead: 0, span: Math.round(pace.settleMs) };
  return { lead: 0, span: 0 };
}

/** How long a list of beats takes to play, start to finish. */
export function totalMs(beats: readonly FeedBeat[], pace: Pace): number {
  return beats.reduce((sum, beat) => {
    const { lead, span } = timing(beat, pace);
    return sum + lead + span;
  }, 0);
}

/** How far playback has got through a list of beats. */
export interface Playhead {
  /** The beat playing now. It equals the number of beats once they've all played. */
  readonly beat: number;
  /** Milliseconds spent on that beat so far, its lead included. */
  readonly spent: number;
  /** How much of it is on screen: characters for a typed line, 1 for any other beat. */
  readonly shown: number;
}

export const START: Playhead = { beat: 0, spent: 0, shown: 0 };

/** Something to draw now: a whole beat, or the next characters of a typed line. */
export type Reveal =
  | { readonly kind: 'beat'; readonly beat: FeedBeat }
  | {
      readonly kind: 'keys';
      readonly tab: number;
      readonly by: Typist;
      readonly text: string;
      /** Where in the line these characters start; 0 is its first. */
      readonly from: number;
    };

export interface Advanced {
  readonly head: Playhead;
  readonly reveals: readonly Reveal[];
  /** Every beat has played, the last one's settling included. */
  readonly done: boolean;
}

/**
 * Moves playback on by `elapsedMs` and returns what appeared in that time. It's a pure
 * step, so tests can jump to any moment. At the instant pace, one call shows everything.
 *
 * Call it once per drawn frame, with the time since the previous frame. A slower clock
 * shows the typing in bursts: the game's `tickPlay` runs only 4 times a second, which at
 * 40 characters a second prints 10 at a time instead of one after another.
 */
export function advance(
  beats: readonly FeedBeat[],
  pace: Pace,
  head: Playhead,
  elapsedMs: number,
): Advanced {
  const reveals: Reveal[] = [];
  let { beat: index, shown } = head;
  // Only time moving forward counts. A clock that stepped back, or NaN from a first frame
  // with no previous time to subtract, adds nothing. NaN left in would make every check
  // below false: the typed line would be skipped and playback would claim it was done.
  let spent = head.spent + (elapsedMs > 0 ? elapsedMs : 0);
  for (let beat = beats[index]; beat !== undefined; beat = beats[index]) {
    const { lead, span } = timing(beat, pace);
    // Never backwards: if the pace slows mid-line (2× back to 1×), what's typed stays typed
    // and the next keys carry on from there instead of typing the line again.
    const target = Math.max(shown, showing(beat, lead, span, spent));
    if (target > shown) reveals.push(reveal(beat, shown, target));
    shown = target;
    if (spent < lead + span) return { head: { beat: index, spent, shown }, reveals, done: false };
    // The leftover time carries into the next beat, so a long frame loses nothing.
    spent -= lead + span;
    index += 1;
    shown = 0;
  }
  return { head: { beat: index, spent: 0, shown: 0 }, reveals, done: true };
}

/** How much of a beat is on screen once `spent` ms of it have passed. */
function showing(beat: FeedBeat, lead: number, span: number, spent: number): number {
  if (spent < lead) return 0;
  if (beat.kind !== 'type') return 1;
  // Finished outright, so rounding can never hold back the last character.
  if (spent >= lead + span) return beat.text.length;
  return Math.floor(((spent - lead) / span) * beat.text.length);
}

function reveal(beat: FeedBeat, from: number, to: number): Reveal {
  if (beat.kind !== 'type') return { kind: 'beat', beat };
  return { kind: 'keys', tab: beat.tab, by: beat.by, text: beat.text.slice(from, to), from };
}
