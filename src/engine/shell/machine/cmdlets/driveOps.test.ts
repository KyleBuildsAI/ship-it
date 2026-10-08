import { describe, expect, it } from 'vitest';
import { windows } from '../../../fixtures';
import { testDeps } from '../../../git/testDeps';
import type { EngineEvent } from '../../../workspace';
import type { CommandContext } from '../registry';
import { copyItem, deleteItem, moveItem, resolveItems } from './driveOps';

/** A laptop with a small folder to copy, and the context a cmdlet would get in its tab. */
function laptop() {
  const ws = windows()
    .write('Users/kyle/a.txt', 'orig\n')
    .write('Users/kyle/notes.txt', 'one\n')
    .write('Users/kyle/bare.txt', 'bare\n')
    .write('Users/kyle/src/a.txt', 'a\n')
    .write('Users/kyle/src/one.txt', '1\n')
    .write('Users/kyle/src/z.txt', 'z\n')
    .write('Users/kyle/src/sub/two.txt', '2\n')
    .mkdir('Users/kyle/dest')
    .build(testDeps());
  const machine = ws.machine;
  if (machine === null) throw new Error('Not a laptop');
  const events: EngineEvent[] = [];
  ws.events.on((event) => events.push(event));
  const context: CommandContext = {
    ws,
    machine,
    session: machine.active(),
    held: new Set(),
    confirm: () => undefined,
  };
  return { context, drive: machine.drive, events };
}

describe('copyItem', () => {
  it('refuses a folder onto a file, with or without -Recurse, and changes nothing', () => {
    const { context, drive, events } = laptop();
    for (const recurse of [false, true])
      expect(copyItem(context, 'Users/kyle/src', 'Users/kyle/a.txt', recurse)).toEqual([
        'Container cannot be copied onto existing leaf item.',
      ]);
    expect(drive.readFile('Users/kyle/a.txt')).toBe('orig\n');
    expect(events).toEqual([]);
  });

  it('refuses a file onto a folder', () => {
    const { context, drive, events } = laptop();
    drive.makeDir('Users/kyle/dest/a.txt');
    expect(copyItem(context, 'Users/kyle/a.txt', 'Users/kyle/dest/a.txt', false)).toEqual([
      "The target file 'C:\\Users\\kyle\\dest\\a.txt' is a directory, not a file.",
    ]);
    expect(drive.isDir('Users/kyle/dest/a.txt')).toBe(true);
    expect(events).toEqual([]);
  });

  it('skips a file that meets a folder partway through, and still copies the rest', () => {
    const { context, drive, events } = laptop();
    drive.makeDir('Users/kyle/dest/src/one.txt');
    // dest\src is already there, so PowerShell says that first (checked in 7.6.6).
    expect(copyItem(context, 'Users/kyle/src', 'Users/kyle/dest/src', true)).toEqual([
      'An item with the specified name C:\\Users\\kyle\\dest\\src already exists.',
      "The target file 'C:\\Users\\kyle\\dest\\src\\one.txt' is a directory, not a file.",
    ]);
    expect(drive.readFile('Users/kyle/dest/src/a.txt')).toBe('a\n');
    expect(drive.readFile('Users/kyle/dest/src/z.txt')).toBe('z\n');
    expect(drive.readFile('Users/kyle/dest/src/sub/two.txt')).toBe('2\n');
    expect(drive.isDir('Users/kyle/dest/src/one.txt')).toBe(true);
    expect(events).toContainEqual({
      type: 'fileChanged',
      path: 'Users/kyle/dest/src/z.txt',
      change: 'created',
    });
    expect(events).not.toContainEqual({
      type: 'fileChanged',
      path: 'Users/kyle/dest/src/one.txt',
      change: 'created',
    });
  });

  it('skips a folder that meets a file partway through, quietly with -Force', () => {
    for (const force of [false, true]) {
      const { context, drive } = laptop();
      drive.writeFile('Users/kyle/dest/src/sub', 'file\n');
      expect(copyItem(context, 'Users/kyle/src', 'Users/kyle/dest/src', true, force)).toEqual(
        force
          ? []
          : [
              'An item with the specified name C:\\Users\\kyle\\dest\\src already exists.',
              'An item with the specified name C:\\Users\\kyle\\dest\\src\\sub already exists.',
            ],
      );
      expect(drive.readFile('Users/kyle/dest/src/sub')).toBe('file\n');
      expect(drive.readFile('Users/kyle/dest/src/one.txt')).toBe('1\n');
    }
  });

  it('refuses a file into a folder that is missing or is a file, and makes nothing', () => {
    const { context, drive, events } = laptop();
    expect(copyItem(context, 'Users/kyle/notes.txt', 'Users/kyle/bare.txt/x.txt', false)).toEqual([
      "Could not find a part of the path 'C:\\Users\\kyle\\bare.txt\\x.txt'.",
    ]);
    expect(copyItem(context, 'Users/kyle/notes.txt', 'Users/kyle/nope/x.txt', false)).toEqual([
      "Could not find a part of the path 'C:\\Users\\kyle\\nope\\x.txt'.",
    ]);
    expect(drive.exists('Users/kyle/nope')).toBe(false);
    expect(drive.readFile('Users/kyle/bare.txt')).toBe('bare\n');
    expect(events).toEqual([]);
  });

  it('makes the missing folders above a folder copy, unless a file is in the way', () => {
    const { context, drive } = laptop();
    expect(copyItem(context, 'Users/kyle/src', 'Users/kyle/dest/x/y', true)).toEqual([]);
    expect(drive.readFile('Users/kyle/dest/x/y/sub/two.txt')).toBe('2\n');
    expect(copyItem(context, 'Users/kyle/src', 'Users/kyle/a.txt/x', true)).toEqual([
      "Cannot create 'C:\\Users\\kyle\\a.txt' because a file or directory with the same name already exists.",
    ]);
    expect(drive.readFile('Users/kyle/a.txt')).toBe('orig\n');
  });

  it('keeps Hidden and ReadOnly on a copied file, and neither on a copied folder', () => {
    const { context, drive } = laptop();
    drive.hide('Users/kyle/src');
    drive.hide('Users/kyle/src/sub');
    drive.hide('Users/kyle/src/one.txt');
    drive.setReadOnly('Users/kyle/a.txt');
    drive.makeDir('Users/kyle/ro');
    drive.setReadOnly('Users/kyle/ro');

    copyItem(context, 'Users/kyle/src', 'Users/kyle/s2', true);
    copyItem(context, 'Users/kyle/a.txt', 'Users/kyle/b.txt', false);
    copyItem(context, 'Users/kyle/ro', 'Users/kyle/ro2', false);

    expect(drive.isHidden('Users/kyle/s2')).toBe(false);
    expect(drive.isHidden('Users/kyle/s2/sub')).toBe(false);
    expect(drive.isHidden('Users/kyle/s2/one.txt')).toBe(true);
    expect(drive.isReadOnly('Users/kyle/b.txt')).toBe(true);
    expect(drive.isReadOnly('Users/kyle/ro2')).toBe(false);
  });
});

const folderEvents = (events: EngineEvent[]) =>
  events.filter((event) => event.type === 'folderChanged');

describe('folders are announced', () => {
  it('announces each folder a copy makes, missing parents first, and none already there', () => {
    const { context, events } = laptop();
    copyItem(context, 'Users/kyle/src', 'Users/kyle/dest/x/y', true);
    expect(folderEvents(events)).toEqual([
      { type: 'folderChanged', path: 'Users/kyle/dest/x', change: 'created' },
      { type: 'folderChanged', path: 'Users/kyle/dest/x/y', change: 'created' },
      { type: 'folderChanged', path: 'Users/kyle/dest/x/y/sub', change: 'created' },
    ]);
    events.length = 0;
    copyItem(context, 'Users/kyle/src', 'Users/kyle/dest/x/y', true, true);
    expect(folderEvents(events)).toEqual([]);
  });

  it('announces a moved folder as gone, children first, then made, outermost first', () => {
    const { context, events } = laptop();
    moveItem(context, 'Users/kyle/src', 'Users/kyle/dest/src');
    expect(folderEvents(events)).toEqual([
      { type: 'folderChanged', path: 'Users/kyle/src/sub', change: 'deleted' },
      { type: 'folderChanged', path: 'Users/kyle/src', change: 'deleted' },
      { type: 'folderChanged', path: 'Users/kyle/dest/src', change: 'created' },
      { type: 'folderChanged', path: 'Users/kyle/dest/src/sub', change: 'created' },
    ]);
    const made = (path: string) =>
      events.findIndex((event) => 'path' in event && event.path === path);
    // A folder is there before the files that land in it.
    expect(made('Users/kyle/dest/src/sub')).toBeLessThan(made('Users/kyle/dest/src/sub/two.txt'));
  });

  it('announces a moved file as gone and made, with no folders', () => {
    const { context, events } = laptop();
    moveItem(context, 'Users/kyle/notes.txt', 'Users/kyle/dest/notes.txt');
    expect(events).toEqual([
      { type: 'fileChanged', path: 'Users/kyle/notes.txt', change: 'deleted' },
      { type: 'fileChanged', path: 'Users/kyle/dest/notes.txt', change: 'created' },
    ]);
  });

  it('announces everything a delete removes, what is inside a folder before the folder', () => {
    const { context, drive, events } = laptop();
    deleteItem(context, 'Users/kyle/src');
    expect(drive.exists('Users/kyle/src')).toBe(false);
    expect(events).toEqual([
      { type: 'fileChanged', path: 'Users/kyle/src/sub/two.txt', change: 'deleted' },
      { type: 'folderChanged', path: 'Users/kyle/src/sub', change: 'deleted' },
      { type: 'fileChanged', path: 'Users/kyle/src/a.txt', change: 'deleted' },
      { type: 'fileChanged', path: 'Users/kyle/src/one.txt', change: 'deleted' },
      { type: 'fileChanged', path: 'Users/kyle/src/z.txt', change: 'deleted' },
      { type: 'folderChanged', path: 'Users/kyle/src', change: 'deleted' },
    ]);
  });
});

describe('moveItem', () => {
  it('leaves the file and announces nothing when the destination is under a file', () => {
    const { context, drive, events } = laptop();
    expect(() => moveItem(context, 'Users/kyle/notes.txt', 'Users/kyle/bare.txt/x.txt')).toThrow(
      'ENOTDIR: Users/kyle/bare.txt/x.txt',
    );
    expect(drive.readFile('Users/kyle/notes.txt')).toBe('one\n');
    expect(events).toEqual([]);
  });
});

describe('resolveItems', () => {
  it("names a wildcard's missing folder, but finds nothing under a file", () => {
    const { context } = laptop();
    expect(resolveItems(context, 'nope\\*.txt', false)).toEqual({
      refused: "Cannot find path 'C:\\Users\\kyle\\nope' because it does not exist.",
    });
    expect(resolveItems(context, 'nope\\deeper\\*.txt', false)).toEqual({
      refused: "Cannot find path 'C:\\Users\\kyle\\nope\\deeper' because it does not exist.",
    });
    expect(resolveItems(context, 'a.txt\\*.txt', false)).toEqual({ paths: [] });
    expect(resolveItems(context, 'src\\*.txt', false)).toEqual({
      paths: ['Users/kyle/src/a.txt', 'Users/kyle/src/one.txt', 'Users/kyle/src/z.txt'],
    });
  });
});
