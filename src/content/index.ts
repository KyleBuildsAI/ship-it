import { act2, act2Missions } from './act2';

/**
 * Every shipped Act, in play order, for the game to import. Content is plain data
 * (DESIGN.md section 10); Acts arrive milestone by milestone (section 15), Act 2 first.
 */
export const ACTS = [{ act: act2, missions: act2Missions }] as const;

export { act2, act2Missions };
