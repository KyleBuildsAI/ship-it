import { describe, expect, it } from 'vitest';
import { windows } from '../../../fixtures';
import { testDeps } from '../../../git/testDeps';
import type { EngineEvent } from '../../../workspace';
import { Shell, type ShellResult } from '../../shell';

function laptop() {
  const ws = windows()
    .mkdir('Users/kyle/folder')
    .write('Users/kyle/notes.txt', 'one\ntwo\nthree\n')
    .write('Users/kyle/bare.txt', 'x')
    .build(testDeps());
  const drive = ws.machine?.drive;
  if (drive === undefined) throw new Error('Not a laptop');
  const events: EngineEvent[] = [];
  ws.events.on((event) => events.push(event));
  return { shell: new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app'), drive, events };
}

const texts = (result: ShellResult) => result.lines.map((line) => line.text);
const silent = { lines: [], exitCode: 0 };
/** PowerShell's error when a wildcard matches nothing. It names the first path typed. */
const noMatch = (cmdlet: string, path: string) =>
  `${cmdlet}: An object at the specified path ${path} does not exist, or has been filtered by the -Include or -Exclude parameter.`;
const tooSmall = (parameter: string, value: string) =>
  `Get-Content: Cannot validate argument on parameter '${parameter}'. The ${value} argument is less than the minimum allowed range of 0. Supply an argument that is greater than or equal to 0 and then try the command again.`;

describe('Get-Content', () => {
  it("prints a file's lines, under every alias", () => {
    const { shell } = laptop();
    for (const command of [
      'Get-Content notes.txt',
      'cat notes.txt',
      'type NOTES.TXT',
      'gc notes.txt',
    ])
      expect(texts(shell.run(command))).toEqual(['one', 'two', 'three']);
  });

  it('keeps the first or last lines, or the raw text', () => {
    const { shell } = laptop();
    expect(texts(shell.run('cat notes.txt -TotalCount 2'))).toEqual(['one', 'two']);
    expect(texts(shell.run('cat notes.txt -Head 1'))).toEqual(['one']);
    expect(texts(shell.run('cat notes.txt -Tail 1'))).toEqual(['three']);
    expect(texts(shell.run('cat notes.txt -Tail 0'))).toEqual([]);
    // -Raw is one piece of text, so its final line end shows as an empty line.
    expect(texts(shell.run('cat notes.txt -Raw'))).toEqual(['one', 'two', 'three', '']);
    expect(texts(shell.run('cat bare.txt -Raw'))).toEqual(['x']);
  });

  it('reads several files, and wildcards', () => {
    const { shell } = laptop();
    expect(texts(shell.run('cat bare.txt, notes.txt -Tail 1'))).toEqual(['x', 'three']);
    expect(texts(shell.run('cat *.txt -Head 1'))).toEqual(['x', 'one']);
  });

  it("refuses in PowerShell's words", () => {
    const { shell } = laptop();
    expect(texts(shell.run('cat nope.txt'))).toEqual([
      "Get-Content: Cannot find path 'C:\\Users\\kyle\\nope.txt' because it does not exist.",
    ]);
    expect(texts(shell.run('cat folder'))).toEqual([
      "Get-Content: Unable to get content because it is a directory: 'C:\\Users\\kyle\\folder'. Please use 'Get-ChildItem' instead.",
    ]);
    expect(texts(shell.run('Get-Content'))).toEqual([
      'Get-Content: Cannot process command because of one or more missing mandatory parameters: Path.',
    ]);
    // Every path is looked up before any is read, so a missing one is named first.
    expect(texts(shell.run('cat folder, nope.txt'))).toEqual([
      "Get-Content: Cannot find path 'C:\\Users\\kyle\\nope.txt' because it does not exist.",
      "Get-Content: Unable to get content because it is a directory: 'C:\\Users\\kyle\\folder'. Please use 'Get-ChildItem' instead.",
    ]);
  });

  it('refuses a wildcard that matches nothing, naming the first path typed', () => {
    const { shell, drive } = laptop();
    drive.writeFile('Users/kyle/h.log', 'h\n');
    drive.hide('Users/kyle/h.log');
    const result = shell.run('cat *.xyz');
    expect(texts(result)).toEqual([noMatch('Get-Content', '*.xyz')]);
    expect(result.exitCode).toBe(1);
    expect(texts(shell.run('cat .\\*.xyz'))).toEqual([noMatch('Get-Content', '.\\*.xyz')]);
    // PowerShell's own quirk: the message names the first path, not the one that failed.
    expect(texts(shell.run('cat notes.txt, *.xyz'))).toEqual([
      noMatch('Get-Content', 'notes.txt'),
      'one',
      'two',
      'three',
    ]);
    // A hidden file doesn't count, and a file can't hold matches.
    expect(texts(shell.run('cat *.log'))).toEqual([noMatch('Get-Content', '*.log')]);
    expect(texts(shell.run('cat bare.txt\\*.txt'))).toEqual([
      noMatch('Get-Content', 'bare.txt\\*.txt'),
    ]);
    expect(texts(shell.run('cat nope\\*.txt'))).toEqual([
      "Get-Content: Cannot find path 'C:\\Users\\kyle\\nope' because it does not exist.",
    ]);
  });

  it('refuses counts it cannot use, as pwsh 7.6.6 does', () => {
    const { shell } = laptop();
    expect(texts(shell.run('cat notes.txt -TotalCount -1'))).toEqual([
      tooSmall('TotalCount', '-1'),
    ]);
    expect(texts(shell.run('cat notes.txt -Head -1'))).toEqual([tooSmall('TotalCount', '-1')]);
    expect(texts(shell.run('cat notes.txt -Tail -1'))).toEqual([tooSmall('Tail', '-1')]);
    // The first one typed is checked first, and the converted number is named.
    expect(texts(shell.run('cat notes.txt -Tail -1 -TotalCount -2'))).toEqual([
      tooSmall('Tail', '-1'),
    ]);
    expect(texts(shell.run('cat notes.txt -TotalCount -1.4'))).toEqual([
      tooSmall('TotalCount', '-1'),
    ]);
    expect(texts(shell.run('Get-Content -TotalCount -1'))).toEqual([tooSmall('TotalCount', '-1')]);
    const both = [
      'Get-Content: The parameters TotalCount and Tail cannot be used together. Please specify only one parameter.',
    ];
    expect(texts(shell.run('cat notes.txt -Tail 1 -TotalCount 1'))).toEqual(both);
    expect(texts(shell.run('cat nope.txt -Tail 1 -TotalCount 1'))).toEqual(both);
    expect(texts(shell.run('cat notes.txt -Raw -Tail 1 -TotalCount 1'))).toEqual(both);
    expect(texts(shell.run('Get-Content -TotalCount 1 -Tail 1'))).toEqual([
      'Get-Content: Cannot process command because of one or more missing mandatory parameters: Path.',
    ]);
    // Reading no lines needs no file at all.
    expect(shell.run('cat nope.txt -TotalCount 0')).toEqual(silent);
    expect(shell.run('cat notes.txt -Raw -TotalCount 0')).toEqual(silent);
  });

  it('refuses -Raw with a count at the first file found, after the lookups', () => {
    const { shell } = laptop();
    const rawTail =
      "Get-Content: The 'Raw' and 'Tail' parameters cannot be specified in the same command.";
    expect(texts(shell.run('cat notes.txt -Raw -Tail 1'))).toEqual([rawTail]);
    expect(texts(shell.run('cat notes.txt -Raw -Tail 0'))).toEqual([rawTail]);
    expect(texts(shell.run('cat notes.txt -Raw -TotalCount 1'))).toEqual([
      "Get-Content: The 'Raw' and 'TotalCount' parameters cannot be specified in the same command.",
    ]);
    expect(texts(shell.run('cat notes.txt, bare.txt -Raw -Tail 1'))).toEqual([rawTail]);
    expect(texts(shell.run('cat folder, notes.txt -Raw -Tail 1'))).toEqual([rawTail]);
    expect(texts(shell.run('cat notes.txt, nope.txt -Raw -Tail 1'))).toEqual([
      "Get-Content: Cannot find path 'C:\\Users\\kyle\\nope.txt' because it does not exist.",
      rawTail,
    ]);
    // With nothing found, only the lookup is refused.
    expect(texts(shell.run('cat nope.txt -Raw -Tail 1'))).toEqual([
      "Get-Content: Cannot find path 'C:\\Users\\kyle\\nope.txt' because it does not exist.",
    ]);
    expect(texts(shell.run('cat *.xyz -Raw -Tail 1'))).toEqual([noMatch('Get-Content', '*.xyz')]);
  });
});

describe('Set-Content and Add-Content', () => {
  it('replaces a file with one line per value', () => {
    const { shell, drive, events } = laptop();
    expect(shell.run('Set-Content notes.txt a, b')).toEqual(silent);
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('a\nb\n');
    shell.run('Set-Content new.txt -Value "ship it"');
    expect(drive.readFile('Users/kyle/new.txt')).toBe('ship it\n');
    expect(events).toEqual([
      { type: 'fileChanged', path: 'Users/kyle/notes.txt', change: 'modified' },
      { type: 'fileChanged', path: 'Users/kyle/new.txt', change: 'created' },
    ]);
  });

  it('appends straight after what is there, as PowerShell does', () => {
    const { shell, drive, events } = laptop();
    shell.run('Add-Content notes.txt four; ac bare.txt y; ac made.txt z');
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('one\ntwo\nthree\nfour\n');
    expect(drive.readFile('Users/kyle/bare.txt')).toBe('xy\n');
    expect(drive.readFile('Users/kyle/made.txt')).toBe('z\n');
    expect(events).toEqual([
      { type: 'fileChanged', path: 'Users/kyle/notes.txt', change: 'modified' },
      { type: 'fileChanged', path: 'Users/kyle/bare.txt', change: 'modified' },
      { type: 'fileChanged', path: 'Users/kyle/made.txt', change: 'created' },
    ]);
  });

  it('needs both a path and a value, and writes nothing without them', () => {
    const { shell, drive, events } = laptop();
    const missing = (cmdlet: string, names: string) =>
      `${cmdlet}: Cannot process command because of one or more missing mandatory parameters: ${names}.`;
    expect(texts(shell.run('Set-Content'))).toEqual([missing('Set-Content', 'Value Path')]);
    expect(texts(shell.run('Add-Content'))).toEqual([missing('Add-Content', 'Value Path')]);
    expect(texts(shell.run('Set-Content -Value x'))).toEqual([missing('Set-Content', 'Path')]);
    const result = shell.run('Set-Content notes.txt');
    expect(texts(result)).toEqual([missing('Set-Content', 'Value')]);
    expect(result.exitCode).toBe(1);
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('one\ntwo\nthree\n');
    expect(texts(shell.run('Add-Content made.txt'))).toEqual([missing('Add-Content', 'Value')]);
    expect(drive.exists('Users/kyle/made.txt')).toBe(false);
    expect(events).toEqual([]);
  });

  it("refuses folders and missing folders in PowerShell's words", () => {
    const { shell } = laptop();
    expect(texts(shell.run('Set-Content folder x'))).toEqual([
      "Set-Content: Unable to clear content of 'C:\\Users\\kyle\\folder' because it is a directory. Clear-Content is only supported on files.",
    ]);
    expect(texts(shell.run('Add-Content folder x'))).toEqual([
      "Add-Content: Unable to write content because it is a directory: 'C:\\Users\\kyle\\folder'.",
    ]);
    expect(texts(shell.run('Set-Content nope\\x.txt x'))).toEqual([
      "Set-Content: Could not find a part of the path 'C:\\Users\\kyle\\nope\\x.txt'.",
    ]);
    expect(texts(shell.run('Set-Content Q:\\x.txt x'))).toEqual([
      "Set-Content: Cannot find drive. A drive with the name 'Q' does not exist.",
    ]);
  });

  it('refuses a file standing where a folder should be, and writes nothing there', () => {
    const { shell, drive, events } = laptop();
    for (const cmdlet of ['Set-Content', 'Add-Content']) {
      const result = shell.run(`${cmdlet} bare.txt\\x.txt hi`);
      expect(texts(result)).toEqual([
        `${cmdlet}: Could not find a part of the path 'C:\\Users\\kyle\\bare.txt\\x.txt'.`,
      ]);
      expect(result.exitCode).toBe(1);
    }
    expect(texts(shell.run('Set-Content bare.txt\\sub\\x.txt hi'))).toEqual([
      "Set-Content: Could not find a part of the path 'C:\\Users\\kyle\\bare.txt\\sub\\x.txt'.",
    ]);
    expect(drive.readFile('Users/kyle/bare.txt')).toBe('x');
    expect(events).toEqual([]);
    // The other paths are still written.
    shell.run('Set-Content bare.txt\\x.txt, notes.txt z');
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('z\n');
  });

  it('writes every visible match of a wildcard, and never makes a file named *', () => {
    const { shell, drive, events } = laptop();
    drive.writeFile('Users/kyle/h.txt', 'h\n');
    drive.hide('Users/kyle/h.txt');
    expect(shell.run('Set-Content *.txt z')).toEqual(silent);
    expect(drive.readFile('Users/kyle/bare.txt')).toBe('z\n');
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('z\n');
    expect(drive.readFile('Users/kyle/h.txt')).toBe('h\n');
    expect(drive.exists('Users/kyle/*.txt')).toBe(false);
    shell.run('Add-Content n*.txt y');
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('z\ny\n');
    expect(events).toEqual([
      { type: 'fileChanged', path: 'Users/kyle/bare.txt', change: 'modified' },
      { type: 'fileChanged', path: 'Users/kyle/notes.txt', change: 'modified' },
      { type: 'fileChanged', path: 'Users/kyle/notes.txt', change: 'modified' },
    ]);
  });

  it('refuses a wildcard that matches nothing, naming the first path typed', () => {
    const { shell, drive, events } = laptop();
    drive.writeFile('Users/kyle/h.log', 'h\n');
    drive.hide('Users/kyle/h.log');
    expect(texts(shell.run('Set-Content *.xyz z'))).toEqual([noMatch('Set-Content', '*.xyz')]);
    expect(texts(shell.run('Add-Content *.xyz z'))).toEqual([noMatch('Add-Content', '*.xyz')]);
    expect(texts(shell.run('Set-Content .\\*.xyz z'))).toEqual([
      noMatch('Set-Content', '.\\*.xyz'),
    ]);
    expect(texts(shell.run('Set-Content *.log z'))).toEqual([noMatch('Set-Content', '*.log')]);
    expect(texts(shell.run('Set-Content bare.txt\\*.txt z'))).toEqual([
      noMatch('Set-Content', 'bare.txt\\*.txt'),
    ]);
    expect(texts(shell.run('Set-Content nope\\*.txt z'))).toEqual([
      "Set-Content: Cannot find path 'C:\\Users\\kyle\\nope' because it does not exist.",
    ]);
    expect(drive.exists('Users/kyle/*.xyz')).toBe(false);
    expect(events).toEqual([]);
    // Lookups are reported before the files are opened, whatever order they were typed in.
    expect(texts(shell.run('Set-Content nope\\x.txt, *.xyz z'))).toEqual([
      noMatch('Set-Content', 'nope\\x.txt'),
      "Set-Content: Could not find a part of the path 'C:\\Users\\kyle\\nope\\x.txt'.",
    ]);
    expect(texts(shell.run('Set-Content Q:\\x.txt, *.xyz z'))).toEqual([
      "Set-Content: Cannot find drive. A drive with the name 'Q' does not exist.",
      noMatch('Set-Content', 'Q:\\x.txt'),
    ]);
    // The paths that did match are still written; Set-Content writes a hidden file by name.
    expect(texts(shell.run('Set-Content bare.txt, *.xyz, h.log w'))).toEqual([
      noMatch('Set-Content', 'bare.txt'),
    ]);
    expect(drive.readFile('Users/kyle/bare.txt')).toBe('w\n');
    expect(drive.readFile('Users/kyle/h.log')).toBe('w\n');
  });

  it('Set-Content empties files first, and stops at one it cannot empty', () => {
    const { shell, drive, events } = laptop();
    drive.writeFile('Users/kyle/ro.txt', 'ro\n');
    drive.setReadOnly('Users/kyle/ro.txt');
    // As in pwsh 7.6.6: files before the folder are left empty, and nothing is written.
    expect(texts(shell.run('Set-Content bare.txt, folder, notes.txt z'))).toEqual([
      "Set-Content: Unable to clear content of 'C:\\Users\\kyle\\folder' because it is a directory. Clear-Content is only supported on files.",
    ]);
    expect(drive.readFile('Users/kyle/bare.txt')).toBe('');
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('one\ntwo\nthree\n');
    expect(events).toEqual([
      { type: 'fileChanged', path: 'Users/kyle/bare.txt', change: 'modified' },
    ]);
    const result = shell.run('Set-Content notes.txt, ro.txt, nope\\x.txt z');
    expect(texts(result)).toEqual([
      "Set-Content: Access to the path 'C:\\Users\\kyle\\ro.txt' is denied.",
    ]);
    expect(result.exitCode).toBe(1);
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('');
    expect(drive.readFile('Users/kyle/ro.txt')).toBe('ro\n');
  });

  it('Add-Content refuses a folder or a read-only file, and still writes the rest', () => {
    const { shell, drive } = laptop();
    drive.writeFile('Users/kyle/ro.txt', 'ro\n');
    drive.setReadOnly('Users/kyle/ro.txt');
    expect(texts(shell.run('Add-Content folder, ro.txt, bare.txt z'))).toEqual([
      "Add-Content: Unable to write content because it is a directory: 'C:\\Users\\kyle\\folder'.",
      "Add-Content: Access to the path 'C:\\Users\\kyle\\ro.txt' is denied.",
    ]);
    expect(drive.readFile('Users/kyle/ro.txt')).toBe('ro\n');
    expect(drive.readFile('Users/kyle/bare.txt')).toBe('xz\n');
  });
});

describe('Write-Output', () => {
  it('prints each value on its own line, under every alias', () => {
    const { shell } = laptop();
    expect(texts(shell.run('Write-Output a b'))).toEqual(['a', 'b']);
    expect(texts(shell.run("echo 'a b' c"))).toEqual(['a b', 'c']);
    expect(texts(shell.run('write "$HOME"'))).toEqual(['C:\\Users\\kyle']);
  });

  it('takes an unknown -name as text, wherever it is, until -InputObject is named', () => {
    const { shell } = laptop();
    expect(texts(shell.run('echo a -zz'))).toEqual(['a', '-zz']);
    expect(texts(shell.run('Write-Output -zz a'))).toEqual(['-zz', 'a']);
    expect(texts(shell.run('echo -zz'))).toEqual(['-zz']);
    expect(texts(shell.run('echo -zz a -yy b'))).toEqual(['-zz', 'a', '-yy', 'b']);
    expect(texts(shell.run('Write-Output a -NoEnumerate b'))).toEqual(['a', 'b']);
    expect(texts(shell.run('Write-Output -zz -NoEnumerate a'))).toEqual(['-zz', 'a']);
    expect(texts(shell.run('Write-Output -InputObject a -zz'))).toEqual([
      "Write-Output: A parameter cannot be found that matches parameter name 'zz'.",
    ]);
  });

  it('needs something to print, and says so under its own name', () => {
    const { shell } = laptop();
    const missing =
      'Write-Output: Cannot process command because of one or more missing mandatory parameters: InputObject.';
    for (const command of ['echo', 'Write-Output', 'write', 'Write-Output -NoEnumerate']) {
      const result = shell.run(command);
      expect(texts(result)).toEqual([missing]);
      expect(result.exitCode).toBe(1);
    }
  });
});
