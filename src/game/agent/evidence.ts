import type { OutputLine } from '../../engine/git/cli/output';
import { display } from '../../engine/machine/winPath';
import type { DriverAction, DriverStep } from '../../engine/shell/driver';

/*
 * The play panel's copy of what the terminal showed. The terminal stays put away while
 * Kyle directs Otto or answers a drill (DESIGN.md section 14), so what he judges by, his
 * look chips and a drill scene's lines, shows in the panel too. Each entry comes from the
 * same driven step the terminal's feed is built from, so the panel and the terminal never
 * disagree.
 */

/** One action as the terminal showed it: the prompt, what was typed there, its output. */
export interface EvidenceEntry {
  /** The terminal tab it happened in. */
  readonly tab: number;
  /**
   * The prompt the line was typed at, or the one a new or switched tab shows (where it
   * stands is often the evidence). Null for a file write or edit, which no prompt sees.
   */
  readonly prompt: string | null;
  /** The line or answer typed after the prompt, or null when nothing was typed. */
  readonly typed: string | null;
  /** Words for an action that types nothing, like "Opened a new terminal: PS 2". */
  readonly words: string | null;
  /** The real output, exactly as the shell printed it. */
  readonly lines: readonly OutputLine[];
}

/**
 * What the panel shows for `action`, which was driven as `step`. On a laptop (`onLaptop`)
 * a path reads as Windows writes it; on a git project, as the project path the Git World's
 * crates already show.
 */
export function evidenceOf(
  action: DriverAction,
  step: DriverStep,
  onLaptop: boolean,
): EvidenceEntry {
  const { tab, lines } = step;
  const shownPath = (path: string) => (onLaptop ? display(path) : path);
  const untyped = (prompt: string | null, words: string): EvidenceEntry => ({
    tab,
    prompt,
    typed: null,
    words,
    lines,
  });
  switch (action.do) {
    case 'run':
    case 'answer':
      return { tab, prompt: step.prompt, typed: step.echo, words: null, lines };
    case 'write':
      return untyped(null, `Wrote ${shownPath(action.path)}`);
    case 'edit':
      return untyped(null, `Edited ${shownPath(action.path)}`);
    case 'newTerminal':
      return untyped(step.prompt, `Opened a new terminal: PS ${String(tab)}`);
    case 'useTerminal':
      return untyped(step.prompt, `Switched to PS ${String(action.tab)}`);
  }
}
