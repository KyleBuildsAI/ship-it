import { lessonAct, type LessonActContent } from '../../content/lessonAct';
import type { LessonInput } from './lessonSchema';
import type { FieldMissionInput, LessonPlacementInput } from './schema';
import { sampleFinalInput, sampleLessonInput } from './sample.test-lesson';

/*
 * A finished lesson Act with every part an Act can have: its lessons, a placement test of
 * cards borrowed from them, a timed final as its boss, and a Field Mission. It's test data,
 * never shipped, numbered 6 so it can sit in a catalog beside the other samples (Acts 2
 * and 4), and every id starts with "sample-full-" so nothing can collide with it.
 */

/** A copy of the sample lesson whose card ids are its own: a placement names cards by id. */
function lessonWithOwnCards(id: string, title: string): LessonInput {
  return {
    ...sampleLessonInput,
    id,
    act: 6,
    title,
    cards: sampleLessonInput.cards.map((card) => ({ ...card, id: `${id}-${card.id}` })),
  };
}

const firstLesson = lessonWithOwnCards('sample-full-review', 'Review the PR (full sample)');
const secondLesson = lessonWithOwnCards('sample-full-brief', 'Brief the Fix (full sample)');

const finalLesson: LessonInput = {
  ...sampleFinalInput,
  id: 'sample-full-final',
  act: 6,
  title: 'Release Day (full sample final)',
};

/** The card ids of a lesson by position, so the placement reads like content would. */
function cardIdsOf(lesson: LessonInput, ...positions: number[]): string[] {
  return positions.map((position) => `${lesson.id}-${sampleLessonInput.cards[position]?.id ?? ''}`);
}

/** Three cards from each lesson, on a 4-minute clock: 40 seconds a card. */
export const fullSamplePlacement = {
  pitch: 'Know PR review already? 85% tests out.',
  cardIds: [...cardIdsOf(firstLesson, 0, 1, 2), ...cardIdsOf(secondLesson, 3, 4, 5)],
  timeLimitSeconds: 240,
} satisfies LessonPlacementInput;

/** A Field Mission outside Act 2, to prove any Act's works the same way. */
export const fullSampleFieldMission = {
  id: 'sample-full-field',
  title: 'Land a Real Branch (sample)',
  repoName: 'SandCastles',
  briefing: ['Do the real thing on your own repo: land one feature branch, then check it.'],
  checklist: [
    { id: 'branch', text: 'Make a branch, commit your change on it, and merge it into main.' },
  ],
  verifications: [
    {
      id: 'sample-full-clean',
      instruction: 'Run git status in your repo and paste everything it prints.',
      command: 'git status',
      parser: 'status-long',
      check: { kind: 'clean' },
    },
    {
      id: 'sample-full-history',
      instruction: 'Run git log --oneline -3 and paste the three lines.',
      command: 'git log --oneline -3',
      parser: 'log-oneline',
      check: { kind: 'minCommits', count: 3 },
    },
  ],
  github: {
    instruction: 'Optional: let GitHub confirm the PR that landed it.',
    sections: ['What changed', 'Why'],
  },
} satisfies FieldMissionInput;

/** The finished sample Act, parsed the way a real lesson Act is (src/content/lessonAct.ts). */
export function fullSampleLessonAct(): LessonActContent {
  return lessonAct(6, 'How Systems Work (full sample)', [firstLesson, secondLesson, finalLesson], {
    placementTest: fullSamplePlacement,
    fieldMission: fullSampleFieldMission,
  });
}
