import { describe, expect, it } from 'vitest';
import { windows } from '../../../fixtures';
import { testDeps } from '../../../git/testDeps';
import { Shell, type ShellResult } from '../../shell';

function laptop() {
  const ws = windows()
    .mkdir('Users/kyle/folder')
    .write('Users/kyle/notes.txt', 'one\ntwo\nthree\n')
    .write('Users/kyle/bare.txt', 'x')
    .build(testDeps());
  const drive = ws.machine?.drive;
  if (drive === undefined) throw new Error('Not a laptop');
  return { shell: new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app'), drive };
}

const texts = (result: ShellResult) => result.lines.map((line) => line.text);

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
  });
});

describe('Set-Content and Add-Content', () => {
  it('replaces a file with one line per value', () => {
    const { shell, drive } = laptop();
    expect(shell.run('Set-Content notes.txt a, b')).toEqual({ lines: [], exitCode: 0 });
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('a\nb\n');
    shell.run('Set-Content new.txt -Value "ship it"');
    expect(drive.readFile('Users/kyle/new.txt')).toBe('ship it\n');
  });

  it('appends straight after what is there, as PowerShell does', () => {
    const { shell, drive } = laptop();
    shell.run('Add-Content notes.txt four; ac bare.txt y; ac made.txt z');
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('one\ntwo\nthree\nfour\n');
    expect(drive.readFile('Users/kyle/bare.txt')).toBe('xy\n');
    expect(drive.readFile('Users/kyle/made.txt')).toBe('z\n');
  });

  it("refuses folders and missing folders in PowerShell's words", () => {
    const { shell } = laptop();
    expect(texts(shell.run('Set-Content folder x'))).toEqual([
      "Set-Content: Unable to clear content of 'C:\\Users\\kyle\\folder' because it is a directory. Clear-Content is only supported on files.",
    ]);
    expect(texts(shell.run('Add-Content folder x'))).toEqual([
      "Add-Content: Access to the path 'C:\\Users\\kyle\\folder' is denied.",
    ]);
    expect(texts(shell.run('Set-Content nope\\x.txt x'))).toEqual([
      "Set-Content: Could not find a part of the path 'C:\\Users\\kyle\\nope\\x.txt'.",
    ]);
    expect(texts(shell.run('Set-Content Q:\\x.txt x'))[0]).toContain("drive with the name 'Q'");
    expect(texts(shell.run('Set-Content'))[0]).toContain('missing mandatory parameters: Path');
  });
});

describe('Write-Output', () => {
  it('prints each value on its own line, under every alias', () => {
    const { shell } = laptop();
    expect(texts(shell.run('Write-Output a b'))).toEqual(['a', 'b']);
    expect(texts(shell.run("echo 'a b' c"))).toEqual(['a b', 'c']);
    expect(texts(shell.run('write "$HOME"'))).toEqual(['C:\\Users\\kyle']);
    expect(texts(shell.run('echo a -zz'))).toEqual(['a', '-zz']);
    expect(texts(shell.run('echo'))).toEqual([]);
  });
});
