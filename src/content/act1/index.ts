import { ActSchema, MissionSchema, type Act, type Mission } from '../../game/missions/schema';
import { act1Input, act1MissionInputs } from './act';

/** Act 1, parsed once when the game loads. The tests prove this parse never throws. */
export const act1Missions: readonly Mission[] = act1MissionInputs.map((input) =>
  MissionSchema.parse(input),
);

/** Act 1 is in early access: its boss and Field Mission aren't built yet. */
export const act1: Act = ActSchema.parse(act1Input);
