import { describe, expect, it } from 'vitest';
import { buildWorkspace, folder, repo, windows } from '../fixtures';
import { gitText } from '../git/cli/testRun';
import { testDeps } from '../git/testDeps';
import type { Machine } from './machine';
import { STOCK_MACHINE_ENV } from './stock';

function build(steps: ReturnType<typeof windows>) {
  const ws = steps.build(testDeps());
  if (ws.machine === null) throw new Error('expected a laptop');
  return { ws, machine: ws.machine };
}

const tab = (machine: Machine) => machine.active();

describe('windows()', () => {
  it('builds a stock Windows 11 laptop with a terminal open at home', () => {
    const { machine } = build(windows());

    expect(machine.user).toBe('kyle');
    expect(machine.drive.isDir('Users/kyle/Downloads')).toBe(true);
    expect(machine.drive.isDir('Program Files/PowerShell/7')).toBe(true);
    expect(machine.saved.machine.get('Path')).toBe(STOCK_MACHINE_ENV.Path);
    expect(tab(machine).cwd).toBe('Users/kyle');
    expect(tab(machine).env.get('Path')).toContain(
      'C:\\Users\\kyle\\AppData\\Local\\Microsoft\\WindowsApps',
    );
  });

  it('mounts the project folder where git works, ~\\quillwork\\app by default', () => {
    const { ws, machine } = build(
      windows().write('Users/kyle/quillwork/app/notes.md', 'hi').init(),
    );
    gitText(ws, ['add', 'notes.md']);
    gitText(ws, ['commit', '-m', 'docs: notes']);

    expect(ws.fs.isFile('notes.md')).toBe(true);
    expect(machine.drive.isFile('Users/kyle/quillwork/app/notes.md')).toBe(true);
    expect(ws.status().staged).toEqual([]);
  });

  it('mounts somewhere else, and for another user, when asked', () => {
    const { ws, machine } = build(
      windows({ user: 'priya', computer: 'QUILL-LT-12', mount: 'Users/priya/quillwork-api' }),
    );

    expect(machine.home).toBe('Users/priya');
    expect(machine.computer).toBe('QUILL-LT-12');
    ws.writeFile('package.json', '{}');
    expect(machine.drive.isFile('Users/priya/quillwork-api/package.json')).toBe(true);
  });

  it('writes, appends and deletes files by their drive path', () => {
    const { machine } = build(
      windows()
        .files({ 'Users/kyle/notes/a.txt': 'one\n', 'Users/kyle/notes/b.txt': 'x' })
        .modify('Users/kyle/notes/a.txt')
        .delete('Users/kyle/notes/b.txt')
        .mkdir('Users/kyle/empty'),
    );

    expect(machine.drive.readFile('Users/kyle/notes/a.txt')).toBe('one\n// work in progress\n');
    expect(machine.drive.exists('Users/kyle/notes/b.txt')).toBe(false);
    expect(machine.drive.isDir('Users/kyle/empty')).toBe(true);
  });
});

describe('the session rule', () => {
  it('opens no second terminal when the setup opened one', () => {
    const { machine } = build(windows().session());

    expect(machine.sessions()).toHaveLength(1);
  });
});

describe('mixing sandboxes', () => {
  it('keeps windows() first', () => {
    expect(() =>
      buildWorkspace([{ op: 'init' }, { op: 'windows', user: 'kyle', computer: 'PC' }], testDeps()),
    ).toThrow('windows() must be the first step.');
  });

  it('refuses laptop steps in an Act 2 project sandbox', () => {
    expect(() => folder().session().build(testDeps())).toThrow(
      'The "session" step needs a windows() sandbox.',
    );
  });

  it("leaves Act 2's sandboxes exactly as they were: no machine", () => {
    expect(repo().build(testDeps()).machine).toBeNull();
  });
});
