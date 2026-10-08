import { lessonAct } from '../lessonAct';
import { act3Lessons } from './lessons';

/** Act 3: Branching, taught as lessons and parsed once when the game loads. */
export const act3 = lessonAct(3, 'Branching', act3Lessons);

export { act3Lessons };
