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
  const reduced = reducedMotion === 'on' || (reducedMotion !== 'off' && env.prefersReducedMotion());
  if (reduced || env.automated() || speed === 'instant') return INSTANT_PACE;
  if (!(speed > 0)) throw new RangeError(`Otto's speed must be above 0, not ${String(speed)}.`);
  return {
    charMs: NORMAL_PACE.charMs / speed,
    thinkMs: NORMAL_PACE.thinkMs / speed,
    settleMs: NORMAL_PACE.settleMs / speed,
  };
}

/** When a beat plays: `lead` ms of waiting before it shows, then `span` ms while it plays. */
export function timing(beat: FeedBeat, pace: Pace): { lead: number; span: number } {
  // Kyle's own look lines appear at once: he clicked a chip, so there's no typing to watch.
  if (beat.kind === 'type' && beat.by === 'otto')
    return { lead: pace.thinkMs, span: beat.text.length * pace.charMs };
  if (beat.kind === 'result') return { lead: 0, span: pace.settleMs };
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
 * Moves playback on by `elapsedMs` (the time since the last frame) and returns what
 * appeared in that time. It's a pure step, so the game's tick drives it and tests can
 * jump to any moment. At the instant pace, one call shows everything.
 */
export function advance(
  beats: readonly FeedBeat[],
  pace: Pace,
  head: Playhead,
  elapsedMs: number,
): Advanced {
  const reveals: Reveal[] = [];
  let { beat: index, shown } = head;
  let spent = head.spent + Math.max(0, elapsedMs);
  for (let beat = beats[index]; beat !== undefined; beat = beats[index]) {
    const { lead, span } = timing(beat, pace);
    const target = showing(beat, lead, span, spent);
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
