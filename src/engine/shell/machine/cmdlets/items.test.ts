import { describe, expect, it } from 'vitest';
import { windows } from '../../../fixtures';
import { testDeps } from '../../../git/testDeps';
import type { EngineEvent } from '../../../workspace';
import { Shell, type ShellResult } from '../../shell';
import mkdirBare from '../fixtures/error-mkdir-bare.txt?raw';
import mkdirInFile from '../fixtures/error-mkdir-in-file.txt?raw';
import newItemBadName from '../fixtures/error-new-item-bad-name.txt?raw';
import newItemExists from '../fixtures/error-new-item-exists.txt?raw';
import newItemInFile from '../fixtures/error-new-item-in-file.txt?raw';
import newItemOverFolder from '../fixtures/error-new-item-over-folder.txt?raw';
import testPathBare from '../fixtures/error-test-path-bare.txt?raw';
import newItemFile from '../fixtures/new-item-file.txt?raw';
import newItemFolder from '../fixtures/new-item-folder.txt?raw';

function laptop() {
  const ws = windows()
    .mkdir('Users/kyle/Projects')
    .write('Users/kyle/notes.txt', 'ship it\n')
    .build(testDeps());
  const machine = ws.machine;
  if (machine === null) throw new Error('Not a laptop');
  const events: EngineEvent[] = [];
  ws.events.on((event) => events.push(event));
  return { shell: new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app'), drive: machine.drive, events };
}

const printed = (result: ShellResult) => result.lines.map((line) => `${line.text}\n`).join('');
const texts = (result: ShellResult) => result.lines.map((line) => line.text);

describe('New-Item', () => {
  it('makes an empty file and shows it as PowerShell 7.6 does', () => {
    const { shell, drive, events } = laptop();
    expect(printed(shell.run('New-Item standup.md'))).toBe(newItemFile);
    expect(drive.readFile('Users/kyle/standup.md')).toBe('');
    expect(events).toContainEqual({
      type: 'fileChanged',
      path: 'Users/kyle/standup.md',
      change: 'created',
    });
  });

  it('makes a folder with -ItemType Directory, or any start of it', () => {
    const { shell, drive } = laptop();
    expect(printed(shell.run('New-Item -ItemType Directory logs'))).toBe(newItemFolder);
    shell.run('ni -Type dir cache; New-Item -ItemType d tmp');
    expect(drive.isDir('Users/kyle/cache')).toBe(true);
    expect(drive.isDir('Users/kyle/tmp')).toBe(true);
    expect(texts(shell.run('New-Item -ItemType Folder x'))).toEqual([
      'New-Item: The type is not a known type for the file system. Only "file","directory" or "symboliclink" can be specified.',
    ]);
  });

  it('writes -Value, and names the item with -Name inside -Path', () => {
    const { shell, drive } = laptop();
    const result = shell.run('New-Item -Path Projects -Name todo.txt -Value "ship it"');
    expect(texts(result)).toContain('    Directory: C:\\Users\\kyle\\Projects');
    expect(texts(result)).toContain('-a---           9/27/2026 10:15 AM              7 todo.txt');
    expect(drive.readFile('Users/kyle/Projects/todo.txt')).toBe('ship it');
    shell.run('New-Item -Name here.txt');
    expect(drive.isFile('Users/kyle/here.txt')).toBe(true);
  });

  it("refuses an item that's already there in PowerShell's words, unless -Force", () => {
    const { shell, drive } = laptop();
    expect(printed(shell.run('New-Item notes.txt'))).toBe(newItemExists);
    expect(texts(shell.run('New-Item -ItemType Directory projects'))).toEqual([
      'New-Item: An item with the specified name C:\\Users\\kyle\\Projects already exists.',
    ]);
    expect(printed(shell.run('New-Item Downloads'))).toBe(newItemOverFolder);
    shell.run('New-Item notes.txt -Force');
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('');
    expect(shell.run('New-Item -ItemType Directory projects -Force').exitCode).toBe(0);
  });

  it('needs the folder for a file unless -Force, but makes a folder with its parents', () => {
    const { shell, drive } = laptop();
    expect(texts(shell.run('New-Item deep\\a\\b.txt'))).toEqual([
      "New-Item: Could not find a part of the path 'C:\\Users\\kyle\\deep\\a\\b.txt'.",
    ]);
    shell.run('New-Item deep\\a\\b.txt -Force');
    expect(drive.isFile('Users/kyle/deep/a/b.txt')).toBe(true);
    shell.run('New-Item -ItemType Directory one\\two\\three');
    expect(drive.isDir('Users/kyle/one/two/three')).toBe(true);
  });

  it("refuses a file on the way, and names Windows forbids, in PowerShell's words", () => {
    const { shell, drive } = laptop();
    expect(printed(shell.run('New-Item notes.txt\\sub.txt'))).toBe(newItemInFile);
    expect(printed(shell.run('New-Item notes.txt\\sub.txt -Force'))).toBe(newItemInFile);
    expect(printed(shell.run('mkdir notes.txt\\sub'))).toBe(mkdirInFile);
    expect(printed(shell.run("New-Item 'a<b.txt'"))).toBe(newItemBadName);
    expect(texts(shell.run('ni a*.txt'))[0]).toContain('volume label syntax is incorrect');
    expect(texts(shell.run('mkdir "q|r"'))[0]).toContain('volume label syntax is incorrect');
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('ship it\n');
    expect(drive.listDir('Users/kyle').map((entry) => entry.name)).not.toContain('q|r');
  });

  it('asks for a path, and refuses a drive the laptop lacks', () => {
    const { shell } = laptop();
    expect(texts(shell.run('New-Item'))).toEqual([
      'New-Item: Cannot process command because of one or more missing mandatory parameters: Path.',
    ]);
    expect(texts(shell.run('New-Item Q:\\x.txt'))).toEqual([
      "New-Item: Cannot find drive. A drive with the name 'Q' does not exist.",
    ]);
  });
});

describe('mkdir', () => {
  it('makes folders and their parents, several at once under one heading', () => {
    const { shell, drive } = laptop();
    const result = shell.run('mkdir docs, logs');
    expect(texts(result).filter((text) => text.startsWith('    Directory:'))).toEqual([
      '    Directory: C:\\Users\\kyle',
    ]);
    expect(texts(result).filter((text) => text.startsWith('d----'))).toHaveLength(2);
    shell.run('md a\\b');
    expect(drive.isDir('Users/kyle/a/b')).toBe(true);
  });

  it('refuses a folder that exists, as New-Item', () => {
    const { shell } = laptop();
    expect(texts(shell.run('mkdir Projects'))).toEqual([
      'New-Item: An item with the specified name C:\\Users\\kyle\\Projects already exists.',
    ]);
    expect(printed(shell.run('mkdir'))).toBe(mkdirBare);
  });
});

describe('new folders are announced', () => {
  const folderEvents = (events: EngineEvent[]) =>
    events.filter((event) => event.type === 'folderChanged');

  it('announces each folder mkdir makes, parents first', () => {
    const { shell, events } = laptop();
    shell.run('mkdir docs\\adr');
    expect(folderEvents(events)).toEqual([
      { type: 'folderChanged', path: 'Users/kyle/docs', change: 'created' },
      { type: 'folderChanged', path: 'Users/kyle/docs/adr', change: 'created' },
    ]);
  });

  it('announces a folder from New-Item, but not one that was already there or was refused', () => {
    const { shell, events } = laptop();
    shell.run('New-Item -ItemType Directory logs');
    shell.run('New-Item -ItemType Directory projects -Force; mkdir Projects');
    shell.run('mkdir notes.txt\\sub');
    expect(folderEvents(events)).toEqual([
      { type: 'folderChanged', path: 'Users/kyle/logs', change: 'created' },
    ]);
  });

  it('announces the folders -Force makes for a new file, before the file', () => {
    const { shell, events } = laptop();
    shell.run('New-Item deep\\a\\b.txt -Force');
    expect(events).toEqual([
      { type: 'folderChanged', path: 'Users/kyle/deep', change: 'created' },
      { type: 'folderChanged', path: 'Users/kyle/deep/a', change: 'created' },
      { type: 'fileChanged', path: 'Users/kyle/deep/a/b.txt', change: 'created' },
    ]);
  });
});

describe('Test-Path', () => {
  it('answers True or False, for files, folders and variables', () => {
    const { shell } = laptop();
    expect(texts(shell.run('Test-Path notes.txt, nope, C:\\Users, Q:\\x'))).toEqual([
      'True',
      'False',
      'True',
      'False',
    ]);
    expect(texts(shell.run('Test-Path Projects -PathType Leaf'))).toEqual(['False']);
    expect(texts(shell.run('Test-Path Projects -PathType Container'))).toEqual(['True']);
    expect(texts(shell.run('Test-Path notes.txt -PathType Leaf'))).toEqual(['True']);
    expect(texts(shell.run('Test-Path env:PATH; Test-Path Env:NOPE_X'))).toEqual(['True', 'False']);
  });

  it('answers True when a wildcard matches something visible', () => {
    const { shell, drive } = laptop();
    expect(texts(shell.run('Test-Path *.txt, *.md, Proj*'))).toEqual(['True', 'False', 'True']);
    expect(texts(shell.run('Test-Path Proj* -PathType Leaf'))).toEqual(['False']);
    expect(texts(shell.run('Test-Path -LiteralPath *.txt'))).toEqual(['False']);
    drive.hide('Users/kyle/notes.txt');
    expect(texts(shell.run('Test-Path *.txt'))).toEqual(['False']);
    expect(texts(shell.run('Test-Path env:*PATH*, env:ZZ*, env:'))).toEqual([
      'True',
      'False',
      'True',
    ]);
    expect(texts(shell.run('Test-Path env: -PathType Leaf'))).toEqual(['False']);
  });

  it('asks for a path, and refuses parameters the sandbox lacks', () => {
    const { shell } = laptop();
    expect(printed(shell.run('Test-Path'))).toBe(testPathBare);
    expect(texts(shell.run('Test-Path x -IsValid'))).toEqual([
      "This sandbox doesn't run Test-Path -IsValid yet.",
    ]);
  });
});
