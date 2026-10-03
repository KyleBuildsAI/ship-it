import { act1, act1Missions } from './act1';
import { LAPTOP_NOTICE, LAPTOP_SANDBOX } from './act1/laptop';
import { act2, act2Missions } from './act2';

/**
 * Every shipped Act, in play order, for the game to import. Content is plain data
 * (DESIGN.md section 10). Act 1 is in early access: its missions ship one at a time.
 */
export const ACTS = [
  {
    act: act1,
    missions: act1Missions,
    freePlay: { steps: LAPTOP_SANDBOX, notice: LAPTOP_NOTICE },
  },
  { act: act2, missions: act2Missions },
] as const;

export { act1, act1Missions, act2, act2Missions };
