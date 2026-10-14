import { describe, expect, it } from 'vitest';
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
    player.update(13);
    expect(grow.frames).toEqual([0, 0, 0.5, 1]);
    // Held: nothing more is drawn, and the picture stays up.
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

  it('ignores a beat it does not have, leaving the island idle', () => {
    const grow = recordingBeat();
    const player = createBeatPlayer({ grow: grow.beat }, false);
    player.play('grow');
    player.play('no-such-beat');
    expect(grow.resets()).toBe(1);
    expect(player.current()).toBeNull();
  });

  it('jumps straight to the last frame with reduced motion', () => {
    const grow = recordingBeat();
    const player = createBeatPlayer({ grow: grow.beat }, true);
    player.play('grow');
    player.update(1);
    player.update(5);
    expect(grow.frames).toEqual([1]);
  });
});
