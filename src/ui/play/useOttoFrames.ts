import { useEffect } from 'react';
import { browserMotion } from '../../game/agent/browserMotion';
import { choosePace } from '../../game/agent/pace';
import { framePlay } from '../../game/play/play';
import { progress } from '../../game/progress';

/**
 * While `active`, moves Otto on once per drawn frame: a directed step, or a judgment
 * drill's scene (play.ts framePlay). It runs on the browser's frame clock rather than
 * useClock's four ticks a second, so his typing shows one key after another instead of in
 * bursts. The pace is chosen each frame, so a change to reduced motion reaches his next key.
 */
export function useOttoFrames(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let previous: number | null = null;
    let request = 0;
    const frame = (time: number) => {
      // The first frame has no previous one to measure from, so it moves Otto on by nothing.
      const elapsed = previous === null ? 0 : time - previous;
      previous = time;
      const reducedMotion = progress.get().save?.settings.reducedMotion ?? 'system';
      framePlay(elapsed, choosePace(browserMotion, { reducedMotion }));
      request = window.requestAnimationFrame(frame);
    };
    request = window.requestAnimationFrame(frame);
    return () => {
      window.cancelAnimationFrame(request);
    };
  }, [active]);
}
