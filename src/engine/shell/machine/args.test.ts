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
      { kind: 'parameter', name: 'Force', value: ['False'], switchValue: false },
    ]);
  });

  it('marks the values a switch accepts: $true, $false, $null and bare numbers', () => {
    const switchValues = (line: string) =>
      args(line).map((arg) => (arg.kind === 'parameter' ? arg.switchValue : 'value'));
    expect(switchValues('-a:$true -b:$FALSE -c:$null -d:2 -e:0 -f:0x10 -g:-1.5')).toEqual([
      true,
      false,
      false,
      2,
      0,
      16,
      -1.5,
    ]);
    // Text is text, even when it reads like a boolean: PowerShell refuses these for a switch.
    expect(switchValues("-a:false -b:'1' -c:$HOME -d:1x -e:1,0")).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('reads a word that is only partly bare as a value', () => {
    expect(args('-Pa"th"')).toEqual([{ kind: 'value', items: ['-Path'] }]);
  });

  it('gives a bare -Name: the next word, whatever it looks like', () => {
    expect(args('-Path: docs -Path: -Force -Force: $false')).toEqual([
      { kind: 'parameter', name: 'Path', value: ['docs'] },
      { kind: 'parameter', name: 'Path', value: ['-Force'] },
      { kind: 'parameter', name: 'Force', value: ['False'], switchValue: false },
    ]);
    expect(args('-Path:')).toEqual([{ kind: 'parameter', name: 'Path', value: null }]);
  });

  it('joins values separated by commas into one list', () => {
    expect(args('node, npm,git -Name:a,b -Id 1, 2')).toEqual([
      { kind: 'value', items: ['node', 'npm', 'git'] },
      { kind: 'parameter', name: 'Name', value: ['a', 'b'] },
      { kind: 'parameter', name: 'Id', value: null },
      { kind: 'value', items: ['1', '2'] },
    ]);
  });

  it("refuses a comma with nothing on one side, in PowerShell's parser words", () => {
    const refusal = (line: string) => toArgs(lex(line), () => '');
    for (const line of [', node', '-Force, a', '-Path:, a']) {
      expect(refusal(line)).toEqual({
        ok: false,
        message: 'Missing argument in parameter list.',
        hints: [],
      });
    }
    expect(refusal('a,,b')).toEqual({
      ok: false,
      message: "Missing expression after ',' in pipeline element.",
      hints: [],
    });
    expect(refusal('node,')).toEqual({
      ok: false,
      message: "Missing expression after ',' in pipeline element.",
      hints: ['Finish the list on this line, or remove the last comma.'],
    });
  });

  it('only takes words and commas', () => {
    expect(() => toArgs(lex('a | b'), () => '')).toThrow('not pipe');
  });
});
