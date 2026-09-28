import { describe, expect, it } from 'vitest';
import { windows } from '../../../fixtures';
import { testDeps } from '../../../git/testDeps';
import type { EngineEvent } from '../../../workspace';
import { Shell, type ShellResult } from '../../shell';

function laptop() {
  const ws = windows()
    .mkdir('Users/kyle/dest')
    .write('Users/kyle/a.txt', 'a\n')
    .write('Users/kyle/src/one.txt', '1\n')
    .write('Users/kyle/src/sub/two.txt', '2\n')
    .build(testDeps());
  const machine = ws.machine;
  if (machine === null) throw new Error('Not a laptop');
  const events: EngineEvent[] = [];
  ws.events.on((event) => events.push(event));
  const shell = new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app');
  return { shell, machine, drive: machine.drive, events };
}

const texts = (result: ShellResult) => result.lines.map((line) => line.text);
const silent = { lines: [], exitCode: 0 };

describe('Copy-Item', () => {
  it('copies a file to a new name, or into a folder, silently, under every alias', () => {
    const { shell, drive, events } = laptop();
    expect(shell.run('Copy-Item a.txt b.txt')).toEqual(silent);
    shell.run('cp a.txt dest; copy a.txt c.txt; cpi a.txt d.txt');
    expect(drive.readFile('Users/kyle/b.txt')).toBe('a\n');
    expect(drive.readFile('Users/kyle/dest/a.txt')).toBe('a\n');
    expect(drive.isFile('Users/kyle/d.txt')).toBe(true);
    expect(drive.isFile('Users/kyle/a.txt')).toBe(true);
    expect(events).toContainEqual({
      type: 'itemMoved',
      from: 'Users/kyle/a.txt',
      to: 'Users/kyle/b.txt',
      kind: 'file',
      copy: true,
    });
  });

  it('overwrites a file that is there, as PowerShell does', () => {
    const { shell, drive } = laptop();
    shell.run('cp src\\one.txt a.txt');
    expect(drive.readFile('Users/kyle/a.txt')).toBe('1\n');
  });

  it('copies a folder empty without -Recurse, and whole with it', () => {
    const { shell, drive } = laptop();
    shell.run('cp src src2');
    expect(drive.isDir('Users/kyle/src2')).toBe(true);
    expect(drive.listDir('Users/kyle/src2')).toEqual([]);
    shell.run('cp src src3 -Recurse');
    expect(drive.readFile('Users/kyle/src3/sub/two.txt')).toBe('2\n');
    shell.run('cp src dest -Recurse');
    expect(drive.readFile('Users/kyle/dest/src/one.txt')).toBe('1\n');
  });

  it("refuses in PowerShell's words", () => {
    const { shell } = laptop();
    expect(texts(shell.run('cp nope.txt x.txt'))).toEqual([
      "Copy-Item: Cannot find path 'C:\\Users\\kyle\\nope.txt' because it does not exist.",
    ]);
    expect(texts(shell.run('cp a.txt missing\\x.txt'))).toEqual([
      "Copy-Item: Could not find a part of the path 'C:\\Users\\kyle\\missing\\x.txt'.",
    ]);
    expect(texts(shell.run('cp a.txt a.txt'))).toEqual([
      'Copy-Item: Cannot overwrite the item C:\\Users\\kyle\\a.txt with itself.',
    ]);
    expect(texts(shell.run('cp src src\\sub -Recurse'))[0]).toContain('inside itself');
    expect(texts(shell.run('cp a.txt Q:\\x'))).toEqual([
      "Copy-Item: Cannot find drive. A drive with the name 'Q' does not exist.",
    ]);
  });
});

describe('Move-Item', () => {
  it('moves into a folder, or to a new name, keeping what is inside', () => {
    const { shell, drive, events } = laptop();
    expect(shell.run('Move-Item a.txt dest')).toEqual(silent);
    expect(drive.exists('Users/kyle/a.txt')).toBe(false);
    expect(drive.readFile('Users/kyle/dest/a.txt')).toBe('a\n');
    shell.run('mv src stuff');
    expect(drive.readFile('Users/kyle/stuff/sub/two.txt')).toBe('2\n');
    expect(events).toContainEqual({
      type: 'fileChanged',
      path: 'Users/kyle/src/sub/two.txt',
      change: 'deleted',
    });
    expect(events).toContainEqual({
      type: 'fileChanged',
      path: 'Users/kyle/stuff/sub/two.txt',
      change: 'created',
    });
    expect(events).toContainEqual({
      type: 'itemMoved',
      from: 'Users/kyle/src',
      to: 'Users/kyle/stuff',
      kind: 'folder',
      copy: false,
    });
  });

  it('refuses to replace a file unless -Force, and the folder this tab stands in', () => {
    const { shell, drive, machine } = laptop();
    shell.run('cp a.txt dest');
    expect(texts(shell.run('move a.txt dest'))).toEqual([
      'Move-Item: Cannot create a file when that file already exists.',
    ]);
    shell.run('mi a.txt dest -Force');
    expect(drive.exists('Users/kyle/a.txt')).toBe(false);
    // Checked in pwsh 7.6.6: the folder this tab stands in is in use.
    shell.run('cd src');
    expect(texts(shell.run('mv ~\\src ~\\dest'))).toEqual([
      "Move-Item: Cannot move item because the item at 'C:\\Users\\kyle\\src' is in use.",
    ]);
    expect(texts(shell.run('ren ~\\src source'))).toEqual([
      "Rename-Item: Cannot rename the item at 'C:\\Users\\kyle\\src' because it is in use.",
    ]);
    // Another tab's folder isn't held: Set-Location doesn't move the pwsh process.
    machine.openSession();
    expect(shell.run('mv src moved').exitCode).toBe(0);
    expect(drive.isDir('Users/kyle/moved')).toBe(true);
  });

  it('carries the Hidden attribute along', () => {
    const { shell, drive } = laptop();
    drive.hide('Users/kyle/src/sub');
    shell.run('mv src moved');
    expect(drive.isHidden('Users/kyle/moved/sub')).toBe(true);
  });
});

describe('Rename-Item', () => {
  it('renames in place, including a new spelling of the same name', () => {
    const { shell, drive } = laptop();
    expect(shell.run('Rename-Item a.txt b.txt')).toEqual(silent);
    shell.run('ren b.txt B.TXT; rni src Source');
    expect(drive.listDir('Users/kyle').map((entry) => entry.name)).toEqual(
      expect.arrayContaining(['B.TXT', 'Source']),
    );
    expect(drive.readFile('Users/kyle/Source/one.txt')).toBe('1\n');
  });

  it("refuses a path for a name, a clash and a missing item, in PowerShell's words", () => {
    const { shell } = laptop();
    expect(texts(shell.run('Rename-Item a.txt dest\\b.txt'))).toEqual([
      'Rename-Item: Cannot rename the specified target, because it represents a path or device name.',
    ]);
    expect(texts(shell.run('Rename-Item a.txt dest'))).toEqual([
      'Rename-Item: Cannot create a file when that file already exists.',
    ]);
    expect(texts(shell.run('Rename-Item nope.txt z.txt'))).toEqual([
      "Rename-Item: Cannot find path 'C:\\Users\\kyle\\nope.txt' because it does not exist.",
    ]);
    expect(texts(shell.run('Rename-Item a.txt'))[0]).toContain(
      'missing mandatory parameters: NewName',
    );
  });
});
