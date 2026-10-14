import { LessonSchema, type Lesson, type LessonInput } from '../game/missions/lessonSchema';
import {
  ActSchema,
  type Act,
  type FieldMissionInput,
  type LessonPlacementInput,
  type Mission,
} from '../game/missions/schema';

/** An Act taught by lessons, shaped like any Act in the catalog: it just has no missions. */
export interface LessonActContent {
  readonly act: Act;
  readonly missions: readonly Mission[];
  readonly lessons: readonly Lesson[];
}

/**
 * The optional parts of a lesson Act. Each is checked like any Act's: the schema checks
 * its shape, and validateAct checks a placement's cards exist in the Act's lessons.
 */
export interface LessonActParts {
  /** Cards borrowed from the lessons, answered on one clock; 85% tests out. */
  readonly placementTest?: LessonPlacementInput;
  /** Real work on one of Kyle's real repos, verified by pasted output. */
  readonly fieldMission?: FieldMissionInput;
  /** Ships before it's finished, so it never counts as complete. */
  readonly earlyAccess?: boolean;
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
  parts: LessonActParts = {},
): LessonActContent {
  const lessons = inputs.map((input) => LessonSchema.parse(input));
  const act = ActSchema.parse({
    act: number,
    title,
    missionIds: lessons.map((lesson) => lesson.id),
    // The last lesson is the final. If it isn't one, validateAct says so in the tests.
    finalLessonId: lessons.at(-1)?.id,
    ...parts,
  });
  return { act, missions: [], lessons };
}
