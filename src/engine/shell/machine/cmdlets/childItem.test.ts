import { describe, expect, it } from 'vitest';
import { windows } from '../../../fixtures';
import { testDeps } from '../../../git/testDeps';
import type { Machine } from '../../../machine/machine';
import { machineQueries } from '../../../machine/queries';
import { Shell, type ShellResult } from '../../shell';
import dirS from '../fixtures/error-dir-s.txt?raw';
import lsA from '../fixtures/error-ls-a.txt?raw';
import lsD from '../fixtures/error-ls-d.txt?raw';
import lsL from '../fixtures/error-ls-l.txt?raw';
import ls from '../fixtures/ls.txt?raw';
import lsEnvTemp from '../fixtures/ls-env-temp.txt?raw';
import lsForce from '../fixtures/ls-force.txt?raw';
import lsName from '../fixtures/ls-name.txt?raw';
import lsRecurse from '../fixtures/ls-recurse.txt?raw';
import lsWildRecurse from '../fixtures/ls-wild-recurse.txt?raw';

/** A laptop whose home folder holds exactly what capture-shell.ps1 builds. */
function laptop(): Shell {
  const ws = windows()
    .mkdir('Users/kyle/.cache')
    .mkdir('Users/kyle/quillwork/api/docs')
    .mkdir('Users/kyle/quillwork/web')
    .write('Users/kyle/notes.txt', 'ship it\n')
    .write('Users/kyle/quillwork/api/.env.example', 'PORT=\nLOG_LEVEL=\n')
    .write(
      'Users/kyle/quillwork/api/package.json',
      '{ "name": "quillwork-api", "version": "1.0.0" }\n',
    )
    .write('Users/kyle/quillwork/api/server.js', "require('dotenv').config();\n")
    .write('Users/kyle/quillwork/api/docs/setup.md', '# Setup\n')
    .write('Users/kyle/quillwork/web/index.html', '<!doctype html>\n')
    .build(testDeps());
  const drive = ws.machine?.drive;
  if (drive === undefined) throw new Error('Not a laptop');
  // The captures' home has none of a stock laptop's other folders, nor the project mount.
  for (const extra of ['Desktop', 'Documents', 'AppData', 'quillwork/app'])
    drive.removeDir(`Users/kyle/${extra}`, { recursive: true });
  drive.hide('Users/kyle/.cache');
  return new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app');
}

const printed = (result: ShellResult) => result.lines.map((line) => `${line.text}\n`).join('');
const texts = (result: ShellResult) => result.lines.map((line) => line.text);

function machineOf(shell: Shell): Machine {
  const machine = shell.ws.machine;
  if (machine === null) throw new Error('Not a laptop');
  return machine;
}

describe('Get-ChildItem', () => {
  it('lists the folder exactly as PowerShell 7.6 does, under every alias', () => {
    const shell = laptop();
    for (const command of ['Get-ChildItem', 'ls', 'dir', 'gci', 'LS .']) {
      expect(printed(shell.run(command))).toBe(ls);
    }
  });

  it('shows hidden items with -Force, and only them with -Hidden', () => {
    const shell = laptop();
    expect(printed(shell.run('ls -Force'))).toBe(lsForce);
    expect(texts(shell.run('ls -Hidden')).filter((text) => text.includes('10:15'))).toEqual([
      'd--h-           9/27/2026 10:15 AM                .cache',
    ]);
  });

  it('prints bare names with -Name, relative to the folder when recursing', () => {
    const shell = laptop();
    expect(printed(shell.run('ls -Name'))).toBe(lsName);
    expect(texts(shell.run('ls quillwork -Recurse -Name'))).toEqual([
      'api',
      'web',
      'api\\docs',
      'api\\.env.example',
      'api\\package.json',
      'api\\server.js',
      'api\\docs\\setup.md',
      'web\\index.html',
    ]);
  });

  it('walks every folder below with -Recurse, and as deep as -Depth says', () => {
    const shell = laptop();
    expect(printed(shell.run('Get-ChildItem quillwork -Recurse'))).toBe(lsRecurse);
    const headings = (command: string) =>
      texts(shell.run(command)).filter((text) => text.startsWith('    Directory:'));
    expect(headings('ls quillwork -Depth 0')).toEqual([
      '    Directory: C:\\Users\\kyle\\quillwork',
    ]);
    expect(headings('ls quillwork -Depth 1')).toEqual([
      '    Directory: C:\\Users\\kyle\\quillwork',
      '    Directory: C:\\Users\\kyle\\quillwork\\api',
      '    Directory: C:\\Users\\kyle\\quillwork\\web',
    ]);
  });

  it('keeps only files or folders, and names that match -Filter or a wildcard', () => {
    const shell = laptop();
    const names = (command: string) => texts(shell.run(`${command} -Name`));
    expect(names('ls -File')).toEqual(['notes.txt']);
    expect(names('ls -Directory')).toEqual(['Downloads', 'quillwork']);
    expect(names('ls *.TXT')).toEqual(['notes.txt']);
    expect(names('ls quill*')).toEqual(['quillwork']);
    expect(names('ls quillwork -Recurse -Filter *.md')).toEqual(['api\\docs\\setup.md']);
    // With -Name, a wildcard matches at the top only, as in PowerShell 7.6 (checked).
    expect(names('ls quillwork\\*.json -Recurse')).toEqual([]);
    expect(names('ls -ReadOnly')).toEqual(['Downloads']);
    expect(names('ls quillwork\\web\\ind?x.[h]tml')).toEqual(['index.html']);
    expect(names('ls *.nothing')).toEqual([]);
  });

  it('filters every level with a wildcard and -Recurse, as PowerShell 7.6 prints it', () => {
    expect(printed(laptop().run('Get-ChildItem quillwork\\*.json -Recurse'))).toBe(lsWildRecurse);
  });

  it('takes -LiteralPath without wildcards, and refuses what the sandbox lacks', () => {
    const shell = laptop();
    expect(texts(shell.run('ls -LiteralPath quillwork -Name'))).toEqual(['api', 'web']);
    expect(texts(shell.run('ls -LiteralPath quill*'))).toEqual([
      "Get-ChildItem: Cannot find path 'C:\\Users\\kyle\\quill*' because it does not exist.",
    ]);
    expect(texts(shell.run('ls -Include *.md'))).toEqual([
      "This sandbox doesn't run Get-ChildItem -Include yet.",
    ]);
  });

  it('matches shortened names as PowerShell 7.6 does, with all its parameters', () => {
    const shell = laptop();
    expect(printed(shell.run('Get-ChildItem -l'))).toBe(lsL);
    expect(printed(shell.run('Get-ChildItem -a'))).toBe(lsA);
    expect(printed(shell.run('Get-ChildItem -d'))).toBe(lsD);
    expect(texts(shell.run('ls -Depth -1'))).toEqual([
      `Get-ChildItem: Cannot bind parameter 'Depth'. Cannot convert value "-1" to type "System.UInt32". Error: "Value was either too large or too small for a UInt32."`,
    ]);
  });

  it('lists a single file in its folder', () => {
    const lines = texts(laptop().run('ls quillwork\\api\\server.js'));
    expect(lines).toContain('    Directory: C:\\Users\\kyle\\quillwork\\api');
    expect(lines).toContain('-a---           9/27/2026 10:15 AM             29 server.js');
  });

  it("refuses what isn't there in PowerShell's words, and translates cmd's switches", () => {
    const shell = laptop();
    const dir = shell.run('dir /s');
    expect(printed({ ...dir, lines: dir.lines.slice(0, 1) })).toBe(dirS);
    expect(dir.lines[1]).toEqual({
      text: 'In PowerShell, dir /s is: Get-ChildItem -Recurse',
      tone: 'hint',
    });
    expect(dir.exitCode).toBe(1);
    expect(texts(shell.run('ls Q:\\games'))).toEqual([
      "Get-ChildItem: Cannot find drive. A drive with the name 'Q' does not exist.",
    ]);
    expect(texts(shell.run('ls \\\\server\\share'))[0]).toBe(
      "Get-ChildItem: Cannot find path '\\\\server\\share' because it does not exist.",
    );
    expect(texts(shell.run('ls nope\\*.md'))).toEqual([
      "Get-ChildItem: Cannot find path 'C:\\Users\\kyle\\nope' because it does not exist.",
    ]);
  });

  it('orders names by English rules, exactly as real pwsh 7.6.6 printed them', () => {
    const shell = laptop();
    const machine = machineOf(shell);
    // The folder from issue #131. A character compare puts '[' before '_' and '~' after
    // every letter; English rules put all three before the letters.
    for (const file of ['api', '_notes', 'Zeta', '~$plan.docx', '[x]', 'b.txt'])
      machine.drive.writeFile(`Users/kyle/mixed/${file}`, '');
    for (const folder of ['zdir', '_adir']) machine.drive.makeDir(`Users/kyle/mixed/${folder}`);
    const shown = texts(shell.run('dir mixed -Force -Name'));
    // What real pwsh 7.6.6 printed for `(Get-ChildItem -Force).Name` in that folder.
    expect(shown).toEqual([
      '_adir',
      'zdir',
      '_notes',
      '[x]',
      '~$plan.docx',
      'api',
      'b.txt',
      'Zeta',
    ]);
    // The Act 1 terraces lay a folder out in list()'s order, so the island has to match
    // what the player reads in the terminal.
    const listed = machineQueries(machine).list('Users/kyle/mixed');
    expect(listed.map((item) => item.name)).toEqual(shown);
  });

  it('puts an unaccented name before its accented twin, as PowerShell does', () => {
    const shell = laptop();
    const machine = machineOf(shell);
    // English rules ignoring case call these two equal, so a tie break has to settle them.
    machine.drive.writeFile('Users/kyle/cv/résumé', '');
    machine.drive.writeFile('Users/kyle/cv/resume', '');
    expect(texts(shell.run('dir cv -Name'))).toEqual(['resume', 'résumé']);
    expect(machineQueries(machine).list('Users/kyle/cv').map((item) => item.name)).toEqual([
      'resume',
      'résumé',
    ]);
  });

  it('lists what it can when one of several paths is missing', () => {
    const result = laptop().run('ls nope, notes.txt -Name');
    expect(texts(result)).toEqual([
      "Get-ChildItem: Cannot find path 'C:\\Users\\kyle\\nope' because it does not exist.",
      'notes.txt',
    ]);
    expect(result.exitCode).toBe(1);
  });
});

describe('Get-ChildItem Env:', () => {
  it('prints one variable as PowerShell does, and all of them sorted', () => {
    const shell = laptop();
    expect(printed(shell.run('Get-ChildItem Env:TEMP'))).toBe(lsEnvTemp);
    const names = texts(shell.run('ls env: -Name'));
    expect(names).toEqual(
      [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    );
    expect(names).toContain('Path');
    expect(names).toContain('USERPROFILE');
  });

  it('sorts variables by the same English rules as files', () => {
    const shell = laptop();
    machineOf(shell).active().env.set('~BACKUP', 'on');
    // A character compare would put '~' after every letter; English rules put it first.
    expect(texts(shell.run('ls env: -Name'))[0]).toBe('~BACKUP');
  });

  it('matches names in any case, and wildcards', () => {
    const shell = laptop();
    expect(texts(shell.run('ls ENV:\\temp -Name'))).toEqual(['TEMP']);
    expect(texts(shell.run('ls env:*PATH* -Name'))).toEqual(['HOMEPATH', 'Path', 'PATHEXT']);
  });

  it("refuses a variable that isn't set", () => {
    const result = laptop().run('ls Env:NOPE');
    expect(texts(result)).toEqual([
      "Get-ChildItem: Cannot find path 'NOPE' because it does not exist.",
    ]);
    expect(result.exitCode).toBe(1);
  });
});
