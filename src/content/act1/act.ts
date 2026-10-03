import type { ActInput, MissionInput } from '../../game/missions/schema';
import { whereThingsLive } from './whereThingsLive';

/** Act 1's missions built so far, in play order (DESIGN.md section 11). */
export const act1MissionInputs: readonly MissionInput[] = [whereThingsLive];

/** Act 1 ships in early access, one mission at a time (docs/act1-directed.md section 5.7). */
export const act1Input: ActInput = {
  act: 1,
  title: 'The Machine',
  earlyAccess: true,
  missionIds: act1MissionInputs.map((mission) => mission.id),
  upcoming: [
    'Deletes Are Forever',
    'Secrets Stay Home',
    'Every Terminal Is Its Own World',
    'Dependencies Are Declared',
    "Running Isn't Working",
  ],
};
