import type { LessonInput } from '../../game/missions/lessonSchema';
import { lintAndTypes } from './lintAndTypes';
import { readingCi } from './readingCi';
import { redCi } from './redCi';
import { secretsAndUpdates } from './secretsAndUpdates';
import { testsAreGuardrails } from './testsAreGuardrails';

/*
 * Act 5: Quality Gates (DESIGN.md section 11), taught as lessons: tests, types, lint and
 * CI are what turn Otto's confident change into a checked one. Each lesson lives in its
 * own file so a card is easy to find; this list is the play order, final last.
 */
export const act5Lessons: readonly LessonInput[] = [
  testsAreGuardrails,
  lintAndTypes,
  readingCi,
  secretsAndUpdates,
  redCi,
];

export { lintAndTypes, readingCi, redCi, secretsAndUpdates, testsAreGuardrails };
