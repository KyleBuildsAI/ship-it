import type { EvidenceEntry } from '../../../game/agent/evidence';

/**
 * Where an evidence box scrolls when its lines change (TerminalEvidence.tsx):
 * - `newest`: lines are arriving after the ones already shown, as a drill's scene plays or
 *   Kyle runs another look, so the newest comes into view, as a terminal keeps it.
 * - `top`: the whole output is new, like the drill card that opens once the scene ends. It
 *   starts at the first line: following the newest there opened a `git status` with
 *   "Changes to be committed:" out of sight above.
 * - `stay`: nothing changed, so Kyle's own scrolling is left alone.
 */
export type EvidenceScroll = 'newest' | 'top' | 'stay';

/** How the box moves from showing `shown` to showing `next`. */
export function evidenceScroll(
  shown: readonly EvidenceEntry[],
  next: readonly EvidenceEntry[],
): EvidenceScroll {
  // The scene and the looks add each line to a copy of the list, so an earlier line is
  // the very same object as before.
  const keepsShown = shown.every((entry, index) => next[index] === entry);
  if (keepsShown && next.length === shown.length) return 'stay';
  if (keepsShown && shown.length > 0) return 'newest';
  return 'top';
}
