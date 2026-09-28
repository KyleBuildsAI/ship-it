import { describe, expect, it } from 'vitest';
import { WindowsFs } from './windowsFs';

describe('WindowsFs', () => {
  it('finds a file whatever the case, keeping the spelling it was made with', () => {
    const drive = new WindowsFs();
    drive.writeFile('Users/kyle/Documents/Report.csv', 'x');

    expect(drive.readFile('users/KYLE/documents/report.CSV')).toBe('x');
    expect(drive.stored('users/kyle/documents/report.csv')).toBe('Users/kyle/Documents/Report.csv');
    expect(drive.listDir('USERS/kyle')).toEqual([{ name: 'Documents', kind: 'dir' }]);
  });

  it('never holds two names that differ only in case', () => {
    const drive = new WindowsFs();
    drive.makeDir('Users/kyle/quillwork');
    drive.makeDir('Users/kyle/Quillwork/API');
    drive.writeFile('users/kyle/QUILLWORK/api/server.js', 'v1');

    expect(drive.listDir('Users/kyle')).toEqual([{ name: 'quillwork', kind: 'dir' }]);
    expect(drive.allFiles()).toEqual(['Users/kyle/quillwork/API/server.js']);
  });

  it('writes over a file in any case, rather than making a second one', () => {
    const drive = new WindowsFs();
    drive.writeFile('notes.txt', 'a');

    expect(drive.writeFile('NOTES.TXT', 'b')).toBe('modified');
    expect(drive.allFiles()).toEqual(['notes.txt']);
  });

  it('answers the other questions in any case too', () => {
    const drive = new WindowsFs();
    drive.writeFile('Tools/jq.exe', 'x');

    expect(drive.isFile('tools/JQ.EXE')).toBe(true);
    expect(drive.isDir('TOOLS')).toBe(true);
    expect(drive.exists('tools')).toBe(true);
    expect(drive.allFiles('tools')).toEqual(['Tools/jq.exe']);
    drive.deleteFile('TOOLS/JQ.exe');
    drive.removeDir('tools', { recursive: false });
    expect(drive.exists('Tools')).toBe(false);
  });

  it('spells what is missing as typed, after the part that exists', () => {
    const drive = new WindowsFs();
    drive.makeDir('Users/kyle');

    expect(drive.stored('users/KYLE/New Folder/a.txt')).toBe('Users/kyle/New Folder/a.txt');
    expect(drive.stored('')).toBe('');
  });

  it('stops matching at a file, as a path through a file leads nowhere', () => {
    const drive = new WindowsFs();
    drive.writeFile('a.txt', 'x');

    expect(drive.stored('A.TXT/inside')).toBe('a.txt/inside');
  });

  it('hides an item with the Hidden attribute, in any case, and forgets it when deleted', () => {
    const drive = new WindowsFs();
    drive.makeDir('Users/kyle/AppData/Local');
    drive.writeFile('Users/kyle/.cache', 'x');
    drive.hide('users/KYLE/appdata');

    expect(drive.isHidden('Users/kyle/AppData')).toBe(true);
    expect(drive.isHidden('USERS/kyle/APPDATA')).toBe(true);
    // A leading dot hides nothing on Windows.
    expect(drive.isHidden('Users/kyle/.cache')).toBe(false);
    expect(drive.isHidden('Users/kyle/AppData/Local')).toBe(false);

    drive.hide('Users/kyle/AppData/Local');
    drive.removeDir('Users/kyle/AppData', { recursive: true });
    drive.makeDir('Users/kyle/AppData/Local');
    expect(drive.isHidden('Users/kyle/AppData')).toBe(false);
    expect(drive.isHidden('Users/kyle/AppData/Local')).toBe(false);

    drive.hide('Users/kyle/.cache');
    drive.deleteFile('Users/kyle/.cache');
    drive.writeFile('Users/kyle/.cache', 'y');
    expect(drive.isHidden('Users/kyle/.cache')).toBe(false);
  });

  it('keeps a ReadOnly attribute beside Hidden, and forgets both on delete', () => {
    const drive = new WindowsFs();
    drive.makeDir('Users/kyle/Downloads/inner');
    drive.setReadOnly('users/kyle/downloads');
    drive.hide('Users/kyle/Downloads/inner');

    expect(drive.isReadOnly('Users/kyle/Downloads')).toBe(true);
    expect(drive.isReadOnly('Users/kyle/Downloads/inner')).toBe(false);
    drive.removeDir('Users/kyle/Downloads', { recursive: true });
    drive.makeDir('Users/kyle/Downloads/inner');
    expect(drive.isReadOnly('Users/kyle/Downloads')).toBe(false);
    expect(drive.isHidden('Users/kyle/Downloads/inner')).toBe(false);
  });

  it('moves an item with its contents and attributes, even to a new spelling of its name', () => {
    const drive = new WindowsFs();
    drive.writeFile('Users/kyle/src/sub/two.txt', '2');
    drive.makeDir('Users/kyle/src/empty');
    drive.hide('Users/kyle/src/sub');
    drive.setReadOnly('Users/kyle/src/empty');

    expect(drive.move('users/kyle/SRC', 'Users/kyle/Source')).toBe('Users/kyle/Source');
    expect(drive.readFile('Users/kyle/Source/sub/two.txt')).toBe('2');
    expect(drive.isDir('Users/kyle/Source/empty')).toBe(true);
    expect(drive.isHidden('Users/kyle/Source/sub')).toBe(true);
    expect(drive.isReadOnly('Users/kyle/Source/empty')).toBe(true);
    expect(drive.listDir('Users/kyle').map((entry) => entry.name)).toEqual(['Source']);

    drive.move('Users/kyle/Source/sub/two.txt', 'Users/kyle/TWO.txt');
    expect(drive.readFile('Users/kyle/TWO.txt')).toBe('2');
  });
});
