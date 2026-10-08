import { LessonSchema, type Lesson, type LessonInput } from '../game/missions/lessonSchema';
import { ActSchema, type Act, type Mission } from '../game/missions/schema';

/** An Act taught by lessons, shaped like any Act in the catalog: it just has no missions. */
export interface LessonActContent {
  readonly act: Act;
  readonly missions: readonly Mission[];
  readonly lessons: readonly Lesson[];
}

/**
 * Builds an Act taught by lessons (DESIGN.md section 5, Lessons) from its lessons in play
 * order, final last. The final is named as the Act's finalLessonId, which is what lets
 * finishing it complete the Act in place of a boss fight. Parsing happens once, when the
 * game loads, and the content tests prove it never throws.
 */
export function lessonAct(
  number: number,
  title: string,
  inputs: readonly LessonInput[],
): LessonActContent {
  const lessons = inputs.map((input) => LessonSchema.parse(input));
  const act = ActSchema.parse({
    act: number,
    title,
    missionIds: lessons.map((lesson) => lesson.id),
    // The last lesson is the final. If it isn't one, validateAct says so in the tests.
    finalLessonId: lessons.at(-1)?.id,
  });
  return { act, missions: [], lessons };
}
