import { lessonAct } from '../lessonAct';
import { act7Lessons } from './lessons';

export { act7Lessons } from './lessons';

/** Act 7: AI-Native Engineering, taught as lessons and parsed once when the game loads. */
export const act7 = lessonAct(7, 'AI-Native Engineering', act7Lessons);
