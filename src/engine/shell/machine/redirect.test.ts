import { describe, expect, it } from 'vitest';
import { windows } from '../../fixtures';
import { testDeps } from '../../git/testDeps';
import { Shell, type ShellResult } from '../shell';

function laptop() {
  const ws = windows()
    .mkdir('Users/kyle/folder')
    .write('Users/kyle/notes.txt', 'ship it\n')
    .build(testDeps());
  const drive = ws.machine?.drive;
  if (drive === undefined) throw new Error('Not a laptop');
  return { shell: new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app'), drive };
}

const texts = (result: ShellResult) => result.lines.map((line) => line.text);
const silent = { lines: [], exitCode: 0 };

describe('redirects', () => {
  it('> writes output to a file instead of the screen, and >> adds to it', () => {
    const { shell, drive } = laptop();
    expect(shell.run('echo hi > out.txt')).toEqual(silent);
    expect(drive.readFile('Users/kyle/out.txt')).toBe('hi\n');
    shell.run('echo more >> out.txt');
    expect(drive.readFile('Users/kyle/out.txt')).toBe('hi\nmore\n');
    shell.run('echo fresh > out.txt');
    expect(drive.readFile('Users/kyle/out.txt')).toBe('fresh\n');
    // Inside a word, >> is text (PowerShell prints it); 1> at a token's start redirects.
    expect(texts(shell.run('echo last>>out.txt'))).toEqual(['last>>out.txt']);
    shell.run('echo 1>one.txt');
    expect(drive.readFile('Users/kyle/one.txt')).toBe('');
  });

  it('opens the file before the command runs, as PowerShell does', () => {
    const { shell, drive } = laptop();
    shell.run('ls -Name > files.txt');
    expect(drive.readFile('Users/kyle/files.txt').split('\n')).toContain('files.txt');
  });

  it('takes a redirect anywhere in the line', () => {
    const { shell, drive } = laptop();
    shell.run('echo a > out.txt b');
    expect(drive.readFile('Users/kyle/out.txt')).toBe('a\nb\n');
  });

  it('2> sends errors elsewhere, and 2>$null drops them', () => {
    const { shell, drive } = laptop();
    expect(shell.run('cat nope.txt 2>$null')).toEqual({ lines: [], exitCode: 1 });
    shell.run('cat nope.txt 2> errors.txt');
    expect(drive.readFile('Users/kyle/errors.txt')).toBe(
      "Get-Content: Cannot find path 'C:\\Users\\kyle\\nope.txt' because it does not exist.\n",
    );
    expect(texts(shell.run('cat notes.txt, nope.txt 2>$null'))).toEqual(['ship it']);
  });

  it('keeps errors on screen when only output goes to a file', () => {
    const { shell, drive } = laptop();
    expect(texts(shell.run('cat notes.txt, nope.txt > out.txt'))).toEqual([
      "Get-Content: Cannot find path 'C:\\Users\\kyle\\nope.txt' because it does not exist.",
    ]);
    expect(drive.readFile('Users/kyle/out.txt')).toBe('ship it\n');
  });

  it("refuses bad targets in Out-File's words, without running the command", () => {
    const { shell, drive } = laptop();
    expect(texts(shell.run('echo hi > folder'))).toEqual([
      "Out-File: Access to the path 'C:\\Users\\kyle\\folder' is denied.",
    ]);
    expect(texts(shell.run('rm notes.txt > nope\\x.txt'))).toEqual([
      "Out-File: Could not find a part of the path 'C:\\Users\\kyle\\nope\\x.txt'.",
    ]);
    expect(drive.isFile('Users/kyle/notes.txt')).toBe(true);
    expect(texts(shell.run('echo hi > Q:\\x.txt'))[0]).toContain("drive with the name 'Q'");
    expect(texts(shell.run('echo hi >'))).toEqual([
      'Missing file specification after redirection operator.',
    ]);
    expect(texts(shell.run('echo hi > a.txt > b.txt'))).toEqual([
      'The output stream for this command is already redirected.',
    ]);
    expect(texts(shell.run('echo hi 2> a.txt 2> b.txt'))).toEqual([
      'The error stream for this command is already redirected.',
    ]);
  });
});
