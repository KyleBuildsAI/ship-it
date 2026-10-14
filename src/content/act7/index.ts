import { lessonAct } from '../lessonAct';
import { specThenShip } from './fieldMission';
import { act7Lessons } from './lessons';
import { act7Placement } from './placementTest';

export { specThenShip } from './fieldMission';
export { act7Lessons } from './lessons';
export { act7Placement } from './placementTest';

/**
 * Act 7: AI-Native Engineering, taught as lessons and parsed once when the game loads.
 * It's a finished Act: a placement test of cards from its lessons, its timed final as the
 * boss, and a Field Mission on Kyle's real repo with his own AI agent.
 */
export const act7 = lessonAct(7, 'AI-Native Engineering', act7Lessons, {
  placementTest: act7Placement,
  fieldMission: specThenShip,
  earlyAccess: false,
});
