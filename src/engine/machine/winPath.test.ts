import { describe, expect, it } from 'vitest';
import { VirtualFs } from '../fs/virtualFs';
import { display, fromDisplay, resolveExisting, toCanonical } from './winPath';

const at = { cwd: 'Users/kyle/quillwork/api', home: 'Users/kyle' };
const path = (input: string) => toCanonical(input, at);

describe('toCanonical', () => {
  it.each([
    ['C:\\Users\\kyle\\Downloads', 'Users/kyle/Downloads'],
    ['c:/program files/nodejs', 'program files/nodejs'],
    ['C:\\', ''],
    ['C:', 'Users/kyle/quillwork/api'],
    ['C:docs', 'Users/kyle/quillwork/api/docs'],
    ['\\tools', 'tools'],
    ['~', 'Users/kyle'],
    ['~\\notes', 'Users/kyle/notes'],
    ['docs', 'Users/kyle/quillwork/api/docs'],
    ['.\\docs\\.', 'Users/kyle/quillwork/api/docs'],
    ['..\\..\\web', 'Users/kyle/web'],
    ['..\\..\\..\\..\\..\\..', ''],
    ['"C:\\Program Files\\nodejs"', 'Program Files/nodejs'],
    ["'..\\web'", 'Users/kyle/quillwork/web'],
    ['  docs\\  ', 'Users/kyle/quillwork/api/docs'],
  ])('%s is %s', (input, expected) => {
    expect(path(input)).toEqual({ ok: true, path: expected });
  });

  it('says which drive is missing for anything but C:', () => {
    expect(path('D:\\games')).toEqual({ ok: false, drive: 'D' });
    expect(path('e:')).toEqual({ ok: false, drive: 'E' });
  });
});

describe('display', () => {
  it('shows canonical paths the way Windows does', () => {
    expect(display('Users/kyle')).toBe('C:\\Users\\kyle');
    expect(display('')).toBe('C:\\');
  });
});

describe('fromDisplay', () => {
  it('reads a PATH entry, with or without a trailing backslash', () => {
    expect(fromDisplay('C:\\Program Files\\nodejs\\')).toBe('Program Files/nodejs');
    expect(fromDisplay('c:/Windows/system32')).toBe('Windows/system32');
  });

  it('skips entries that are relative, on another drive, or empty', () => {
    expect(fromDisplay('tools\\bin')).toBeNull();
    expect(fromDisplay('D:\\bin')).toBeNull();
    expect(fromDisplay('')).toBeNull();
  });
});

describe('resolveExisting', () => {
  const tree = new VirtualFs();
  tree.writeFile('Users/kyle/Documents/report.csv', 'x');

  it('finds a path whatever its case, returning the stored spelling', () => {
    expect(resolveExisting(tree, 'users/KYLE/documents')).toBe('Users/kyle/Documents');
    expect(resolveExisting(tree, 'USERS/kyle/documents/REPORT.CSV')).toBe(
      'Users/kyle/Documents/report.csv',
    );
    expect(resolveExisting(tree, '')).toBe('');
  });

  it('is null for a missing path, or one that goes through a file', () => {
    expect(resolveExisting(tree, 'Users/priya')).toBeNull();
    expect(resolveExisting(tree, 'Users/kyle/Documents/report.csv/inside')).toBeNull();
  });
});
