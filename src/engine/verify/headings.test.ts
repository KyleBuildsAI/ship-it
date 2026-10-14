import { describe, expect, it } from 'vitest';
import { headingProblems, parseMarkdownHeadings } from './headings';

const STAR = ['Situation', 'Task', 'Action', 'Result', 'What I would do differently'];

describe('reading headings from a Select-String paste', () => {
  it('reads piped output, which prints just the matching lines', () => {
    const paste = [
      "PS C:\\SandCastles> git show HEAD:docs/story.md | Select-String '^## '",
      '',
      '## Situation',
      '## Task',
      '## Action',
      '',
    ].join('\r\n');
    expect(parseMarkdownHeadings(paste)).toEqual(['Situation', 'Task', 'Action']);
  });

  it('reads -Path output, which puts the file and line number in front', () => {
    const paste = ['docs\\story.md:1:## Situation', 'docs\\story.md:9:## Task  '].join('\n');
    expect(parseMarkdownHeadings(paste)).toEqual(['Situation', 'Task']);
  });

  it('keeps only the level asked for, and skips anything that is not a heading', () => {
    const paste = ['# SandCastles', '## Result', '### Numbers', 'fatal: bad revision'].join('\n');
    expect(parseMarkdownHeadings(paste)).toEqual(['Result']);
    expect(parseMarkdownHeadings(paste, 1)).toEqual(['SandCastles']);
    expect(parseMarkdownHeadings('')).toEqual([]);
  });

  it('ignores the colour codes PowerShell 7 adds around the match', () => {
    expect(parseMarkdownHeadings('\u001b[7m## \u001b[0mSituation')).toEqual(['Situation']);
  });
});

describe('checking headings against the ones wanted', () => {
  it('passes the five STAR headings in order, with extra headings between', () => {
    const found = ['Situation', 'Task', 'Links', 'Action', 'Result', 'What I would do differently'];
    expect(headingProblems(found, STAR)).toEqual({ missing: [], outOfOrder: [] });
  });

  it('forgives case and a trailing colon', () => {
    const found = ['situation:', 'TASK', 'Action', 'Result', 'what i would do differently'];
    expect(headingProblems(found, STAR)).toEqual({ missing: [], outOfOrder: [] });
  });

  it('names headings that are missing, and ones out of order', () => {
    expect(headingProblems(['Situation', 'Action', 'Result'], STAR)).toEqual({
      missing: ['Task', 'What I would do differently'],
      outOfOrder: [],
    });
    const swapped = ['Situation', 'Action', 'Task', 'Result', 'What I would do differently'];
    expect(headingProblems(swapped, STAR)).toEqual({ missing: [], outOfOrder: ['Action'] });
  });
});
