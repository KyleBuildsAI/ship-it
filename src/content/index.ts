import { act1, act1Missions } from './act1';
import { LAPTOP_NOTICE, LAPTOP_SANDBOX } from './act1/laptop';
import { act2, act2Missions } from './act2';
import { act3 } from './act3';
import { act4 } from './act4';
import { act5 } from './act5';
import { act6 } from './act6';
import { act7 } from './act7';
import { act8 } from './act8';

/**
 * Every shipped Act, in play order, for the game to import. Content is plain data
 * (DESIGN.md section 10). Act 1 is in early access: its missions ship one at a time.
 * Acts 3 to 8 are taught by lessons answered with clicks (DESIGN.md section 5, Lessons),
 * each ending in a timed final that stands in for its boss.
 */
export const ACTS = [
  {
    act: act1,
    missions: act1Missions,
    freePlay: { steps: LAPTOP_SANDBOX, notice: LAPTOP_NOTICE },
  },
  { act: act2, missions: act2Missions },
  act3,
  act4,
  act5,
  act6,
  act7,
  act8,
] as const;

export { act1, act1Missions, act2, act2Missions };
