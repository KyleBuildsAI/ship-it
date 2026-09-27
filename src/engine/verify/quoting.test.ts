import { describe, expect, it } from 'vitest';
import { closingQuote, splitRename, unquotePath } from './quoting';

describe('closingQuote', () => {
  it('finds the closing quote, skipping escaped quotes', () => {
    expect(closingQuote('"a b.txt"')).toBe(8);
    expect(closingQuote('"say \\"hi\\".txt" -> x')).toBe(15);
  });

  it('returns -1 for unquoted or unterminated text', () => {
    expect(closingQuote('plain.txt')).toBe(-1);
    expect(closingQuote('"never closes')).toBe(-1);
  });
});

describe('unquotePath', () => {
  it('returns unquoted paths unchanged', () => {
    expect(unquotePath('src/app.ts')).toBe('src/app.ts');
    expect(unquotePath('"')).toBe('"');
    expect(unquotePath('"half')).toBe('"half');
  });

  it('removes the quotes git adds around names with spaces', () => {
    expect(unquotePath('"draft notes.md"')).toBe('draft notes.md');
  });

  it('decodes octal UTF-8 bytes back into letters', () => {
    expect(unquotePath('"caf\\303\\251.txt"')).toBe('café.txt');
    expect(unquotePath('"\\360\\237\\232\\200 launch.md"')).toBe('🚀 launch.md');
  });

  it('decodes C-style escapes for quotes, backslashes, and control characters', () => {
    expect(unquotePath('"say \\"hi\\".txt"')).toBe('say "hi".txt');
    expect(unquotePath('"back\\\\slash"')).toBe('back\\slash');
    expect(unquotePath('"tab\\there"')).toBe('tab\there');
    expect(unquotePath('"line\\nbreak"')).toBe('line\nbreak');
    expect(unquotePath('"\\a\\b\\v\\f\\r"')).toBe('\u0007\b\v\f\r');
  });

  it('keeps an unknown escape letter as the letter itself', () => {
    expect(unquotePath('"odd\\q"')).toBe('oddq');
  });

  it("falls back to git's escaped spelling for bytes that aren't valid UTF-8", () => {
    expect(unquotePath('"bad\\377name"')).toBe('bad\\377name');
  });

  it('keeps non-ASCII letters that arrive unescaped (core.quotePath off)', () => {
    expect(unquotePath('"naïve \\"x\\""')).toBe('naïve "x"');
  });
});

describe('splitRename', () => {
  it('splits plain and quoted rename pairs', () => {
    expect(splitRename('a.txt -> b.txt')).toEqual({ from: 'a.txt', to: 'b.txt' });
    expect(splitRename('"old name.txt" -> "new name.txt"')).toEqual({
      from: 'old name.txt',
      to: 'new name.txt',
    });
    expect(splitRename('old.txt -> "caf\\303\\251.txt"')).toEqual({
      from: 'old.txt',
      to: 'café.txt',
    });
  });

  it('ignores an arrow inside a quoted old name', () => {
    expect(splitRename('"x -> y" -> z')).toEqual({ from: 'x -> y', to: 'z' });
  });

  it('returns null when there is no arrow', () => {
    expect(splitRename('just-a-file.txt')).toBeNull();
  });
});
