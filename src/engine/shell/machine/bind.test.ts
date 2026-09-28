import { describe, expect, it } from 'vitest';
import { toArgs, type Arg, type BindError } from './args';
import { bind, type Bound, type CmdletSpec } from './bind';
import cdList from './fixtures/error-cd-list.txt?raw';
import cdPositional from './fixtures/error-cd-positional.txt?raw';
import lsAmbiguous from './fixtures/error-ls-ambiguous.txt?raw';
import rmPositional from './fixtures/error-rm-positional.txt?raw';
import rmRf from './fixtures/error-rm-rf.txt?raw';
import rmTwice from './fixtures/error-rm-twice.txt?raw';
import switchList from './fixtures/error-switch-list.txt?raw';
import switchText from './fixtures/error-switch-text.txt?raw';
import { lex } from './lex';

// Just enough of each real cmdlet's parameters, in PowerShell's order.
const SET_LOCATION: CmdletSpec = {
  name: 'Set-Location',
  parameters: [{ name: 'Path', type: 'string', position: 0 }],
};
const GET_CHILD_ITEM: CmdletSpec = {
  name: 'Get-ChildItem',
  parameters: [
    { name: 'Path', type: 'string[]', position: 0 },
    { name: 'Filter', type: 'string', position: 1 },
    { name: 'Recurse', type: 'switch', aliases: ['s'] },
    { name: 'Force', type: 'switch' },
    { name: 'Name', type: 'switch' },
    { name: 'Directory', type: 'switch', aliases: ['ad'], provider: true },
    { name: 'File', type: 'switch', aliases: ['af'], provider: true },
    { name: 'Hidden', type: 'switch', aliases: ['ah', 'h'], provider: true },
  ],
};
const REMOVE_ITEM: CmdletSpec = {
  name: 'Remove-Item',
  parameters: [
    { name: 'Path', type: 'string[]', position: 0 },
    { name: 'Recurse', type: 'switch' },
    { name: 'Force', type: 'switch' },
  ],
};
const NEW_ITEM: CmdletSpec = {
  name: 'New-Item',
  parameters: [
    { name: 'Path', type: 'string[]', position: 0 },
    { name: 'ItemType', type: 'string', aliases: ['Type'] },
    { name: 'Name', type: 'string' },
    { name: 'Force', type: 'switch' },
  ],
};

const VARIABLES: Record<string, string> = { false: 'False', true: 'True' };

function args(line: string): Arg[] {
  const result = toArgs(lex(line), (name) => VARIABLES[name] ?? '');
  if (!Array.isArray(result)) throw new Error(result.message);
  return result;
}

function bound(spec: CmdletSpec, line: string): Bound {
  const result = bind(spec, args(line));
  if (!result.ok) throw new Error(result.message);
  return result.bound;
}

function refused(spec: CmdletSpec, line: string): BindError {
  const result = bind(spec, args(line));
  if (result.ok) throw new Error(`${line} bound without an error`);
  return result;
}

/** The error as the terminal prints it, to compare with a real capture. */
const printed = (spec: CmdletSpec, line: string) =>
  `${spec.name}: ${refused(spec, line).message}\n`;

describe('bind', () => {
  it('matches names in any case, and any unambiguous start of a name or alias', () => {
    const result = bound(GET_CHILD_ITEM, '-rec -FORCE -Path docs');
    expect(result.flag('Recurse')).toBe(true);
    expect(result.flag('Force')).toBe(true);
    expect(result.texts('Path')).toEqual(['docs']);
    expect(result.flag('Name')).toBe(false);
    expect(bound(GET_CHILD_ITEM, '-s').flag('Recurse')).toBe(true);
    expect(bound(NEW_ITEM, '-Ty File').text('ItemType')).toBe('File');
  });

  it("tries the cmdlet's own parameters before the provider's, as PowerShell does", () => {
    // Checked in pwsh 7.6.6: -fi is -Filter, -di is -Directory, -h is -Hidden.
    expect(bound(GET_CHILD_ITEM, '-fi *.md').text('Filter')).toBe('*.md');
    expect(bound(GET_CHILD_ITEM, '-file').flag('File')).toBe(true);
    expect(bound(GET_CHILD_ITEM, '-di').flag('Directory')).toBe(true);
    expect(bound(GET_CHILD_ITEM, '-h').flag('Hidden')).toBe(true);
  });

  it('fills positional parameters in order, around named ones', () => {
    const result = bound(GET_CHILD_ITEM, 'src *.ts -Force');
    expect(result.texts('Path')).toEqual(['src']);
    expect(result.text('Filter')).toBe('*.ts');
    expect(bound(GET_CHILD_ITEM, '-Path src *.ts').text('Filter')).toBe('*.ts');
    expect(bound(SET_LOCATION, '').has('Path')).toBe(false);
  });

  it('never gives a switch the next bare value', () => {
    const result = bound(REMOVE_ITEM, '-Recurse -Force old');
    expect(result.flag('Recurse')).toBe(true);
    expect(result.texts('Path')).toEqual(['old']);
  });

  it('takes a -word that is not a parameter of this cmdlet as a value, as PowerShell does', () => {
    expect(bound(SET_LOCATION, '-Path -Force').text('Path')).toBe('-Force');
    expect(bound(SET_LOCATION, '-Path: -Force').text('Path')).toBe('-Force');
  });

  it('turns a switch on or off only with $true, $false, $null or a number', () => {
    expect(bound(REMOVE_ITEM, 'a -Force:$false').flag('Force')).toBe(false);
    expect(bound(REMOVE_ITEM, 'a -Force:$null').flag('Force')).toBe(false);
    expect(bound(REMOVE_ITEM, 'a -Force:$true').flag('Force')).toBe(true);
    expect(bound(REMOVE_ITEM, 'a -Force:2').flag('Force')).toBe(true);
    expect(bound(REMOVE_ITEM, 'a -Force:0').flag('Force')).toBe(false);
    for (const text of ['false', "'1'", 'true']) {
      expect(refused(REMOVE_ITEM, `a -Force:${text}`).hints).toEqual([
        'Turn a switch off with -Force:$false, or leave it out.',
      ]);
    }
  });
});

describe("bind errors, in PowerShell's words", () => {
  it('match the captures from real PowerShell 7.6', () => {
    expect(printed(REMOVE_ITEM, '-rf notes.txt')).toBe(rmRf);
    expect(printed(GET_CHILD_ITEM, '-f')).toBe(lsAmbiguous);
    expect(printed(SET_LOCATION, 'C:\\Program Files\\nodejs')).toBe(cdPositional);
    expect(printed(REMOVE_ITEM, '-Force:maybe notes.txt')).toBe(switchText);
    expect(printed(REMOVE_ITEM, '-Force:$true,$false notes.txt')).toBe(switchList);
    expect(printed(SET_LOCATION, 'a, b')).toBe(cdList);
    expect(printed(REMOVE_ITEM, '-Force -Force notes.txt')).toBe(rmTwice);
    expect(printed(REMOVE_ITEM, 'a.txt b.txt')).toBe(rmPositional);
  });

  it('report the mistake PowerShell reports when a line has several', () => {
    // Each checked in pwsh 7.6.6.
    expect(refused(REMOVE_ITEM, '-rf -Path').message).toContain(
      "Missing an argument for parameter 'Path'",
    );
    expect(refused(GET_CHILD_ITEM, '-zz -f').message).toContain("parameter name 'f' is ambiguous");
    expect(refused(SET_LOCATION, '-zz -Path a,b').message).toContain("'System.Object[]'");
    expect(refused(SET_LOCATION, 'a b -zz').message).toBe(
      "A positional parameter cannot be found that accepts argument 'b'.",
    );
    expect(refused(NEW_ITEM, '-ItemType File -Name').message).toContain(
      "Missing an argument for parameter 'Name'",
    );
    expect(refused(GET_CHILD_ITEM, '-Force -Force -f').message).toContain('is ambiguous');
    expect(refused(SET_LOCATION, 'a -zz b').message).toContain("parameter name 'zz'");
    expect(refused(SET_LOCATION, '-zz a b c').message).toContain("parameter name 'zz'");
  });

  it('ask for a missing value only when a real parameter follows', () => {
    expect(refused(NEW_ITEM, '-Name -Force').message).toBe(
      "Missing an argument for parameter 'Name'. Specify a parameter of type 'System.String' and try again.",
    );
    expect(refused(GET_CHILD_ITEM, '-Filter -F').message).toContain(
      "parameter name 'F' is ambiguous",
    );
  });

  it('name the value with no position to go to, and a list by its type', () => {
    const noPositions: CmdletSpec = { name: 'Get-Location', parameters: [] };
    expect(refused(noPositions, 'here')).toEqual({
      ok: false,
      message: "A positional parameter cannot be found that accepts argument 'here'.",
      hints: [],
    });
    expect(refused(noPositions, 'a,b').message).toContain("argument 'System.Object[]'");
    expect(refused(REMOVE_ITEM, '-rf notes.txt').hints).toEqual([]);
  });
});
