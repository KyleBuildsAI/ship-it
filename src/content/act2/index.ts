import { LessonSchema, type Lesson } from '../../game/missions/lessonSchema';
import {
  ActSchema,
  MissionSchema,
  requireDrillPlacement,
  requireFieldMission,
  type Act,
  type DrillPlacementTest,
  type FieldMission,
  type Mission,
} from '../../game/missions/schema';
import { act2Input, act2MissionInputs } from './act';
import { dirtyTreeFinal } from './dirtyTreeFinal';

/**
 * Act 2, parsed once when the game loads. Parsing fills in defaults (a step's XP, a
 * drill's time limit, a twist's empty apply list), so the game only ever sees the
 * complete output types. The tests prove this parse never throws.
 */
export const act2Missions: readonly Mission[] = act2MissionInputs.map((input) =>
  MissionSchema.parse(input),
);

/** Act 2's one lesson: its timed final, "The Dirty Tree", which stands in for the boss. */
export const act2Lessons: readonly Lesson[] = [LessonSchema.parse(dirtyTreeFinal)];

/** Act 2 is finished: its placement test of drills and its Field Mission are always there. */
export type Act2 = Act & { placementTest: DrillPlacementTest; fieldMission: FieldMission };

const parsed = ActSchema.parse(act2Input);

export const act2: Act2 = {
  ...parsed,
  placementTest: requireDrillPlacement(parsed),
  fieldMission: requireFieldMission(parsed),
};
