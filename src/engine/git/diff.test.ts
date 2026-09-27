import { describe, expect, it } from 'vitest';
import { buildHunks, countChanges, diffLines, splitLines } from './diff';

const kinds = (before: string, after: string) =>
  diffLines(splitLines(before), splitLines(after))
    .map((line) => line.kind + line.text.replace('\n', ''))
    .join('|');

describe('splitLines', () => {
  it('keeps line endings and marks a missing final newline', () => {
    expect(splitLines('a\nb\n')).toEqual(['a\n', 'b\n']);
    expect(splitLines('a\nb')).toEqual(['a\n', 'b']);
    expect(splitLines('')).toEqual([]);
    expect(splitLines('\n')).toEqual(['\n']);
  });
});

describe('diffLines', () => {
  it('finds unchanged, removed, and added lines', () => {
    expect(kinds('a\nb\nc\n', 'a\nx\nc\n')).toBe(' a|-b|+x| c');
  });

  it('prints removals before the additions that replace them', () => {
    expect(kinds('a\nb\n', 'c\nd\n')).toBe('-a|-b|+c|+d');
  });

  it('handles empty sides', () => {
    expect(kinds('', 'a\n')).toBe('+a');
    expect(kinds('a\n', '')).toBe('-a');
    expect(kinds('', '')).toBe('');
  });

  it('treats a missing final newline as a change', () => {
    expect(kinds('a', 'a\n')).toBe('-a|+a');
  });

  it('falls back to a full replacement for enormous files', () => {
    const big = Array.from({ length: 2100 }, (_, i) => `line ${String(i)}\n`);
    const changed = [...big.slice(1), 'end\n'];
    const script = diffLines(big, changed);
    expect(script.filter((line) => line.kind === '-')).toHaveLength(2100);
    expect(script.filter((line) => line.kind === '+')).toHaveLength(2100);
  });
});

describe('buildHunks', () => {
  const tenLines = Array.from({ length: 10 }, (_, i) => `${String(i + 1)}\n`).join('');

  it('adds three lines of context around a change', () => {
    const after = tenLines.replace('5\n', 'five\n');
    const [hunk, extra] = buildHunks(diffLines(splitLines(tenLines), splitLines(after)));
    expect(extra).toBeUndefined();
    expect(hunk).toMatchObject({ oldStart: 2, oldCount: 7, newStart: 2, newCount: 7 });
  });

  it('keeps distant changes in separate hunks and merges close ones', () => {
    const far = tenLines.replace('1\n', 'one\n').replace('10\n', 'ten\n');
    expect(buildHunks(diffLines(splitLines(tenLines), splitLines(far)))).toHaveLength(2);
    const near = tenLines.replace('3\n', 'three\n').replace('8\n', 'eight\n');
    expect(buildHunks(diffLines(splitLines(tenLines), splitLines(near)))).toHaveLength(1);
  });

  it('starts an empty side at the line before it', () => {
    const [created] = buildHunks(diffLines([], splitLines('a\nb\n')));
    expect(created).toMatchObject({ oldStart: 0, oldCount: 0, newStart: 1, newCount: 2 });
    const [deleted] = buildHunks(diffLines(splitLines('a\n'), []));
    expect(deleted).toMatchObject({ oldStart: 1, oldCount: 1, newStart: 0, newCount: 0 });
  });

  it('returns no hunks when nothing changed', () => {
    expect(buildHunks(diffLines(['a\n'], ['a\n']))).toEqual([]);
  });
});

describe('countChanges', () => {
  it('counts inserted and deleted lines', () => {
    expect(countChanges('a\nb\n', 'a\nc\nd\n')).toEqual({ insertions: 2, deletions: 1 });
  });
});
