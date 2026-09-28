import { describe, expect, it } from 'vitest';
import { gitText } from '../git/cli/testRun';
import { testDeps } from '../git/testDeps';
import { Workspace } from '../workspace';
import { SubtreeFs, type FileTree } from './fileTree';
import { FsError, VirtualFs } from './virtualFs';

const MOUNT = 'Users/kyle/quillwork/app';

/** A drive with files around the mount, which the view must never show or touch. */
function drive(): VirtualFs {
  const fs = new VirtualFs();
  fs.writeFile('Users/kyle/notes/today.txt', 'ship it');
  fs.writeFile('Users/kyle/quillwork/api/server.js', 'listen');
  fs.makeDir(MOUNT);
  return fs;
}

/** What an operation did: its result, or the error it threw (code and path). */
function outcome(run: () => unknown): unknown {
  try {
    return { ok: run() ?? null };
  } catch (error) {
    if (error instanceof FsError) return { error: error.code, path: error.path };
    throw error;
  }
}

/**
 * Every operation a FileTree offers, including the ones that fail. Run in order against a
 * fresh tree, each must give the same outcome on a VirtualFs and on a SubtreeFs.
 */
const SCRIPT: [string, (fs: FileTree) => unknown][] = [
  ['empty root', (fs) => fs.listDir('')],
  ['write a file', (fs) => fs.writeFile('src/app.ts', 'v1')],
  ['write it again, unchanged', (fs) => fs.writeFile('src/app.ts', 'v1')],
  ['write it again, changed', (fs) => fs.writeFile('src/app.ts', 'v2')],
  ['read it', (fs) => fs.readFile('src/app.ts')],
  ['read a missing file', (fs) => fs.readFile('src/nope.ts')],
  ['read a folder', (fs) => fs.readFile('src')],
  ['write the root', (fs) => fs.writeFile('', 'x')],
  ['write over a folder', (fs) => fs.writeFile('src', 'x')],
  ['write below a file', (fs) => fs.writeFile('src/app.ts/inner', 'x')],
  [
    'make an empty folder',
    (fs) => {
      fs.makeDir('docs/notes');
    },
  ],
  [
    'make a folder where a file is',
    (fs) => {
      fs.makeDir('src/app.ts');
    },
  ],
  [
    'check kinds',
    (fs) => [fs.isFile('src/app.ts'), fs.isDir('src'), fs.exists('nope'), fs.isDir('')],
  ],
  ['list the root', (fs) => fs.listDir('')],
  ['list a file', (fs) => fs.listDir('src/app.ts')],
  ['list a missing folder', (fs) => fs.listDir('nope')],
  ['every file', (fs) => fs.allFiles()],
  ['files under a folder', (fs) => fs.allFiles('src')],
  [
    'remove a full folder without recursive',
    (fs) => {
      fs.removeDir('src', { recursive: false });
    },
  ],
  [
    'remove the root',
    (fs) => {
      fs.removeDir('', { recursive: true });
    },
  ],
  [
    'remove a missing folder',
    (fs) => {
      fs.removeDir('nope', { recursive: true });
    },
  ],
  [
    'delete a folder as a file',
    (fs) => {
      fs.deleteFile('src');
    },
  ],
  [
    'delete a missing file',
    (fs) => {
      fs.deleteFile('src/nope.ts');
    },
  ],
  [
    'delete a file',
    (fs) => {
      fs.deleteFile('src/app.ts');
    },
  ],
  [
    'remove a folder recursively',
    (fs) => {
      fs.removeDir('docs', { recursive: true });
    },
  ],
  ['what is left', (fs) => [fs.allFiles(), fs.listDir('')]],
];

describe('SubtreeFs', () => {
  it('behaves exactly like a VirtualFs of its own, errors included', () => {
    const alone = new VirtualFs();
    const mounted = new SubtreeFs(drive(), MOUNT);
    for (const [name, step] of SCRIPT) {
      expect({ name, result: outcome(() => step(mounted)) }).toEqual({
        name,
        result: outcome(() => step(alone)),
      });
    }
  });

  it('writes through to the drive, below the mount', () => {
    const fs = drive();
    const view = new SubtreeFs(fs, MOUNT);
    view.writeFile('README.md', '# app');

    expect(fs.readFile(`${MOUNT}/README.md`)).toBe('# app');
    expect(view.isFile('README.md')).toBe(true);
  });

  it('never shows or touches anything outside the mount', () => {
    const fs = drive();
    const view = new SubtreeFs(fs, MOUNT);
    view.writeFile('src/app.ts', 'x');
    view.removeDir('src', { recursive: true });

    expect(view.allFiles()).toEqual([]);
    // Real files sit just outside the mount; no path through the view reaches them.
    expect(view.exists('../api/server.js')).toBe(false);
    expect(view.exists('../../notes/today.txt')).toBe(false);
    expect(outcome(() => view.readFile('../api/server.js'))).toEqual({
      error: 'ENOENT',
      path: '../api/server.js',
    });
    expect(fs.readFile('Users/kyle/notes/today.txt')).toBe('ship it');
    expect(fs.isDir(MOUNT)).toBe(true);
  });

  it('fails cleanly once the mounted folder is removed, and never brings it back', () => {
    const fs = drive();
    const view = new SubtreeFs(fs, MOUNT);
    view.writeFile('notes.md', 'hi');
    fs.removeDir('Users/kyle/quillwork', { recursive: true });

    expect(outcome(() => view.writeFile('b.txt', 'x'))).toEqual({ error: 'ENOENT', path: '' });
    expect(
      outcome(() => {
        view.makeDir('src');
      }),
    ).toEqual({ error: 'ENOENT', path: '' });
    expect(outcome(() => view.listDir(''))).toEqual({ error: 'ENOENT', path: '' });
    expect(fs.exists('Users/kyle/quillwork')).toBe(false);
  });

  it('creates the mount folder when the drive lacks it', () => {
    const fs = new VirtualFs();
    new SubtreeFs(fs, 'Users/priya/app');

    expect(fs.isDir('Users/priya/app')).toBe(true);
  });

  it('refuses to mount at the root, where it would be the drive itself', () => {
    expect(() => new SubtreeFs(new VirtualFs(), '')).toThrow('Mount a subtree at a folder');
  });

  it('passes other errors through untouched', () => {
    class FailingFs extends VirtualFs {
      override readFile(): string {
        throw new Error('disk on fire');
      }
    }

    expect(() => new SubtreeFs(new FailingFs(), MOUNT).readFile('a')).toThrow('disk on fire');
  });
});

describe('a workspace on a mounted project folder', () => {
  it('runs git on the folder, with every file on the drive', () => {
    const fs = drive();
    const ws = new Workspace(testDeps(), { fs: new SubtreeFs(fs, MOUNT) });
    ws.writeFile('notes.md', 'hello');
    gitText(ws, ['init']);
    gitText(ws, ['add', 'notes.md']);
    gitText(ws, ['commit', '-m', 'docs: add notes']);

    expect(ws.status().untracked).toEqual([]);
    expect(fs.readFile(`${MOUNT}/notes.md`)).toBe('hello');
    // Files outside the project are invisible to git, like any folder above a repository.
    expect(gitText(ws, ['status', '--short'])).toBe('');
  });
});
