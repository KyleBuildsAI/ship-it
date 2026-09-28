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
/** What PowerShell 7.6.6 prints when a folder is moved into itself, naming where it'd land. */
const intoItself = (path: string) =>
  `Move-Item: Destination path cannot be a subdirectory of the source or the source itself: ${path}.`;

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
    const { shell, drive, events } = laptop();
    shell.run('cp src src2');
    expect(drive.isDir('Users/kyle/src2')).toBe(true);
    expect(drive.listDir('Users/kyle/src2')).toEqual([]);
    shell.run('cp src src3 -Recurse');
    expect(drive.readFile('Users/kyle/src3/sub/two.txt')).toBe('2\n');
    expect(shell.run('cp src dest -Recurse')).toEqual(silent);
    expect(drive.readFile('Users/kyle/dest/src/one.txt')).toBe('1\n');
    expect(events).toContainEqual({
      type: 'fileChanged',
      path: 'Users/kyle/dest/src/sub/two.txt',
      change: 'created',
    });
    expect(events).toContainEqual({
      type: 'itemMoved',
      from: 'Users/kyle/src',
      to: 'Users/kyle/dest/src',
      kind: 'folder',
      copy: true,
    });
  });

  it('makes the missing folders above a folder copy, but not above a file copy', () => {
    const { shell, drive } = laptop();
    expect(shell.run('cp src dest\\x\\y')).toEqual(silent);
    expect(drive.listDir('Users/kyle/dest/x/y')).toEqual([]);
    expect(shell.run('cp src dest\\x2\\y -Recurse')).toEqual(silent);
    expect(drive.readFile('Users/kyle/dest/x2/y/sub/two.txt')).toBe('2\n');
    expect(texts(shell.run('cp a.txt nope\\z\\a.txt'))).toEqual([
      "Copy-Item: Could not find a part of the path 'C:\\Users\\kyle\\nope\\z\\a.txt'.",
    ]);
    expect(drive.exists('Users/kyle/nope')).toBe(false);
  });

  it('refuses what stands in the way, changes nothing and announces nothing (7.6.6)', () => {
    const { shell, drive, events } = laptop();
    drive.makeDir('Users/kyle/dest/a.txt');
    for (const line of ['cp src a.txt', 'cp src a.txt -Recurse'])
      expect(shell.run(line)).toEqual({
        lines: [
          {
            text: 'Copy-Item: Container cannot be copied onto existing leaf item.',
            tone: 'error',
          },
        ],
        exitCode: 1,
      });
    expect(texts(shell.run('cp a.txt dest'))).toEqual([
      "Copy-Item: The target file 'C:\\Users\\kyle\\dest\\a.txt' is a directory, not a file.",
    ]);
    expect(texts(shell.run('cp src\\one.txt a.txt\\x.txt'))).toEqual([
      "Copy-Item: Could not find a part of the path 'C:\\Users\\kyle\\a.txt\\x.txt'.",
    ]);
    expect(drive.readFile('Users/kyle/a.txt')).toBe('a\n');
    expect(drive.isDir('Users/kyle/dest/a.txt')).toBe(true);
    expect(events).toEqual([]);
  });

  it('copies into a folder already there, saying so unless -Force, and skips what clashes', () => {
    const { shell, drive } = laptop();
    drive.makeDir('Users/kyle/dest/src/one.txt');
    expect(shell.run('cp src dest -Recurse')).toEqual({
      lines: [
        {
          text: 'Copy-Item: An item with the specified name C:\\Users\\kyle\\dest\\src already exists.',
          tone: 'error',
        },
        {
          text: "Copy-Item: The target file 'C:\\Users\\kyle\\dest\\src\\one.txt' is a directory, not a file.",
          tone: 'error',
        },
      ],
      exitCode: 1,
    });
    expect(drive.readFile('Users/kyle/dest/src/sub/two.txt')).toBe('2\n');
    expect(texts(shell.run('cp src dest -Recurse -Force'))).toEqual([
      "Copy-Item: The target file 'C:\\Users\\kyle\\dest\\src\\one.txt' is a directory, not a file.",
    ]);
    expect(shell.run('cp src\\sub dest\\src -Force')).toEqual(silent);
  });

  it("refuses to copy an item onto itself, in PowerShell's words", () => {
    const { shell, drive, events } = laptop();
    for (const line of ['cp a.txt a.txt', 'cp a.txt A.TXT', 'cp a.txt .', 'cp a.txt . -Force'])
      expect(texts(shell.run(line))).toEqual([
        'Copy-Item: Cannot overwrite the item C:\\Users\\kyle\\a.txt with itself.',
      ]);
    for (const line of ['cp src src', 'cp src SRC -Recurse', 'cp src src -Force'])
      expect(texts(shell.run(line))).toEqual([
        'Copy-Item: Cannot overwrite the item C:\\Users\\kyle\\src with itself.',
      ]);
    // A folder copied onto itself by way of its parent meets itself at every level, files
    // before subfolders (7.6.6).
    expect(texts(shell.run('cp src .'))).toEqual([
      'Copy-Item: An item with the specified name C:\\Users\\kyle\\src already exists.',
    ]);
    expect(texts(shell.run('cp src . -Recurse'))).toEqual([
      'Copy-Item: An item with the specified name C:\\Users\\kyle\\src already exists.',
      'Copy-Item: Cannot overwrite the item C:\\Users\\kyle\\src\\one.txt with itself.',
      'Copy-Item: An item with the specified name C:\\Users\\kyle\\src\\sub already exists.',
      'Copy-Item: Cannot overwrite the item C:\\Users\\kyle\\src\\sub\\two.txt with itself.',
    ]);
    expect(shell.run('cp src . -Force')).toEqual(silent);
    expect(texts(shell.run('cp src . -Recurse -Force'))).toEqual([
      'Copy-Item: Cannot overwrite the item C:\\Users\\kyle\\src\\one.txt with itself.',
      'Copy-Item: Cannot overwrite the item C:\\Users\\kyle\\src\\sub\\two.txt with itself.',
    ]);
    expect(drive.readFile('Users/kyle/src/one.txt')).toBe('1\n');
    expect(events.filter((event) => event.type === 'itemMoved')).toEqual([]);
  });

  it("refuses in PowerShell's words", () => {
    const { shell } = laptop();
    expect(texts(shell.run('cp nope.txt x.txt'))).toEqual([
      "Copy-Item: Cannot find path 'C:\\Users\\kyle\\nope.txt' because it does not exist.",
    ]);
    expect(texts(shell.run('cp a.txt missing\\x.txt'))).toEqual([
      "Copy-Item: Could not find a part of the path 'C:\\Users\\kyle\\missing\\x.txt'.",
    ]);
    expect(texts(shell.run('cp a.txt Q:\\x'))).toEqual([
      "Copy-Item: Cannot find drive. A drive with the name 'Q' does not exist.",
    ]);
  });

  it('refuses a whole folder into itself, which real PowerShell copies without end', () => {
    const { shell, drive } = laptop();
    // A deliberate refusal: pwsh 7.6.6 recursed until it had to be stopped.
    expect(texts(shell.run('cp src src\\sub -Recurse'))).toEqual([
      'Copy-Item: Cannot copy item C:\\Users\\kyle\\src into a folder inside itself.',
    ]);
    expect(drive.exists('Users/kyle/src/sub/src')).toBe(false);
    // Without -Recurse only an empty folder lands, as in 7.6.6.
    expect(shell.run('cp src src\\sub')).toEqual(silent);
    expect(drive.listDir('Users/kyle/src/sub/src')).toEqual([]);
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

  it('respells a file to the name typed, and leaves a file already in place alone', () => {
    const { shell, drive, events } = laptop();
    for (const line of ['mv a.txt .', 'mv a.txt a.txt', 'mv src\\one.txt src', 'mv a.txt . -Force'])
      expect(shell.run(line)).toEqual(silent);
    expect(events).toEqual([]);
    expect(shell.run('mv a.txt A.txt')).toEqual(silent);
    expect(drive.listDir('Users/kyle').map((entry) => entry.name)).toContain('A.txt');
    expect(drive.listDir('Users/kyle').map((entry) => entry.name)).not.toContain('a.txt');
    expect(events).toContainEqual({
      type: 'itemMoved',
      from: 'Users/kyle/a.txt',
      to: 'Users/kyle/A.txt',
      kind: 'file',
      copy: false,
    });
  });

  it('refuses a folder into itself, naming where it would land (7.6.6)', () => {
    const { shell, drive, events } = laptop();
    expect(shell.run('mv src src\\sub')).toEqual({
      lines: [{ text: intoItself('C:\\Users\\kyle\\src\\sub\\src'), tone: 'error' }],
      exitCode: 1,
    });
    expect(texts(shell.run('mv src .'))).toEqual([intoItself('C:\\Users\\kyle\\src')]);
    expect(texts(shell.run('mv src Src'))).toEqual([intoItself('C:\\Users\\kyle\\src\\src')]);
    expect(texts(shell.run('mv src src\\nope\\x'))).toEqual([
      intoItself('C:\\Users\\kyle\\src\\nope\\x'),
    ]);
    expect(texts(shell.run('mv src\\sub src'))).toEqual([intoItself('C:\\Users\\kyle\\src\\sub')]);
    expect(drive.readFile('Users/kyle/src/one.txt')).toBe('1\n');
    expect(events).toEqual([]);
  });

  it('refuses a destination folder that is missing or is a file, and keeps the source', () => {
    const { shell, drive, events } = laptop();
    for (const line of [
      'mv a.txt archive\\a.txt',
      'mv src archive\\src',
      'mv src\\one.txt a.txt\\x.txt',
    ])
      expect(texts(shell.run(line))).toEqual(['Move-Item: Could not find a part of the path.']);
    expect(drive.readFile('Users/kyle/src/one.txt')).toBe('1\n');
    expect(drive.readFile('Users/kyle/a.txt')).toBe('a\n');
    expect(drive.exists('Users/kyle/archive')).toBe(false);
    expect(events).toEqual([]);
  });

  it('lets -Force replace only a file with a file (7.6.6)', () => {
    const { shell, drive, events } = laptop();
    drive.writeFile('Users/kyle/dest/src/keep.txt', 'k\n');
    drive.makeDir('Users/kyle/dest/a.txt');
    for (const line of ['mv src dest', 'mv src dest -Force'])
      expect(texts(shell.run(line))).toEqual([
        "Move-Item: Cannot create 'C:\\Users\\kyle\\dest\\src' because a file or directory with the same name already exists.",
      ]);
    expect(texts(shell.run('mv src a.txt -Force'))).toEqual([
      "Move-Item: Cannot create 'C:\\Users\\kyle\\a.txt' because a file or directory with the same name already exists.",
    ]);
    expect(texts(shell.run('mv a.txt dest -Force'))).toEqual([
      'Move-Item: Cannot create a file when that file already exists.',
    ]);
    expect(drive.readFile('Users/kyle/dest/src/keep.txt')).toBe('k\n');
    expect(drive.readFile('Users/kyle/src/one.txt')).toBe('1\n');
    expect(drive.isDir('Users/kyle/dest/a.txt')).toBe(true);
    expect(drive.readFile('Users/kyle/a.txt')).toBe('a\n');
    expect(events).toEqual([]);
    // A file onto a file, under the name typed.
    drive.writeFile('Users/kyle/b.txt', 'b\n');
    expect(shell.run('mv a.txt B.TXT -Force')).toEqual(silent);
    expect(drive.listDir('Users/kyle').map((entry) => entry.name)).toContain('B.TXT');
    expect(drive.readFile('Users/kyle/B.TXT')).toBe('a\n');
  });

  it('refuses to replace a file unless -Force, and the folder this tab stands in', () => {
    const { shell, drive, machine } = laptop();
    shell.run('cp a.txt dest');
    expect(texts(shell.run('move a.txt dest'))).toEqual([
      'Move-Item: Cannot create a file when that file already exists.',
    ]);
    shell.run('mi a.txt dest -Force');
    expect(drive.exists('Users/kyle/a.txt')).toBe(false);
    // Checked in pwsh 7.6.6: the folder this tab stands in is in use, and that comes first.
    shell.run('cd src');
    for (const line of ['mv ~\\src ~\\dest', 'mv ~\\src ~\\src\\sub', 'mv ~\\src ~\\nope\\x'])
      expect(texts(shell.run(line))).toEqual([
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

  it('renames through a wildcard only when it matches exactly one visible item (7.6.6)', () => {
    const { shell, drive, events } = laptop();
    drive.writeFile('Users/kyle/b.txt', 'b\n');
    expect(texts(shell.run('ren *.txt z.txt'))).toEqual([
      "Rename-Item: Cannot rename because item at '*.txt' does not exist.",
    ]);
    expect(texts(shell.run('ren q*.txt z.txt'))).toEqual([
      "Rename-Item: Cannot rename because item at 'q*.txt' does not exist.",
    ]);
    expect(drive.exists('Users/kyle/z.txt')).toBe(false);
    expect(events).toEqual([]);
    expect(shell.run('ren a*.txt z.txt')).toEqual(silent);
    expect(drive.readFile('Users/kyle/z.txt')).toBe('a\n');
    // A hidden match counts only with -Force.
    drive.hide('Users/kyle/b.txt');
    expect(texts(shell.run('ren b*.txt y.txt'))).toEqual([
      "Rename-Item: Cannot rename because item at 'b*.txt' does not exist.",
    ]);
    expect(shell.run('ren b*.txt y.txt -Force')).toEqual(silent);
    expect(drive.readFile('Users/kyle/y.txt')).toBe('b\n');
  });

  it("takes a new name written as a path to the item's own folder (7.6.6)", () => {
    const { shell, drive } = laptop();
    drive.writeFile('Users/kyle/dest/k.txt', 'k\n');
    expect(shell.run('ren a.txt .\\b.txt')).toEqual(silent);
    expect(shell.run('ren b.txt C:\\Users\\kyle\\c.txt')).toEqual(silent);
    expect(shell.run('ren c.txt c:/users/KYLE/d.txt')).toEqual(silent);
    expect(shell.run('ren dest\\k.txt .\\k2.txt')).toEqual(silent);
    expect(drive.readFile('Users/kyle/d.txt')).toBe('a\n');
    expect(drive.readFile('Users/kyle/dest/k2.txt')).toBe('k\n');
    const path =
      'Rename-Item: Cannot rename the specified target, because it represents a path or device name.';
    for (const line of [
      'ren d.txt dest\\b.txt',
      'ren d.txt ..\\kyle\\b.txt',
      'ren d.txt .\\dest\\c.txt',
    ])
      expect(texts(shell.run(line))).toEqual([path]);
    expect(drive.readFile('Users/kyle/d.txt')).toBe('a\n');
  });

  it('leaves a file under its own name alone, and refuses a folder (7.6.6)', () => {
    const { shell, events } = laptop();
    expect(shell.run('ren a.txt a.txt')).toEqual(silent);
    for (const line of ['ren src src', 'ren src .\\src'])
      expect(texts(shell.run(line))).toEqual([
        'Rename-Item: Source and destination path must be different.',
      ]);
    expect(events).toEqual([]);
  });

  it("refuses a clash, a missing item and a missing name, in PowerShell's words", () => {
    const { shell, drive, events } = laptop();
    expect(texts(shell.run('Rename-Item a.txt dest'))).toEqual([
      'Rename-Item: Cannot create a file when that file already exists.',
    ]);
    expect(texts(shell.run('ren a.txt .'))).toEqual([
      'Rename-Item: Cannot create a file when that file already exists.',
    ]);
    // A folder in the way is .NET's folder message, naming the new name as typed (7.6.6).
    expect(texts(shell.run('ren src DEST'))).toEqual([
      "Rename-Item: Cannot create 'C:\\Users\\kyle\\DEST' because a file or directory with the same name already exists.",
    ]);
    expect(texts(shell.run('ren src a.txt'))).toEqual([
      "Rename-Item: Cannot create 'C:\\Users\\kyle\\a.txt' because a file or directory with the same name already exists.",
    ]);
    expect(texts(shell.run('ren src ..'))).toEqual([
      "Rename-Item: Cannot create 'C:\\Users' because a file or directory with the same name already exists.",
    ]);
    expect(texts(shell.run('Rename-Item nope.txt z.txt'))).toEqual([
      "Rename-Item: Cannot find path 'C:\\Users\\kyle\\nope.txt' because it does not exist.",
    ]);
    expect(texts(shell.run('Rename-Item a.txt'))).toEqual([
      'Rename-Item: Cannot process command because of one or more missing mandatory parameters: NewName.',
    ]);
    expect(drive.readFile('Users/kyle/src/one.txt')).toBe('1\n');
    expect(events).toEqual([]);
  });
});
