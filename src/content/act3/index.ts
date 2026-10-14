import { lessonAct } from '../lessonAct';
import { landARealBranch } from './fieldMission';
import { act3Lessons } from './lessons';
import { act3Placement } from './placement';

/**
 * Act 3: Branching, taught as lessons and parsed once when the game loads. It's a
 * finished Act: a placement test borrowed from the lessons, the Conflict Storm final as
 * its boss, and a Field Mission on Kyle's real SandCastles repo.
 */
export const act3 = lessonAct(3, 'Branching', act3Lessons, {
  placementTest: act3Placement,
  fieldMission: landARealBranch,
});

export { act3Lessons, act3Placement, landARealBranch };
