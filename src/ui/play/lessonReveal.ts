import type { MotionEnvironment } from '../../game/agent/pace';
import type { CardState } from '../../game/missions/lessonRunner';
import type { Settings } from '../../game/save/schema';

/*
 * When and how a lesson card brings its newest result into view (LessonView.tsx). The
 * result lands under the options, which on a long card is below the play panel's fold.
 */

/**
 * How many answers the card on screen has taken: every pick, every wrong "Check order" or
 * "Check review", the check that passed a review, and the answer that solved it. It grows
 * with each answer and is 0 on a fresh card, so a change means there is a new result to show.
 */
export function answersOn(card: CardState): number {
  const checks = (card.review?.wrongChecks ?? 0) + (card.review?.passed === true ? 1 : 0);
  return card.picked.length + card.wrongOrders + checks + (card.solved ? 1 : 0);
}

/**
 * How the panel scrolls to a new result: smoothly, or at once under reduced motion (the
 * game's setting, or the system's while the setting follows it) or a test robot, which
 * should never have to wait for a scroll to settle.
 */
export function revealBehavior(
  env: MotionEnvironment,
  reducedMotion: Settings['reducedMotion'],
): ScrollBehavior {
  const reduced = reducedMotion === 'on' || (reducedMotion !== 'off' && env.prefersReducedMotion());
  return reduced || env.automated() ? 'instant' : 'smooth';
}
