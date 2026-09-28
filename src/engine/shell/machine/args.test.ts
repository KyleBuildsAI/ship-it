import { describe, expect, it } from 'vitest';
import { toArgs, type Arg } from './args';
import { lex } from './lex';

const VARIABLES: Record<string, string> = { HOME: 'C:\\Users\\kyle', false: 'False' };

function args(line: string): Arg[] {
  const result = toArgs(lex(line), (name) => VARIABLES[name] ?? '');
  if (!Array.isArray(result)) throw new Error(result.message);
  return result;
}

describe('toArgs', () => {
  it('tells parameters from values the way PowerShell does', () => {
    expect(args("-Force '-Force' `-Force -1 --force -Path:C:\\x")).toEqual([
      { kind: 'parameter', name: 'Force', value: null },
      { kind: 'value', items: ['-Force'] },
      { kind: 'value', items: ['-Force'] },
      { kind: 'value', items: ['-1'] },
      { kind: 'value', items: ['--force'] },
      { kind: 'parameter', name: 'Path', value: ['C:\\x'] },
    ]);
  });

  it('accepts the long dashes a word processor swaps in', () => {
    expect(args('\u2013ItemType \u2014Force')).toEqual([
      { kind: 'parameter', name: 'ItemType', value: null },
      { kind: 'parameter', name: 'Force', value: null },
    ]);
  });

  it('expands variables and keeps quoted text after -Name:', () => {
    expect(args("$HOME\\notes -Path:'C:\\Program Files' -Force:$false")).toEqual([
      { kind: 'value', items: ['C:\\Users\\kyle\\notes'] },
      { kind: 'parameter', name: 'Path', value: ['C:\\Program Files'] },
      { kind: 'parameter', name: 'Force', value: ['False'] },
    ]);
  });

  it('reads a word that is only partly bare as a value', () => {
    expect(args('-Pa"th"')).toEqual([{ kind: 'value', items: ['-Path'] }]);
  });

  it('lets a bare -Name: take the next word, like -Name', () => {
    expect(args('-Path: docs')).toEqual([
      { kind: 'parameter', name: 'Path', value: null },
      { kind: 'value', items: ['docs'] },
    ]);
  });

  it('joins values separated by commas into one list', () => {
    expect(args('node, npm,git -Name:a,b -Id 1, 2')).toEqual([
      { kind: 'value', items: ['node', 'npm', 'git'] },
      { kind: 'parameter', name: 'Name', value: ['a', 'b'] },
      { kind: 'parameter', name: 'Id', value: null },
      { kind: 'value', items: ['1', '2'] },
    ]);
  });

  it('refuses a comma with nothing on one side', () => {
    for (const line of ['node,', ', node', 'a,,b', '-Force, a']) {
      expect(toArgs(lex(line), () => '')).toEqual({
        ok: false,
        message: "Missing expression after ','.",
        hints: [],
      });
    }
  });

  it('only takes words and commas', () => {
    expect(() => toArgs(lex('a | b'), () => '')).toThrow('not pipe');
  });
});
