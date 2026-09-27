import type { SaveData } from '../save/schema';

/** XP for each thing the player can finish. Tuning lives here so it is easy to find and change. */
export const XP_AWARDS = {
  briefing: 10,
  simStep: 20,
  drillCorrect: 15,
  questionStrong: 10,
  questionOkay: 5,
  boss: 150,
  fieldMission: 200,
  missionComplete: 50,
} as const;

/** Testing out of an Act skips the practice, so it earns half of the Act's mission XP. */
export const TEST_OUT_XP_SHARE = 0.5;

export const FIRST_ACT = 1;
export const LAST_ACT = 8;

/**
 * XP for passing an Act's placement test. `missionXp` lists the full XP of each mission in
 * the Act. Rounded, because XP is always a whole number.
 */
export function placementTestOutXp(missionXp: readonly number[]): number {
  for (const xp of missionXp) {
    if (!Number.isFinite(xp) || xp < 0) {
      throw new RangeError(`Mission XP must be zero or more, got ${String(xp)}.`);
    }
  }
  const total = missionXp.reduce((sum, xp) => sum + xp, 0);
  return Math.round(total * TEST_OUT_XP_SHARE);
}

export const RANKS = ['Intern', 'Junior', 'Mid', 'Senior', 'Staff'] as const;
export type Rank = (typeof RANKS)[number];

/**
 * The highest completed Act needed for each rank, lowest rank first. DESIGN.md section 6 says
 * which Acts each rank plays through (Intern: Acts 1-2, Junior: 3-4, Mid: 5-6, Senior: 7,
 * Staff: 8), so finishing the last Act of one band promotes you into the next.
 */
const RANK_REQUIREMENTS: readonly { rank: Rank; highestCompletedAct: number }[] = [
  { rank: 'Intern', highestCompletedAct: 0 },
  { rank: 'Junior', highestCompletedAct: 2 },
  { rank: 'Mid', highestCompletedAct: 4 },
  { rank: 'Senior', highestCompletedAct: 6 },
  { rank: 'Staff', highestCompletedAct: 7 },
];

function highestAct(completedActs: readonly number[]): number {
  for (const act of completedActs) {
    if (!Number.isInteger(act) || act < FIRST_ACT || act > LAST_ACT) {
      throw new RangeError(
        `Acts are numbered ${String(FIRST_ACT)} to ${String(LAST_ACT)}, got ${String(act)}.`,
      );
    }
  }
  return Math.max(0, ...completedActs);
}

/**
 * The player's rank, from the highest Act they have completed. It uses the highest rather
 * than the count because a placement test can complete a later Act before an earlier one.
 */
export function rankFor(completedActs: readonly number[]): Rank {
  const highest = highestAct(completedActs);
  let rank: Rank = 'Intern';
  for (const requirement of RANK_REQUIREMENTS) {
    if (highest >= requirement.highestCompletedAct) rank = requirement.rank;
  }
  return rank;
}

/**
 * The next rank up and the Act whose completion unlocks it, for "Complete Act 4 to reach Mid".
 * Returns null at the top rank.
 */
export function nextRank(
  completedActs: readonly number[],
): { rank: Rank; unlockedByAct: number } | null {
  const highest = highestAct(completedActs);
  const next = RANK_REQUIREMENTS.find((requirement) => requirement.highestCompletedAct > highest);
  return next === undefined ? null : { rank: next.rank, unlockedByAct: next.highestCompletedAct };
}

/**
 * The Act numbers the player has completed, in order. An Act the player tested out of counts
 * as complete (DESIGN.md section 5), even if something forgot to stamp its completedAt.
 */
export function completedActNumbers(acts: SaveData['acts']): number[] {
  return Object.entries(acts)
    .filter(([, act]) => act.completedAt !== null || act.placement.testedOut)
    .map(([actKey]) => Number(actKey))
    .toSorted((a, b) => a - b);
}
