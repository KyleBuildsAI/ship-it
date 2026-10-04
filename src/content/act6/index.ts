import { lessonAct } from '../lessonAct';
import { act6Lessons } from './lessons';

/** Act 6: How Systems Work, taught as lessons and parsed once when the game loads. */
export const act6 = lessonAct(6, 'How Systems Work', act6Lessons);

/** The raw lesson inputs, in play order, for tests and tools that want them unparsed. */
export { act6Lessons };
