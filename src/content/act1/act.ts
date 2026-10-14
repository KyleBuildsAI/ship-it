import type { ActInput, MissionInput } from '../../game/missions/schema';
import { deletesAreForever } from './deletes-are-forever';
import { everyTerminal } from './every-terminal';
import { briefYourRealAgent } from './fieldMission';
import { act1LessonInputs } from './lessons';
import { act1Placement } from './placement';
import { secretsStayHome } from './secrets-stay-home';
import { whereThingsLive } from './whereThingsLive';

/** Act 1's directed missions, in play order (DESIGN.md section 11). */
export const act1MissionInputs: readonly MissionInput[] = [
  whereThingsLive,
  deletesAreForever,
  secretsStayHome,
  everyTerminal,
];

/**
 * Act 1 plays its directed missions, then its lessons, with the timed final last. The
 * final stands in for the boss. With its placement test and its Field Mission, "Brief
 * Your Real Agent", every part is built, so Act 1 is finished: completing it counts.
 */
export const act1Input: ActInput = {
  act: 1,
  title: 'The Machine',
  missionIds: [...act1MissionInputs, ...act1LessonInputs].map((part) => part.id),
  finalLessonId: act1LessonInputs.at(-1)?.id,
  placementTest: act1Placement,
  fieldMission: briefYourRealAgent,
};
