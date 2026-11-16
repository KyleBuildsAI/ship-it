import { describe, expect, it } from 'vitest';
import type { EvidenceEntry } from '../../../game/agent/evidence';
import { applyEvidenceScroll, evidenceScroll, type EvidenceBox } from './evidenceScroll';

function ran(typed: string): EvidenceEntry {
  return { tab: 1, prompt: 'quillwork $ ', typed, words: null, lines: [] };
}

const status = ran('git status');
const add = ran('git add README.md');
const log = ran('git log --oneline');

describe('where an evidence box scrolls', () => {
  it('opens at the top when its whole output is new, like the drill card after the scene', () => {
    expect(evidenceScroll([], [status, add])).toBe('top');
    // A first line on its own is new output too: its own start is the top.
    expect(evidenceScroll([], [status])).toBe('top');
  });

  it('follows the newest while lines arrive after the ones it shows', () => {
    expect(evidenceScroll([status], [status, add])).toBe('newest');
    expect(evidenceScroll([status, add], [status, add, log])).toBe('newest');
  });

  it('starts over at the top when the lines are replaced, like the next drill', () => {
    expect(evidenceScroll([status, add], [log])).toBe('top');
    expect(evidenceScroll([status], [log, add])).toBe('top');
  });

  it('leaves Kyle’s own scrolling alone when nothing changed', () => {
    const shown = [status, add];
    expect(evidenceScroll(shown, shown)).toBe('stay');
    expect(evidenceScroll(shown, [...shown])).toBe('stay');
    expect(evidenceScroll([], [])).toBe('stay');
  });
});

/**
 * A stand-in for the evidence `pre`, scrolled to `scrollTop`: its first entry starts 13px
 * down, below the box's padding, and its newest 213px down.
 */
function box(scrollTop: number): EvidenceBox {
  return { scrollTop, firstElementChild: { offsetTop: 13 }, lastElementChild: { offsetTop: 213 } };
}

describe('moving an evidence box', () => {
  it('opens at its first line for new output, not at the bottom half of a git status', () => {
    const scrolled = box(480);
    applyEvidenceScroll(scrolled, 'top');
    expect(scrolled.scrollTop).toBe(0);
  });

  it('brings the newest entry in from its typed line, where the first entry starts', () => {
    const scrolled = box(0);
    applyEvidenceScroll(scrolled, 'newest');
    expect(scrolled.scrollTop).toBe(200);
  });

  it('leaves the box where Kyle scrolled it when nothing changed', () => {
    const scrolled = box(120);
    applyEvidenceScroll(scrolled, 'stay');
    expect(scrolled.scrollTop).toBe(120);
  });

  it('stays put when there is no entry to scroll to', () => {
    const empty: EvidenceBox = { scrollTop: 40, firstElementChild: null, lastElementChild: null };
    applyEvidenceScroll(empty, 'newest');
    expect(empty.scrollTop).toBe(40);
  });
});
