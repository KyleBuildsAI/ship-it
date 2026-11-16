import type { z } from 'zod';
import { finishLessonBriefing, nextCard, startLessonRun, type LessonRun } from './lessonRunner';
import {
  CodeReviewCardSchema,
  LessonSchema,
  type CodeReviewCard,
  type Lesson,
  type LessonInput,
} from './lessonSchema';
import { sampleLessonInput } from './sample.test-lesson';

/*
 * A sample code review card for tests: Otto's PR drops a permission check and swallows a
 * failed save. It is test data, never shipped. Its diff has 11 rows; rows 3-10 are the
 * changed ones, and each of them is in exactly one bug or one fine entry.
 */

export const sampleReviewCardInput = {
  id: 'flag-the-pr',
  kind: 'code-review',
  situation:
    'You asked Otto to let owners rename their documents. His PR #204 says: “Cleaner and safer. All checks pass ✅”',
  artifact: {
    kind: 'diff',
    label: 'PR #204 · src/docs/rename.ts',
    text: [
      ' export async function renameDoc(user: User, id: string, title: string) {',
      '   const doc = await db.docs.get(id);',
      '-  if (!canEdit(user, doc)) throw new Forbidden();',
      '-  await db.docs.update(id, { title });',
      '+  const name = title.trim();',
      '+  try {',
      '+    await db.docs.update(id, { title: name });',
      '+  } catch {',
      '+    return;',
      '+  }',
      ' }',
    ].join('\n'),
  },
  question: 'Flag each line that would hurt in production, and name its problem.',
  bugs: [
    {
      id: 'dropped-check',
      rows: [3],
      issues: ['security'],
      note: 'The edit check is gone: anyone who knows an id can rename any document.',
      clue: 'Read the removed lines too. What did they protect?',
    },
    {
      id: 'quiet-failure',
      rows: [6, 8, 9, 10],
      issues: ['error-handling'],
      note: 'A failed save now returns quietly, so the user thinks the rename worked.',
      clue: 'What happens now when the database is down?',
    },
  ],
  fine: [
    { row: 4, note: 'Fine: line 7 makes the same update, with the trimmed name.' },
    { row: 5, note: 'Fine: trimming spaces off a title is harmless cleanup.' },
    { row: 7, note: 'Fine: this is the save itself. The trouble is what wraps it.' },
  ],
  options: [
    {
      id: 'vague',
      text: 'This PR has a few problems in it. Please take another careful pass over the whole function, clean it up and make it safer before I look again.',
      correct: false,
      feedback:
        'Otto can’t act on “a few problems”. Point at the lines, say what right is, and ask for the test.',
    },
    {
      id: 'specific',
      text: 'Line 3: restore the canEdit check. Lines 6-10: let save errors throw. Add tests: a stranger gets Forbidden, a failed save errors.',
      correct: true,
      feedback: 'Where, what breaks, what right looks like, and the tests that prove it.',
    },
    {
      id: 'merge-first',
      text: 'Approve and merge it now so owners get renaming today, then open a follow-up issue asking Otto to restore the permission check and the errors.',
      correct: false,
      feedback:
        'Merged, any stranger could rename documents today and failed saves would vanish. Request changes first; follow-ups get forgotten.',
    },
  ],
  explanation:
    'Read the removed lines as hard as the added ones: a lost check is invisible in the green. Flag only what breaks, name it, then send Otto the line, the fix and the test.',
} satisfies z.input<typeof CodeReviewCardSchema>;

export const sampleReviewCard: CodeReviewCard = CodeReviewCardSchema.parse(sampleReviewCardInput);

/** A lesson that ends in the review card: the sample lesson's first five cards, then it. */
export const sampleReviewLessonInput = {
  ...sampleLessonInput,
  id: 'sample-code-review',
  title: 'Review Otto’s PR (sample)',
  cards: [...sampleLessonInput.cards.slice(0, 5), sampleReviewCardInput],
} satisfies LessonInput;

export const sampleReviewLesson: Lesson = LessonSchema.parse(sampleReviewLessonInput);

/** A run of the review lesson on its review card, the five cards before it skipped through. */
export function onReviewCard(): LessonRun {
  let run = finishLessonBriefing(startLessonRun(sampleReviewLesson), 0);
  while (run.cardIndex < 5) {
    run = nextCard({ ...run, card: { ...run.card, solved: true } }, sampleReviewLesson);
  }
  return run;
}
