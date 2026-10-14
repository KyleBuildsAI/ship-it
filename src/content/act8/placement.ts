import type { LessonPlacementInput } from '../../game/missions/schema';

/*
 * Act 8's placement test (DESIGN.md section 5, Lessons): for a player who has sat real
 * interview loops already. It borrows three cards from each of the four lessons, never
 * from the final, which is the Act's boss and stays open after testing out. Each lesson
 * lends a judgment card, a card about reading code or evidence, and one about what to tell
 * Otto, because those three are what the whole loop tests.
 */

/** The cards it asks, by lesson, in the order the lessons are played. */
export const act8PlacementCards = {
  'think-out-loud': ['off-by-one', 'reading-order', 'prove-the-fix'],
  'debug-from-symptoms': ['read-traceback', 'what-changed', 'repro-first'],
  'design-trade-offs': ['requirements-first', 'read-heavy', 'brief-a-design'],
  'customers-and-your-story': ['listen-first', 'draft-reply', 'disagree'],
} as const;

const cardIds = Object.values(act8PlacementCards).flat();

export const act8Placement = {
  pitch:
    'Done real interview loops before? Score 85% on twelve cards to test out of the four lessons.',
  cardIds,
  // 40 seconds a card, the same pace as the final, so knowing it is what passes, not speed.
  timeLimitSeconds: cardIds.length * 40,
} satisfies LessonPlacementInput;
