import type { MotionEnvironment } from './pace';

/**
 * The real browser behind `choosePace`. It lives apart from pace.ts, which stays pure, and
 * it asks each time, so a change to the Windows setting reaches Otto's next line.
 */
export const browserMotion: MotionEnvironment = {
  prefersReducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  automated: () => navigator.webdriver,
};
