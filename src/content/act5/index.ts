import { lessonAct } from '../lessonAct';
import { greenOnEveryPush } from './fieldMission';
import { act5Lessons } from './lessons';
import { act5Placement } from './placement';

/**
 * Act 5: Quality Gates, taught as lessons and parsed once when the game loads, with every
 * part a finished Act has: a placement test of cards from its lessons, the Red CI final
 * as its boss, and a Field Mission on SandCastles. `act5.act` is the parsed Act and
 * `act5.lessons` its parsed lessons, final last; `act5Lessons` is the raw input, kept for
 * tests that check the content itself.
 */
export const act5 = lessonAct(5, 'Quality Gates', act5Lessons, {
  placementTest: act5Placement,
  fieldMission: greenOnEveryPush,
});

export { act5Lessons, act5Placement, greenOnEveryPush };
