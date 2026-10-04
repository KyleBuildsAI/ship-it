import { lessonAct } from '../lessonAct';
import { act4Lessons } from './lessons';

/**
 * Act 4: GitHub Team Flow, taught as lessons. `act4` holds the parsed Act and its parsed
 * lessons (final last); the schemas run once, when the game loads.
 */
export const act4 = lessonAct(4, 'GitHub Team Flow', act4Lessons);

export { act4Lessons };
