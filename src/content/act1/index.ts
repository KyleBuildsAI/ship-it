import { LessonSchema, type Lesson } from '../../game/missions/lessonSchema';
import { ActSchema, MissionSchema, type Act, type Mission } from '../../game/missions/schema';
import { act1Input, act1MissionInputs } from './act';
import { act1LessonInputs } from './lessons';

/** Act 1, parsed once when the game loads. The tests prove this parse never throws. */
export const act1Missions: readonly Mission[] = act1MissionInputs.map((input) =>
  MissionSchema.parse(input),
);

/** Act 1's lessons, 1.5 and 1.6 and the timed final, parsed the same way. */
export const act1Lessons: readonly Lesson[] = act1LessonInputs.map((input) =>
  LessonSchema.parse(input),
);

/** Act 1 is in early access: its Field Mission isn't built yet. */
export const act1: Act = ActSchema.parse(act1Input);

export { act1LessonInputs };
