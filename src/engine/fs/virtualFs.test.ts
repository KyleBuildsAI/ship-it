import { describe, expect, it } from 'vitest';
import { FsError, VirtualFs } from './virtualFs';

function errorCode(action: () => void): string | undefined {
  try {
    action();
  } catch (error) {
    if (error instanceof FsError) return error.code;
    throw error;
  }
  return undefined;
}

describe('VirtualFs files', () => {
  it('writes and reads files, reporting what changed', () => {
    const fs = new VirtualFs();
    expect(fs.writeFile('app.ts', 'v1')).toBe('created');
    expect(fs.writeFile('app.ts', 'v1')).toBe('unchanged');
    expect(fs.writeFile('app.ts', 'v2')).toBe('modified');
    expect(fs.readFile('app.ts')).toBe('v2');
  });

  it('creates parent directories when writing a nested file', () => {
    const fs = new VirtualFs();
    fs.writeFile('src/lib/util.ts', 'x');
    expect(fs.isDir('src')).toBe(true);
    expect(fs.isDir('src/lib')).toBe(true);
    expect(fs.exists('src/lib/util.ts')).toBe(true);
  });

  it('deletes files but keeps their directory', () => {
    const fs = new VirtualFs();
    fs.writeFile('src/app.ts', 'x');
    fs.deleteFile('src/app.ts');
    expect(fs.isFile('src/app.ts')).toBe(false);
    expect(fs.isDir('src')).toBe(true);
  });

  it('reports precise error codes', () => {
    const fs = new VirtualFs();
    fs.writeFile('src/app.ts', 'x');
    expect(errorCode(() => fs.readFile('missing.ts'))).toBe('ENOENT');
    expect(errorCode(() => fs.readFile('src'))).toBe('EISDIR');
    expect(errorCode(() => fs.writeFile('src', 'x'))).toBe('EISDIR');
    expect(errorCode(() => fs.writeFile('', 'x'))).toBe('EISDIR');
    expect(errorCode(() => fs.writeFile('src/app.ts/inner.ts', 'x'))).toBe('ENOTDIR');
    expect(
      errorCode(() => {
        fs.deleteFile('missing.ts');
      }),
    ).toBe('ENOENT');
    expect(
      errorCode(() => {
        fs.deleteFile('src');
      }),
    ).toBe('EISDIR');
  });

  it('lists every file below a directory in sorted order', () => {
    const fs = new VirtualFs();
    fs.writeFile('b.ts', '');
    fs.writeFile('src/z.ts', '');
    fs.writeFile('src/a.ts', '');
    fs.writeFile('srcx/c.ts', '');
    expect(fs.allFiles()).toEqual(['b.ts', 'src/a.ts', 'src/z.ts', 'srcx/c.ts']);
    expect(fs.allFiles('src')).toEqual(['src/a.ts', 'src/z.ts']);
  });
});

describe('VirtualFs directories', () => {
  it('makes nested directories like mkdir -p', () => {
    const fs = new VirtualFs();
    fs.makeDir('docs/guides');
    expect(fs.isDir('docs')).toBe(true);
    expect(fs.isDir('docs/guides')).toBe(true);
  });

  it('refuses to make a directory where a file exists', () => {
    const fs = new VirtualFs();
    fs.writeFile('notes', 'x');
    expect(
      errorCode(() => {
        fs.makeDir('notes');
      }),
    ).toBe('EEXIST');
  });

  it('lists children with directories first', () => {
    const fs = new VirtualFs();
    fs.writeFile('README.md', '');
    fs.writeFile('src/app.ts', '');
    fs.writeFile('src/lib/util.ts', '');
    fs.makeDir('assets');
    expect(fs.listDir('')).toEqual([
      { name: 'assets', kind: 'dir' },
      { name: 'src', kind: 'dir' },
      { name: 'README.md', kind: 'file' },
    ]);
    expect(fs.listDir('src')).toEqual([
      { name: 'lib', kind: 'dir' },
      { name: 'app.ts', kind: 'file' },
    ]);
  });

  it('rejects listing files and missing directories', () => {
    const fs = new VirtualFs();
    fs.writeFile('app.ts', '');
    expect(errorCode(() => fs.listDir('app.ts'))).toBe('ENOTDIR');
    expect(errorCode(() => fs.listDir('nope'))).toBe('ENOENT');
  });

  it('removes empty directories, and full ones only when recursive', () => {
    const fs = new VirtualFs();
    fs.makeDir('empty');
    fs.writeFile('full/a.ts', '');
    fs.makeDir('full/nested');
    fs.removeDir('empty', { recursive: false });
    expect(fs.isDir('empty')).toBe(false);
    expect(
      errorCode(() => {
        fs.removeDir('full', { recursive: false });
      }),
    ).toBe('ENOTEMPTY');
    fs.removeDir('full', { recursive: true });
    expect(fs.exists('full')).toBe(false);
    expect(fs.exists('full/a.ts')).toBe(false);
    expect(fs.exists('full/nested')).toBe(false);
  });

  it('never removes the root or a missing directory', () => {
    const fs = new VirtualFs();
    expect(
      errorCode(() => {
        fs.removeDir('', { recursive: true });
      }),
    ).toBe('ENOENT');
    expect(
      errorCode(() => {
        fs.removeDir('ghost', { recursive: true });
      }),
    ).toBe('ENOENT');
  });
});
