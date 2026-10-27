/*
 * Plays an island's lesson scenes ("beats", see beats.ts) one at a time on the world's own
 * update loop. It knows nothing of three.js: a beat is a function that sets the scene up
 * and hands back how to draw any moment of it and how to put the island back. That keeps
 * the timing rules here, where they're unit tested, and the meshes in the island files.
 */

/** One playing of a beat: draw a moment of it, or undo it. */
export interface BeatRun {
  /** Draws the beat at `progress`, from 0 (just started) to 1 (finished, and held). */
  readonly frame: (progress: number) => void;
  /** Puts the island back to its idle look: removes what the beat added, undoes its moves. */
  readonly reset: () => void;
}

export interface Beat {
  /** How long the beat plays, about 1.5 to 3 seconds. */
  readonly seconds: number;
  /** Sets the beat up from the idle island and returns its run. */
  readonly start: () => BeatRun;
}

export interface BeatPlayer {
  /**
   * Starts a beat, ending any playing one first; null just ends it. An id the island
   * doesn't have plays nothing and is reported in the console, since a card named it.
   */
  play: (id: string | null) => void;
  /** Called every frame with the world's clock, in seconds. */
  update: (elapsed: number) => void;
  /** The beat playing or held now, if any. */
  current: () => string | null;
}

/** Eases a beat's progress so motion starts and settles gently rather than linearly. */
export function easeInOut(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return clamped < 0.5 ? 2 * clamped * clamped : 1 - (-2 * clamped + 2) ** 2 / 2;
}

/**
 * The part of a beat's progress that falls in [from, to], as 0 to 1, so one beat can play
 * in steps: `phase(progress, 0, 0.5)` is the first half, eased.
 */
export function phase(progress: number, from: number, to: number): number {
  return easeInOut((progress - from) / (to - from));
}

/**
 * A beat holds its last frame until the next beat or the end of the lesson, so the card's
 * picture stays up while Kyle reads. With reduced motion it jumps straight to that frame.
 */
export function createBeatPlayer(
  beats: Readonly<Record<string, Beat>>,
  reducedMotion: boolean,
): BeatPlayer {
  let playing: {
    id: string;
    beat: Beat;
    run: BeatRun;
    startedAt: number | null;
    /**
     * True once the last frame is reached. A held beat still draws that frame every frame:
     * the island's idle motion runs first and may move the same props, and the beat's
     * picture must win. A frame is a few property writes, so holding stays cheap.
     */
    held: boolean;
  } | null = null;

  const stop = () => {
    playing?.run.reset();
    playing = null;
  };

  return {
    play: (id) => {
      stop();
      if (id === null) return;
      const beat = beats[id];
      if (beat === undefined) {
        console.error('[ship-it] island has no beat', id);
        return;
      }
      const run = beat.start();
      playing = { id, beat, run, startedAt: null, held: reducedMotion };
      run.frame(reducedMotion ? 1 : 0);
    },
    update: (elapsed) => {
      if (playing === null) return;
      if (playing.held) {
        playing.run.frame(1);
        return;
      }
      // The clock starts on the first frame after play, so a beat cued between frames
      // still shows from its beginning.
      playing.startedAt ??= elapsed;
      const progress = (elapsed - playing.startedAt) / playing.beat.seconds;
      playing.held = progress >= 1;
      playing.run.frame(Math.min(1, progress));
    },
    current: () => playing?.id ?? null,
  };
}
