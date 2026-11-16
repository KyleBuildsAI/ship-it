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

/** What the scroll reads of an entry's box: how far down the evidence it starts. */
interface EntryStart {
  readonly offsetTop: number;
}

/**
 * The evidence box (TerminalEvidence.tsx's `pre`, one child per entry): how far it is
 * scrolled, and its first and newest entry. A test can pass plain objects for the entries,
 * since only their offsetTop is read.
 */
export interface EvidenceBox {
  scrollTop: number;
  readonly firstElementChild: Element | EntryStart | null;
  readonly lastElementChild: Element | EntryStart | null;
}

/** Where `entry` starts, or null when there is none or the page hasn't laid it out. */
function startOf(entry: Element | EntryStart | null): number | null {
  if (entry === null || !('offsetTop' in entry)) return null;
  return typeof entry.offsetTop === 'number' ? entry.offsetTop : null;
}

/**
 * Moves `box` as `move` says. For `newest` its newest entry starts where its first one
 * does, in sight from its typed line on. The box can't scroll past its end, so a short
 * newest entry just brings the bottom into view, as a terminal does.
 */
export function applyEvidenceScroll(box: EvidenceBox, move: EvidenceScroll): void {
  if (move === 'top') {
    box.scrollTop = 0;
    return;
  }
  if (move === 'stay') return;
  const first = startOf(box.firstElementChild);
  const newest = startOf(box.lastElementChild);
  if (first !== null && newest !== null) box.scrollTop = newest - first;
}
