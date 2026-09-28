import { describe, expect, it } from 'vitest';
import type { OutputLine } from '../../git/cli/output';
import { itemTable, nameValueTable, windowsLength, type ItemRow } from './format';
import ls from './fixtures/ls.txt?raw';
import lsEnvTemp from './fixtures/ls-env-temp.txt?raw';
import lsForce from './fixtures/ls-force.txt?raw';
import lsRecurse from './fixtures/ls-recurse.txt?raw';

const printed = (lines: readonly OutputLine[]) => lines.map((line) => `${line.text}\n`).join('');

const dir = (name: string, hidden = false, readOnly = false): ItemRow => ({
  name,
  kind: 'dir',
  hidden,
  readOnly,
  length: 0,
});
const file = (name: string, content: string): ItemRow => ({
  name,
  kind: 'file',
  hidden: false,
  readOnly: false,
  length: windowsLength(content),
});

// The same tree capture-shell.ps1 builds, so the tables can match its captures. Downloads is
// read-only, as on a stock Windows home.
const HOME = [dir('Downloads', false, true), dir('quillwork'), file('notes.txt', 'ship it\n')];

describe('itemTable', () => {
  it("prints a folder exactly as PowerShell 7.6's Get-ChildItem does", () => {
    expect(printed(itemTable([{ folder: 'C:\\Users\\kyle', rows: HOME }]))).toBe(ls);
  });

  it('marks hidden folders d--h-, and read-only ones d-r--', () => {
    const rows = [dir('.cache', true), ...HOME];
    expect(printed(itemTable([{ folder: 'C:\\Users\\kyle', rows }]))).toBe(lsForce);
  });

  it('prints one section per folder, as -Recurse does', () => {
    const sections = [
      { folder: 'C:\\Users\\kyle\\quillwork', rows: [dir('api'), dir('web')] },
      {
        folder: 'C:\\Users\\kyle\\quillwork\\api',
        rows: [
          dir('docs'),
          file('.env.example', 'PORT=\nLOG_LEVEL=\n'),
          file('package.json', '{ "name": "quillwork-api", "version": "1.0.0" }\n'),
          file('server.js', "require('dotenv').config();\n"),
        ],
      },
      { folder: 'C:\\Users\\kyle\\quillwork\\api\\docs', rows: [file('setup.md', '# Setup\n')] },
      {
        folder: 'C:\\Users\\kyle\\quillwork\\web',
        rows: [file('index.html', '<!doctype html>\n')],
      },
    ];
    expect(printed(itemTable(sections))).toBe(lsRecurse);
  });

  it('prints nothing for an empty folder, and skips empty sections', () => {
    expect(itemTable([{ folder: 'C:\\empty', rows: [] }])).toEqual([]);
    expect(itemTable([])).toEqual([]);
    const lines = itemTable([
      { folder: 'C:\\empty', rows: [] },
      { folder: 'C:\\Users\\kyle', rows: HOME },
    ]);
    expect(printed(lines)).toBe(ls);
  });

  it('colors headings as meta and rows as plain', () => {
    const [blank, heading] = itemTable([{ folder: 'C:\\Users\\kyle', rows: HOME }]);
    expect(blank?.tone).toBe('plain');
    expect(heading?.tone).toBe('meta');
  });
});

describe('nameValueTable', () => {
  it('prints a variable as PowerShell prints Get-ChildItem Env:TEMP', () => {
    const lines = nameValueTable([
      { name: 'TEMP', value: 'C:\\Users\\kyle\\AppData\\Local\\Temp' },
    ]);
    expect(printed(lines)).toBe(lsEnvTemp);
    expect(nameValueTable([])).toEqual([]);
  });

  it('cuts a row longer than the terminal with an ellipsis, as PowerShell does', () => {
    // Checked in pwsh 7.6.6 at -Width 120: the row ends at column 120 with …
    const long = 'abcdefghij'.repeat(12);
    const [, , , row] = nameValueTable([{ name: 'LONGVAR', value: long }]);
    expect(row?.text).toBe(`${'LONGVAR'.padEnd(31)}${long.slice(0, 88)}…`);
    expect(row?.text).toHaveLength(120);
    const [, , , narrow] = nameValueTable([{ name: 'X'.repeat(40), value: 'v' }], 60);
    expect(narrow?.text).toBe(`${'X'.repeat(29)}… v`);
  });
});

describe('windowsLength', () => {
  it('counts UTF-8 bytes, with line ends as \\r\\n', () => {
    expect(windowsLength('ship it\n')).toBe(9);
    expect(windowsLength('ship it\r\n')).toBe(9);
    expect(windowsLength('')).toBe(0);
    expect(windowsLength('é€😀')).toBe(2 + 3 + 4);
  });
});
