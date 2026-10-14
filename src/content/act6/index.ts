import { lessonAct } from '../lessonAct';
import { documentOneRequest } from './fieldMission';
import { act6Lessons } from './lessons';
import { act6Placement } from './placementTest';

/**
 * Act 6: How Systems Work, taught as lessons and parsed once when the game loads. It's a
 * finished Act: a placement test of cards from its lessons, the timed final as its boss,
 * and a Field Mission on Kyle's real SandCastles repo, which completing the Act needs.
 */
export const act6 = lessonAct(6, 'How Systems Work', act6Lessons, {
  placementTest: act6Placement,
  fieldMission: documentOneRequest,
});

/** The raw inputs, for tests and tools that want them unparsed. */
export { act6Lessons, act6Placement, documentOneRequest };
