import type { ActInput, MissionInput } from '../../game/missions/schema';
import { deletesAreForever } from './deletes-are-forever';
import { everyTerminal } from './every-terminal';
import { act1LessonInputs } from './lessons';
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
 * final stands in for the boss. It stays in early access because its Field Mission,
 * "Brief Your Real Agent", isn't built yet, so finishing it can't complete the Act.
 */
export const act1Input: ActInput = {
  act: 1,
  title: 'The Machine',
  earlyAccess: true,
  missionIds: [...act1MissionInputs, ...act1LessonInputs].map((part) => part.id),
  finalLessonId: act1LessonInputs.at(-1)?.id,
};
