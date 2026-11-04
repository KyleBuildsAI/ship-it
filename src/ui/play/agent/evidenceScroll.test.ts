import { describe, expect, it } from 'vitest';
import type { EvidenceEntry } from '../../../game/agent/evidence';
import { evidenceScroll } from './evidenceScroll';

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
