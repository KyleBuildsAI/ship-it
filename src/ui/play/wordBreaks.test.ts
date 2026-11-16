import { describe, expect, it } from 'vitest';
import { briefYourRealAgent } from '../../content/act1/fieldMission';
import { wrapAtSpaces } from './wordBreaks';

const GET_COMMAND =
  'Check which are installed with: Get-Command node, npm, git -ErrorAction SilentlyContinue';

describe('text that wraps only at spaces', () => {
  it('keeps each word with a hyphen whole, so Get-Command never splits after Get-', () => {
    expect(wrapAtSpaces(GET_COMMAND)).toEqual([
      { text: 'Check which are installed with: ', whole: false },
      { text: 'Get-Command', whole: true },
      { text: ' node, npm, git ', whole: false },
      { text: '-ErrorAction', whole: true },
      { text: ' SilentlyContinue', whole: false },
    ]);
  });

  it('keeps paths and flags whole too, since a slash is a break as well', () => {
    const whole = wrapAtSpaces('git log --oneline -1 origin/main -- docs/story.md')
      .filter((piece) => piece.whole)
      .map((piece) => piece.text);
    expect(whole).toEqual(['--oneline', '-1', 'origin/main', '--', 'docs/story.md']);
  });

  it('gives back exactly the text it was given, so a hand-made selection copies the real line', () => {
    for (const item of briefYourRealAgent.checklist) {
      const text = item.prompt ?? item.text;
      expect(
        wrapAtSpaces(text)
          .map((piece) => piece.text)
          .join(''),
      ).toBe(text);
    }
    expect(wrapAtSpaces('  two  spaces ').map((piece) => piece.text)).toEqual(['  two  spaces ']);
    expect(wrapAtSpaces('')).toEqual([]);
  });
});
