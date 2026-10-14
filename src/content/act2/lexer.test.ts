import { describe, expect, it } from 'vitest';
import { lex } from '../../engine/shell/machine/lex';
import { tokenize } from '../../engine/shell/tokenize';

/**
 * Act 2 still uses its own small tokenizer. Act 1 brings a fuller PowerShell lexer, and
 * one day Act 2 should move onto it. This proves that move is safe: every command line in
 * Act 2 (Otto's lines and looks in the directed missions) lexes into exactly the same
 * words either way.
 */
const sources = import.meta.glob<string>(
  [
    './threeRooms.ts',
    './readingHistory.ts',
    './goodCommits.ts',
    './ignoreList.ts',
    './undoEverything.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);

const COMMAND = /^(git|echo|cat|type|ls|dir|cd|rm|mkdir|code|pwd)( |$)/;
/**
 * A mission's `line:` value: Otto's command or a look. Mission files are full of prose that
 * starts with "git" too (lessons, feedback), so only these strings count there.
 */
const LINE = /\bline: (?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;

/** Every command line quoted in a file's code (comment lines skipped). */
function commandLines(source: string, pattern: RegExp): string[] {
  return source
    .split('\n')
    .filter((text) => !/^\s*(\/\/|\/\*|\*)/.test(text))
    .flatMap((text) => [...text.matchAll(pattern)])
    .map((match) => (match[1] ?? match[2] ?? '').replace(/\\(.)/g, '$1'))
    .filter((text) => COMMAND.test(text));
}

const linesIn = (source: string) => commandLines(source, LINE);

const corpus = [...new Set(Object.values(sources).flatMap((source) => linesIn(source)))];

/** Both lexers' output in Act 2's shape: words, and > or >>. */
function viaLex(line: string): string[] {
  return lex(line).map((token) => {
    if (token.kind === 'word')
      return token.parts
        .map((part) => (part.kind === 'text' ? part.text : `$${part.name}`))
        .join('');
    if (token.kind === 'redirect' && token.stream === 'output') return token.append ? '>>' : '>';
    return `<${token.kind}>`;
  });
}

function viaTokenize(line: string): string[] {
  return tokenize(line).map((token) =>
    token.kind === 'word' ? token.value : token.append ? '>>' : '>',
  );
}

describe("Act 2's command lines under the Act 1 lexer", () => {
  it('finds command lines in every mission', () => {
    expect(Object.keys(sources)).toHaveLength(5);
    for (const [path, source] of Object.entries(sources))
      expect(linesIn(source).length, path).toBeGreaterThan(0);
    expect(corpus.length).toBeGreaterThan(50);
  });

  it.each(corpus)('%s', (line) => {
    expect(viaLex(line)).toEqual(viaTokenize(line));
  });
});
