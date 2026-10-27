import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createBeatPlayer, easeInOut, phase, type Beat } from './beatPlayer';

/** A beat that records every frame it draws and every reset, in place of meshes. */
function recordingBeat(seconds = 2) {
  const frames: number[] = [];
  let resets = 0;
  let starts = 0;
  const beat: Beat = {
    seconds,
    start: () => {
      starts += 1;
      return {
        frame: (progress) => frames.push(progress),
        reset: () => {
          resets += 1;
        },
      };
    },
  };
  return { beat, frames, resets: () => resets, starts: () => starts };
}

describe('easing a beat', () => {
  it('runs from 0 to 1, clamped, and splits into phases', () => {
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(0.5)).toBe(0.5);
    expect(easeInOut(2)).toBe(1);
    expect(phase(0.25, 0, 0.5)).toBe(0.5);
    expect(phase(0.1, 0.5, 1)).toBe(0);
    expect(phase(0.9, 0, 0.5)).toBe(1);
  });
});

describe('the beat player', () => {
  it('plays a beat over its seconds from the first frame after it starts, then holds it', () => {
    const grow = recordingBeat(2);
    const player = createBeatPlayer({ grow: grow.beat }, false);
    player.play('grow');
    expect(player.current()).toBe('grow');
    player.update(10);
    player.update(11);
    player.update(12);
    expect(grow.frames).toEqual([0, 0, 0.5, 1]);
    // Held: the last frame is drawn again every frame, so the island's idle motion,
    // which runs first, can't undo the picture.
    player.update(13);
    player.update(14);
    expect(grow.frames).toEqual([0, 0, 0.5, 1, 1, 1]);
    expect(player.current()).toBe('grow');
  });

  it('resets the playing beat before the next one, and when stopped', () => {
    const first = recordingBeat();
    const second = recordingBeat();
    const player = createBeatPlayer({ first: first.beat, second: second.beat }, false);
    player.play('first');
    player.play('second');
    expect(first.resets()).toBe(1);
    expect(player.current()).toBe('second');
    player.play(null);
    expect(second.resets()).toBe(1);
    expect(player.current()).toBeNull();
  });

  it('replays the same beat from its start when asked again', () => {
    const grow = recordingBeat();
    const player = createBeatPlayer({ grow: grow.beat }, false);
    player.play('grow');
    player.play('grow');
    expect(grow.starts()).toBe(2);
    expect(grow.resets()).toBe(1);
  });

  it('plays nothing for a beat it does not have, and says so in the console', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const grow = recordingBeat();
    const player = createBeatPlayer({ grow: grow.beat }, false);
    player.play('grow');
    player.play('no-such-beat');
    expect(grow.resets()).toBe(1);
    expect(player.current()).toBeNull();
    expect(errors).toHaveBeenCalledWith('[ship-it] island has no beat', 'no-such-beat');
    errors.mockRestore();
  });

  describe('a beat whose code throws', () => {
    /** A beat that throws from the step named, and counts its resets. */
    function brokenBeat(step: 'start' | 'frame' | 'reset') {
      let resets = 0;
      const beat: Beat = {
        seconds: 2,
        start: () => {
          if (step === 'start') throw new Error('broken start');
          return {
            frame: (progress) => {
              if (step === 'frame' && progress > 0) throw new Error('broken frame');
            },
            reset: () => {
              resets += 1;
              if (step === 'reset') throw new Error('broken reset');
            },
          };
        },
      };
      return { beat, resets: () => resets };
    }

    let errors: MockInstance<typeof console.error>;
    beforeEach(() => {
      errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => {
      errors.mockRestore();
    });

    it('fails to start without throwing, and leaves nothing playing', () => {
      const player = createBeatPlayer({ broken: brokenBeat('start').beat }, false);
      expect(() => {
        player.play('broken');
      }).not.toThrow();
      expect(player.current()).toBeNull();
      expect(errors).toHaveBeenCalledTimes(1);
    });

    it('is dropped and reset when a frame throws, then never drawn again', () => {
      const broken = brokenBeat('frame');
      const player = createBeatPlayer({ broken: broken.beat }, false);
      player.play('broken');
      player.update(10);
      expect(() => {
        player.update(11);
      }).not.toThrow();
      expect(player.current()).toBeNull();
      expect(broken.resets()).toBe(1);
      player.update(12);
      expect(errors).toHaveBeenCalledTimes(1);
    });

    it('is reported when even its reset throws, and the next beat still plays', () => {
      const grow = recordingBeat();
      const player = createBeatPlayer({ broken: brokenBeat('reset').beat, grow: grow.beat }, false);
      player.play('broken');
      expect(() => {
        player.play('grow');
      }).not.toThrow();
      expect(player.current()).toBe('grow');
      expect(errors).toHaveBeenCalledTimes(1);
    });
  });

  it('jumps straight to the last frame with reduced motion', () => {
    const grow = recordingBeat();
    const player = createBeatPlayer({ grow: grow.beat }, true);
    player.play('grow');
    expect(grow.frames).toEqual([1]);
    // Every frame after redraws only the last one, over whatever the idle motion moved.
    player.update(1);
    player.update(5);
    expect(grow.frames).toEqual([1, 1, 1]);
  });
});
