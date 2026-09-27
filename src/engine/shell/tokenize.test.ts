import { describe, expect, it } from 'vitest';
import { tokenize, TokenizeError } from './tokenize';

const words = (input: string) =>
  tokenize(input).map((token) => (token.kind === 'word' ? token.value : token.append ? '>>' : '>'));

describe('tokenize', () => {
  it('splits on any whitespace', () => {
    expect(words('git   status\t-s')).toEqual(['git', 'status', '-s']);
    expect(words('   ')).toEqual([]);
  });

  it('keeps quoted text together and drops the quotes', () => {
    expect(words('git commit -m "feat: add login page"')).toEqual([
      'git',
      'commit',
      '-m',
      'feat: add login page',
    ]);
    expect(words("echo 'it''s'")).toEqual(['echo', "it's"]);
    expect(words('echo "say ""hi"""')).toEqual(['echo', 'say "hi"']);
    expect(words('echo "a"b\'c\'')).toEqual(['echo', 'abc']);
  });

  it('keeps an empty quoted string as a word', () => {
    expect(words('echo "" > empty.txt')).toEqual(['echo', '', '>', 'empty.txt']);
  });

  it('recognises > and >> with or without spaces', () => {
    expect(words('echo hi > a.txt')).toEqual(['echo', 'hi', '>', 'a.txt']);
    expect(words('echo hi>>a.txt')).toEqual(['echo', 'hi', '>>', 'a.txt']);
    expect(words('echo "a > b"')).toEqual(['echo', 'a > b']);
  });

  it('reports an unclosed quote', () => {
    expect(() => tokenize('git commit -m "oops')).toThrow(TokenizeError);
    expect(() => tokenize("echo 'oops")).toThrow('missing closing single quote');
  });
});
