import { ActSchema, MissionSchema, type Act, type Mission } from '../../game/missions/schema';
import { act2Input, act2MissionInputs } from './act';

/**
 * Act 2, parsed once when the game loads. Parsing fills in defaults (a step's XP, a
 * drill's time limit, a twist's empty apply list), so the game only ever sees the
 * complete output types. The tests prove this parse never throws.
 */
export const act2Missions: readonly Mission[] = act2MissionInputs.map((input) =>
  MissionSchema.parse(input),
);

export const act2: Act = ActSchema.parse(act2Input);
