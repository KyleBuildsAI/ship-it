import { lessonAct } from '../lessonAct';
import { shipThroughAPullRequest } from './fieldMission';
import { act4Lessons } from './lessons';
import { act4Placement } from './placement';

/**
 * Act 4: GitHub Team Flow, taught as lessons, with every part a finished Act has: a
 * placement test of cards from its lessons, the timed final as its boss, and a Field
 * Mission on Kyle's real repo. `act4` holds the parsed Act and its parsed lessons (final
 * last); the schemas run once, when the game loads.
 */
export const act4 = lessonAct(4, 'GitHub Team Flow', act4Lessons, {
  placementTest: act4Placement,
  fieldMission: shipThroughAPullRequest,
});

export { act4Lessons, act4Placement, shipThroughAPullRequest };
