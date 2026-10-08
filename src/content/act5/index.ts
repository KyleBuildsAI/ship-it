import { lessonAct } from '../lessonAct';
import { act5Lessons } from './lessons';

/**
 * Act 5: Quality Gates, taught as lessons and parsed once when the game loads.
 * `act5.act` is the parsed Act and `act5.lessons` its parsed lessons, final last;
 * `act5Lessons` is the raw input, kept for tests that check the content itself.
 */
export const act5 = lessonAct(5, 'Quality Gates', act5Lessons);

export { act5Lessons };
