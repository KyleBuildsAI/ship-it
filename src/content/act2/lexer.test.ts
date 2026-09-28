import { describe, expect, it } from 'vitest';
import { lex } from '../../engine/shell/machine/lex';
import { tokenize } from '../../engine/shell/tokenize';

/**
 * Act 2 still uses its own small tokenizer. Act 1 brings a fuller PowerShell lexer, and
 * one day Act 2 should move onto it. This proves that move is safe: every command line in
 * Act 2's played solutions lexes into exactly the same words either way.
 */
const sources = import.meta.glob<string>(['./sims.test.ts', './drills.test.ts', './boss.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const COMMAND = /^(git|echo|cat|type|ls|dir|cd|rm|mkdir|code|pwd)( |$)/;
/** A TypeScript string in single or double quotes, with its \ escapes. */
const STRING = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;

/** Every command line quoted in the tests' code (comment lines skipped). */
function commandLines(source: string): string[] {
  return source
    .split('\n')
    .filter((text) => !/^\s*(\/\/|\/\*|\*)/.test(text))
    .flatMap((text) => [...text.matchAll(STRING)])
    .map((match) => (match[1] ?? match[2] ?? '').replace(/\\(.)/g, '$1'))
    .filter((text) => COMMAND.test(text));
}

const corpus = [...new Set(Object.values(sources).flatMap(commandLines))];

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
  it('finds the solutions in all three files', () => {
    expect(corpus.length).toBeGreaterThan(100);
    expect(corpus).toContain('git commit -m "feat: add notes app"');
    expect(corpus).toContain('echo "*.log" >> .gitignore');
  });

  it.each(corpus)('%s', (line) => {
    expect(viaLex(line)).toEqual(viaTokenize(line));
  });
});
