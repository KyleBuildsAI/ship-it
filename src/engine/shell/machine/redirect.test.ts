import { describe, expect, it } from 'vitest';
import { windows } from '../../fixtures';
import { line } from '../../git/cli/output';
import { testDeps } from '../../git/testDeps';
import type { EngineEvent } from '../../workspace';
import { Shell, type ShellResult } from '../shell';
import { pour } from './redirect';

function laptop() {
  const ws = windows()
    .mkdir('Users/kyle/folder')
    .write('Users/kyle/notes.txt', 'ship it\n')
    .write('Users/kyle/a.txt', 'a\n')
    .write('Users/kyle/dest/k.txt', 'k\n')
    .build(testDeps());
  const machine = ws.machine;
  if (machine === null) throw new Error('Not a laptop');
  const events: EngineEvent[] = [];
  ws.events.on((event) => events.push(event));
  const shell = new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app');
  return { ws, machine, shell, drive: machine.drive, events };
}

const texts = (result: ShellResult) => result.lines.map((line) => line.text);
const silent = { lines: [], exitCode: 0 };
const failedSilently = { lines: [], exitCode: 1 };

const NOPE = "Get-Content: Cannot find path 'C:\\Users\\kyle\\nope.txt' because it does not exist.";
const NOT_RECOGNIZED = [
  "nosuchcmd: The term 'nosuchcmd' is not recognized as a name of a cmdlet, function, script file, or executable program.",
  'Check the spelling of the name, or if a path was included, verify that the path is correct and try again.',
];
/** .NET's words for a file a redirect holds, with and without the path. */
const held = (path: string) =>
  `The process cannot access the file '${path}' because it is being used by another process.`;
const HELD_NO_PATH =
  'The process cannot access the file because it is being used by another process.';

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
    // Only output goes to one.txt, so the binding error stays on screen (checked in 7.6.6).
    expect(texts(shell.run('echo 1>one.txt'))).toEqual([
      'Write-Output: Cannot process command because of one or more missing mandatory parameters: InputObject.',
    ]);
    expect(drive.readFile('Users/kyle/one.txt')).toBe('');
  });

  it('announces each file it makes or changes, for the world to show', () => {
    const { shell, events } = laptop();
    shell.run('echo hi > out.txt');
    expect(events).toEqual([
      { type: 'fileChanged', path: 'Users/kyle/out.txt', change: 'created' },
      { type: 'fileChanged', path: 'Users/kyle/out.txt', change: 'modified' },
    ]);
    events.length = 0;
    shell.run('echo more >> out.txt');
    expect(events).toEqual([
      { type: 'fileChanged', path: 'Users/kyle/out.txt', change: 'modified' },
    ]);
    events.length = 0;
    shell.run('cat nope.txt 2> errors.txt');
    expect(events).toEqual([
      { type: 'fileChanged', path: 'Users/kyle/errors.txt', change: 'created' },
      { type: 'fileChanged', path: 'Users/kyle/errors.txt', change: 'modified' },
    ]);
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
    expect(drive.readFile('Users/kyle/errors.txt')).toBe(`${NOPE}\n`);
    expect(texts(shell.run('cat notes.txt, nope.txt 2>$null'))).toEqual(['ship it']);
  });

  it('keeps errors on screen when only output goes to a file', () => {
    const { shell, drive } = laptop();
    expect(texts(shell.run('cat notes.txt, nope.txt > out.txt'))).toEqual([NOPE]);
    expect(drive.readFile('Users/kyle/out.txt')).toBe('ship it\n');
  });

  it('2>&1 sends errors wherever the output goes, in the order they came', () => {
    const { shell, drive } = laptop();
    // With output on screen, it changes nothing there.
    expect(texts(shell.run('echo hi 2>&1'))).toEqual(['hi']);
    expect(texts(shell.run('cat nope.txt 2>&1'))).toEqual([NOPE]);
    expect(shell.run('cat notes.txt, nope.txt 2>&1 > out.txt')).toEqual(failedSilently);
    expect(drive.readFile('Users/kyle/out.txt')).toBe(`${NOPE}\nship it\n`);
    // Either order works, and 2>&1 ends at its 1: 2>&1x is 2>&1 then x.
    shell.run('cat nope.txt > out2.txt 2>&1');
    expect(drive.readFile('Users/kyle/out2.txt')).toBe(`${NOPE}\n`);
    shell.run('cat nope.txt 2>&1>out3.txt');
    expect(drive.readFile('Users/kyle/out3.txt')).toBe(`${NOPE}\n`);
    expect(texts(shell.run('echo hi 2>&1x'))).toEqual(['hi', 'x']);
    expect(shell.run('cat nope.txt 2>&1 > $null')).toEqual(failedSilently);
  });

  it("refuses the other ways to write 2>&1 in PowerShell's words", () => {
    const { shell, drive } = laptop();
    expect(texts(shell.run('echo hi 1>&2'))).toEqual([
      "The '1>&2' operator is reserved for future use.",
      'To send errors where the output goes, use 2>&1.',
    ]);
    expect(texts(shell.run('echo hi 2>&2'))[0]).toBe(
      "The '2>&2' operator is reserved for future use.",
    );
    for (const line of ['echo hi 2>>&1', 'echo hi 2>& 1', 'echo hi 2>&3', 'echo hi >&1'])
      expect(texts(shell.run(line))).toEqual([
        'Missing file specification after redirection operator.',
      ]);
    for (const line of ['echo hi 2>&1 2>&1', 'echo hi 2>&1 2> e.txt', 'echo hi 2> e.txt 2>&1'])
      expect(texts(shell.run(line))).toEqual([
        'The error stream for this command is already redirected.',
      ]);
    expect(drive.isFile('Users/kyle/e.txt')).toBe(false);
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

  it('refuses a file standing where a folder should be, instead of a drive error', () => {
    const { shell, drive, events } = laptop();
    for (const line of ['echo hi > a.txt\\x.txt', 'echo hi 2> a.txt\\x.txt'])
      expect(shell.run(line)).toEqual({
        lines: [
          {
            text: "Out-File: Could not find a part of the path 'C:\\Users\\kyle\\a.txt\\x.txt'.",
            tone: 'error',
          },
        ],
        exitCode: 1,
      });
    expect(drive.readFile('Users/kyle/a.txt')).toBe('a\n');
    expect(events).toEqual([]);
  });

  it('lets a wildcard name exactly one visible file, as Out-File does', () => {
    const { shell, drive } = laptop();
    expect(texts(shell.run('echo hi > *.txt'))).toEqual([
      'Out-File: Cannot perform operation because the path resolved to more than one file. This command cannot operate on multiple files.',
    ]);
    for (const typed of ['*.xyz', '.\\*.xyz', 'a.txt\\*.txt'])
      expect(texts(shell.run(`echo hi > ${typed}`))).toEqual([
        `Out-File: Cannot perform operation because the wildcard path ${typed} did not resolve to a file.`,
      ]);
    expect(texts(shell.run('echo hi > nope\\*.txt'))).toEqual([
      "Out-File: Could not find a part of the path 'C:\\Users\\kyle\\nope\\*.txt'.",
    ]);
    expect(texts(shell.run('echo hi > fold*'))).toEqual([
      "Out-File: Access to the path 'C:\\Users\\kyle\\folder' is denied.",
    ]);
    expect(drive.listDir('Users/kyle').some((entry) => entry.name.includes('*'))).toBe(false);
    expect(shell.run('echo hi > no*.txt')).toEqual(silent);
    shell.run('echo more >> [n]otes.txt');
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('hi\nmore\n');
    // Hidden files don't match.
    drive.hide('Users/kyle/notes.txt');
    expect(texts(shell.run('echo hi > no*.txt'))).toEqual([
      'Out-File: Cannot perform operation because the wildcard path no*.txt did not resolve to a file.',
    ]);
  });

  it('refuses a read-only file, and a hidden one it would empty', () => {
    const { shell, drive } = laptop();
    const denied = (file: string) => [
      `Out-File: Access to the path 'C:\\Users\\kyle\\${file}' is denied.`,
    ];
    drive.hide('Users/kyle/a.txt');
    expect(texts(shell.run('echo hi > a.txt'))).toEqual(denied('a.txt'));
    expect(texts(shell.run('cat nope.txt 2> a.txt'))).toEqual(denied('a.txt'));
    expect(shell.run('echo hi >> a.txt')).toEqual(silent);
    expect(drive.readFile('Users/kyle/a.txt')).toBe('a\nhi\n');
    drive.setReadOnly('Users/kyle/notes.txt');
    for (const line of ['echo hi > notes.txt', 'echo hi >> notes.txt', 'cat nope.txt 2> notes.txt'])
      expect(texts(shell.run(line))).toEqual(denied('notes.txt'));
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('ship it\n');
  });

  it('finds the command before it opens any file', () => {
    const { shell, drive } = laptop();
    shell.run('echo old > out.txt');
    expect(texts(shell.run('nosuchcmd > out.txt'))).toEqual(NOT_RECOGNIZED);
    expect(drive.readFile('Users/kyle/out.txt')).toBe('old\n');
    // A name PowerShell can't find is no error of the command's, so it stays on screen.
    for (const line of ['nosuchcmd 2> err.txt', 'nosuchcmd 2>$null', 'nosuchcmd 2>&1 > err.txt'])
      expect(texts(shell.run(line))).toEqual(NOT_RECOGNIZED);
    expect(drive.isFile('Users/kyle/err.txt')).toBe(false);
    expect(texts(shell.run('echo a | x > out.txt'))).toEqual([
      "This sandbox doesn't run pipes (|) yet.",
    ]);
    expect(drive.readFile('Users/kyle/out.txt')).toBe('old\n');
  });

  it('prints binding errors on screen, after the files are open', () => {
    const { shell, drive } = laptop();
    for (const line of ['ls -zz 2> e.txt', 'ls -zz 2>&1 > e2.txt'])
      expect(texts(shell.run(line))).toEqual([
        "Get-ChildItem: A parameter cannot be found that matches parameter name 'zz'.",
      ]);
    expect(drive.readFile('Users/kyle/e.txt')).toBe('');
    expect(drive.readFile('Users/kyle/e2.txt')).toBe('');
    // A mandatory parameter left out is found while binding too.
    expect(texts(shell.run('echo 2>$null'))).toEqual([
      'Write-Output: Cannot process command because of one or more missing mandatory parameters: InputObject.',
    ]);
    expect(texts(shell.run('Set-Content x.txt 2> e3.txt'))).toEqual([
      'Set-Content: Cannot process command because of one or more missing mandatory parameters: Value.',
    ]);
    expect(drive.readFile('Users/kyle/e3.txt')).toBe('');
    expect(texts(shell.run('cat notes.txt -TotalCount -1 2> e4.txt'))).toEqual([
      "Get-Content: Cannot validate argument on parameter 'TotalCount'. The -1 argument is less than the minimum allowed range of 0. Supply an argument that is greater than or equal to 0 and then try the command again.",
    ]);
  });

  it('prints an error that stopped the command on screen, past 2> and 2>&1', () => {
    const { shell, drive } = laptop();
    expect(texts(shell.run('Set-Content folder x 2> e.txt'))).toEqual([
      "Set-Content: Unable to clear content of 'C:\\Users\\kyle\\folder' because it is a directory. Clear-Content is only supported on files.",
    ]);
    expect(drive.readFile('Users/kyle/e.txt')).toBe('');
    // Errors written before the one that stopped it still go to the file.
    expect(texts(shell.run('cat nope.txt, notes.txt -Raw -Tail 1 2> e.txt'))).toEqual([
      "Get-Content: The 'Raw' and 'Tail' parameters cannot be specified in the same command.",
    ]);
    expect(drive.readFile('Users/kyle/e.txt')).toBe(`${NOPE}\n`);
    expect(texts(shell.run('ren a.txt folder\\b.txt 2>&1 > e.txt'))).toEqual([
      'Rename-Item: Cannot rename the specified target, because it represents a path or device name.',
    ]);
    expect(texts(shell.run('New-Item x -ItemType foo 2> e.txt'))).toEqual([
      'New-Item: The type is not a known type for the file system. Only "file","directory" or "symboliclink" can be specified.',
    ]);
    expect(drive.readFile('Users/kyle/e.txt')).toBe('');
  });
});

describe('a redirect holds its file until the command is done', () => {
  it('so Remove-Item leaves it, and says so', () => {
    const { shell, drive, events } = laptop();
    expect(shell.run('Remove-Item *.txt 2> log.txt')).toEqual(failedSilently);
    expect(drive.readFile('Users/kyle/log.txt')).toBe(
      `Remove-Item: ${held('C:\\Users\\kyle\\log.txt')}\n`,
    );
    expect(drive.isFile('Users/kyle/notes.txt')).toBe(false);
    expect(events).not.toContainEqual({
      type: 'fileChanged',
      path: 'Users/kyle/log.txt',
      change: 'deleted',
    });
    for (const line of ['rm log.txt > log.txt', 'rm log.txt -Force > log.txt'])
      expect(texts(shell.run(line))).toEqual([`Remove-Item: ${held('C:\\Users\\kyle\\log.txt')}`]);
    expect(drive.readFile('Users/kyle/log.txt')).toBe('');
    shell.run('rm err.txt, nope.txt 2> err.txt');
    expect(drive.readFile('Users/kyle/err.txt')).toBe(
      `Remove-Item: ${held('C:\\Users\\kyle\\err.txt')}\nRemove-Item: Cannot find path 'C:\\Users\\kyle\\nope.txt' because it does not exist.\n`,
    );
  });

  it('and a folder holding it stays, with its not-empty error', () => {
    const { shell, drive } = laptop();
    shell.run('rm dest -Recurse 2> dest\\log.txt');
    expect(drive.readFile('Users/kyle/dest/log.txt')).toBe(
      `Remove-Item: ${held('C:\\Users\\kyle\\dest\\log.txt')}\nRemove-Item: Directory C:\\Users\\kyle\\dest cannot be removed because it is not empty.\n`,
    );
    // What follows an answered question still goes to the file (checked in 7.6.6).
    expect(texts(shell.run('rm dest 2> dest\\log.txt'))[0]).toBe('Confirm');
    expect(shell.run('Y')).toEqual(failedSilently);
    expect(drive.readFile('Users/kyle/dest/log.txt')).toBe(
      `Remove-Item: ${held('C:\\Users\\kyle\\dest\\log.txt')}\nRemove-Item: Directory C:\\Users\\kyle\\dest cannot be removed because it is not empty.\n`,
    );
    // -Force goes another way through .NET, with its own words.
    shell.run('rm dest -Recurse -Force 2> dest\\log.txt');
    expect(drive.readFile('Users/kyle/dest/log.txt')).toBe(
      `Remove-Item: ${held('C:\\Users\\kyle\\dest\\log.txt')}\nRemove-Item: The directory is not empty. : 'C:\\Users\\kyle\\dest'.\n`,
    );
  });

  it('so Move-Item and Rename-Item leave it where it is', () => {
    const { shell, drive, events } = laptop();
    shell.run('mv out.txt, nope.txt dest 2> out.txt');
    expect(drive.readFile('Users/kyle/out.txt')).toBe(
      `Move-Item: ${HELD_NO_PATH}\nMove-Item: Cannot find path 'C:\\Users\\kyle\\nope.txt' because it does not exist.\n`,
    );
    // Not even -Force replaces it.
    shell.run('mv notes.txt a.txt -Force 2> a.txt');
    expect(drive.readFile('Users/kyle/a.txt')).toBe(
      'Move-Item: Cannot create a file when that file already exists.\n',
    );
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('ship it\n');
    // A folder with it inside stays whole, as a simplification: PowerShell moves the rest.
    shell.run('mv dest folder 2> dest\\log.txt');
    expect(drive.readFile('Users/kyle/dest/log.txt')).toBe(`Move-Item: ${HELD_NO_PATH}\n`);
    expect(drive.isFile('Users/kyle/dest/k.txt')).toBe(true);
    shell.run('ren a.txt b.txt 2> a.txt');
    expect(drive.readFile('Users/kyle/a.txt')).toBe(`Rename-Item: ${HELD_NO_PATH}\n`);
    expect(drive.isFile('Users/kyle/b.txt')).toBe(false);
    shell.run('ren dest d2 2> dest\\log.txt');
    expect(drive.readFile('Users/kyle/dest/log.txt')).toBe(
      "Rename-Item: Access to the path 'C:\\Users\\kyle\\dest' is denied.\n",
    );
    expect(events.some((event) => event.type === 'itemMoved')).toBe(false);
  });

  it('so Copy-Item reads it but never writes over it', () => {
    const { shell, drive } = laptop();
    shell.run('cp notes.txt a.txt 2> a.txt');
    expect(drive.readFile('Users/kyle/a.txt')).toBe(
      `Copy-Item: ${held('C:\\Users\\kyle\\a.txt')}\n`,
    );
    shell.run('cp a.txt dest -Force 2> dest\\a.txt');
    expect(drive.readFile('Users/kyle/dest/a.txt')).toBe(
      `Copy-Item: ${held('C:\\Users\\kyle\\dest\\a.txt')}\n`,
    );
    // > emptied a.txt before the copy read it.
    expect(shell.run('cp a.txt b.txt > a.txt')).toEqual(silent);
    expect(drive.readFile('Users/kyle/b.txt')).toBe('');
  });

  it('so Set-Content stops at it, and Add-Content and New-Item refuse it', () => {
    const { shell, drive } = laptop();
    // Set-Content empties the files before it, then stops, past 2>.
    expect(texts(shell.run('Set-Content notes.txt, a.txt x 2> a.txt'))).toEqual([
      `Set-Content: ${held('C:\\Users\\kyle\\a.txt')}`,
    ]);
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('');
    expect(drive.readFile('Users/kyle/a.txt')).toBe('');
    shell.run('Add-Content a.txt x 2> a.txt');
    expect(drive.readFile('Users/kyle/a.txt')).toBe(
      `Add-Content: ${held('C:\\Users\\kyle\\a.txt')}\n`,
    );
    expect(texts(shell.run('New-Item a.txt -Force > a.txt'))).toEqual([
      `New-Item: ${held('C:\\Users\\kyle\\a.txt')}`,
    ]);
    // Reading it is fine: > emptied it first, so there's nothing to read.
    expect(shell.run('cat notes.txt > notes.txt')).toEqual(silent);
  });

  it('so > and 2> never share a file', () => {
    const { shell, drive } = laptop();
    for (const line of ['echo hi > a.txt 2> a.txt', 'cat nope.txt, notes.txt > a.txt 2>> a.txt'])
      expect(texts(shell.run(line))).toEqual([`Out-File: ${held('C:\\Users\\kyle\\a.txt')}`]);
    expect(drive.readFile('Users/kyle/a.txt')).toBe('');
  });
});

describe('pour', () => {
  it('drops the lines for a file that has gone, rather than throw out of the shell', () => {
    const { ws, machine, drive, events } = laptop();
    const sink = { kind: 'file', path: 'Users/kyle/gone.txt' } as const;
    expect(() => {
      pour({ ws, machine }, sink, [line('lost')]);
    }).not.toThrow();
    expect(drive.isFile('Users/kyle/gone.txt')).toBe(false);
    expect(events).toEqual([]);
  });
});
