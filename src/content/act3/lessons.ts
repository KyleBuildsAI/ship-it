import type { LessonInput } from '../../game/missions/lessonSchema';
import { toolsForBadDays } from './badDays';
import { conflictsWithoutPanic } from './conflicts';
import { conflictStorm } from './conflictStorm';
import { twoWaysToMerge } from './merging';
import { branchesArePointers } from './pointers';

/*
 * Act 3: Branching (DESIGN.md section 11), taught as lessons: Kyle decides what should
 * happen to branches and tells Otto, Quillwork's coding agent, rather than typing every
 * git command himself. Each lesson lives in its own file; this one sets the play order.
 */

export {
  branchesArePointers,
  conflictStorm,
  conflictsWithoutPanic,
  toolsForBadDays,
  twoWaysToMerge,
};

/** Act 3's lessons in play order, final last. */
export const act3Lessons: readonly LessonInput[] = [
  branchesArePointers,
  twoWaysToMerge,
  conflictsWithoutPanic,
  toolsForBadDays,
  conflictStorm,
];
