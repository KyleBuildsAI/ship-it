import type { LessonPlacementInput } from '../../game/missions/schema';

/**
 * Act 5's placement test (DESIGN.md section 5, Lessons): three cards from each lesson
 * before the final, so testing out still proves every idea in the Act. Each set mixes
 * reading an artifact with telling Otto what to do, because both are the skill. The Red CI
 * final is the boss and stays open after testing out, so none of its cards are here.
 */
export const act5Placement: LessonPlacementInput = {
  pitch: 'Already ship behind tests, lint and CI? 85% tests out of the lessons. Red CI stays open.',
  cardIds: [
    // 5.1 Tests Are Guardrails
    'read-failure',
    'test-first',
    'weakened-test',
    // 5.2 Lint and Types
    'type-error',
    'no-ts-ignore',
    'green-means',
    // 5.3 Reading CI
    'read-workflow',
    'actions-log',
    'claims-green',
    // 5.4 Secrets and Updates
    'secret-in-ci',
    'leaked-key',
    'major-bump',
  ],
  // 35 seconds a card: brisker than the final's 40, for players who know this already.
  timeLimitSeconds: 420,
};
