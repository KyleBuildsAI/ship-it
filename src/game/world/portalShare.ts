import type { ActSummary } from '../play/actSummary';
import type { SkillBranch } from '../play/skillTree';

/*
 * How much of each Act's skill tree its Campus portal shows as lit (DESIGN.md section 4,
 * Campus). Pure: it reads the tree skillTree() already worked out from the Act summaries and
 * the save, so the Campus never downloads an Act, and the three.js side only recolours.
 */

/**
 * What one portal shows: a pip per part of its Act, in play order. How many are lit is
 * counted from the ring itself (shareRing.ts), so there's no second count here to disagree.
 */
export interface PortalShare {
  /** True where that part's skill tree node is lit. Empty when the portal shows no pips. */
  readonly pips: readonly boolean[];
}

const NO_PIPS: PortalShare = { pips: [] };

/**
 * How many segments each Act's portal ring needs, keyed by Act number: one per part, the
 * same parts its skill tree branch has a node for. Read from summaries, so building the
 * Campus downloads no Act.
 */
export function partsPerAct(summaries: readonly ActSummary[]): ReadonlyMap<number, number> {
  return new Map(summaries.map(({ act, parts }) => [act.act, parts.length]));
}

/**
 * One Act's share. A locked Act shows no pips at all, so its portal never looks like it has
 * progress, whatever the save holds. An Act the game doesn't ship (no branch) shows none too.
 */
export function portalShare(branch: SkillBranch | undefined, locked: boolean): PortalShare {
  if (branch === undefined || locked) return NO_PIPS;
  return { pips: branch.nodes.map((node) => node.state === 'lit') };
}

/** Every shipped Act's share, keyed by Act number. `openActs` says which portals are open. */
export function portalShares(
  branches: readonly SkillBranch[],
  openActs: ReadonlySet<number>,
): ReadonlyMap<number, PortalShare> {
  return new Map(
    branches.map((branch) => [branch.act, portalShare(branch, !openActs.has(branch.act))]),
  );
}
