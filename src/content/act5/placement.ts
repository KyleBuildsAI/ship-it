import type { LessonPlacementInput } from '../../game/missions/schema';

/**
 * Act 5's placement test (DESIGN.md section 5, Lessons): three cards from each lesson
 * before the final, so testing out still proves every idea in the Act. Each set is one
 * artifact to read, one thing to tell Otto, and the lesson's order card, because reading,
 * directing and sequencing are all the skill. The Red CI final is the boss and stays open
 * after testing out, so none of its cards are here.
 *
 * 85% of 12 cards is 10.2, so a pass needs 11 right: one miss allowed. The pitch says so,
 * rather than letting "85%" suggest two.
 */
export const act5Placement: LessonPlacementInput = {
  pitch:
    'Already ship behind tests, lint and CI? 12 cards: get 11 right to test out. Red CI stays open.',
  cardIds: [
    // 5.1 Tests Are Guardrails
    'read-failure',
    'test-first',
    'bug-fix-loop',
    // 5.2 Lint and Types
    'type-error',
    'no-ts-ignore',
    'local-gates',
    // 5.3 Reading CI
    'actions-log',
    'claims-green',
    'push-to-check',
    // 5.4 Secrets and Updates
    'secret-in-ci',
    'leaked-key',
    'leak-steps',
  ],
  // 35 seconds a card: brisker than the final's 40, for players who know this already.
  timeLimitSeconds: 420,
};
