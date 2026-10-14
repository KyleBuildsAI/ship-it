import { lessonAct } from '../lessonAct';
import { tellTheSandCastlesStory } from './fieldMission';
import { act8Lessons } from './lessons';
import { act8Placement } from './placement';

/**
 * Act 8: The Loop, taught as lessons and parsed once when the game loads. It's a finished
 * Act: its lessons, a placement test of their cards, the timed final as its boss, and a
 * Field Mission on Kyle's real SandCastles repo.
 */
export const act8 = lessonAct(8, 'The Loop', act8Lessons, {
  placementTest: act8Placement,
  fieldMission: tellTheSandCastlesStory,
  earlyAccess: false,
});

export { act8Lessons };
