import { describe, expect, it } from 'vitest';
import { buildWorkspace, folder, repo, windows } from '../fixtures';
import { gitText } from '../git/cli/testRun';
import { testDeps } from '../git/testDeps';
import { applyMachineStep } from './fixtures';
import type { Machine } from './machine';
import { STOCK_MACHINE_ENV } from './stock';
import { recordMachineEvents } from './testDeps';

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
    // AppData is hidden on a real laptop, so a plain listing of home leaves it out.
    expect(machine.drive.isHidden('Users/kyle/AppData')).toBe(true);
    expect(machine.drive.isReadOnly('Users/kyle/Documents')).toBe(true);
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
  it('leaves a terminal opened early on its old variables: a stale terminal', () => {
    const { machine } = build(
      windows().session().pathAdd('user', 'C:\\Program Files\\nodejs\\').pathAdd('user', 'C:\\x'),
    );

    expect(tab(machine).env.get('Path')).not.toContain('nodejs');
    expect(machine.newTerminalEnv().get('Path')).toContain(
      'WindowsApps;C:\\Program Files\\nodejs\\;C:\\x',
    );
  });

  it('opens no second terminal when the setup opened one', () => {
    const { machine } = build(windows().session());

    expect(machine.sessions()).toHaveLength(1);
  });

  it('refuses cd and this-terminal variables before a terminal is open', () => {
    expect(() => windows().cd('Users/kyle').build(testDeps())).toThrow(
      'The "cd" step needs an open terminal',
    );
    expect(() => windows().env('session', 'PORT', '1').build(testDeps())).toThrow(
      'The "env" step needs an open terminal',
    );
    expect(() => windows().pathAdd('session', 'C:\\x').build(testDeps())).toThrow(
      'The "pathAdd" step needs an open terminal',
    );
  });
});

describe('laptop steps', () => {
  it('moves the terminal, finding the folder whatever its case', () => {
    const { machine } = build(
      windows().mkdir('Users/kyle/Projects/API').session().cd('users/kyle/projects/api'),
    );

    expect(tab(machine).cwd).toBe('Users/kyle/Projects/API');
  });

  it("refuses to cd into a folder that isn't there", () => {
    expect(() => windows().session().cd('Users/kyle/nope').build(testDeps())).toThrow(
      "names a folder that doesn't exist: C:\\Users\\kyle\\nope",
    );
  });

  it('sets and removes variables in every scope, Machine included', () => {
    const { machine } = build(
      windows()
        .env('machine', 'JAVA_HOME', 'C:\\jdk')
        .env('user', 'EDITOR', 'code')
        .session()
        .env('session', 'PORT', '4000')
        .env('session', 'PORT', null),
    );

    expect(machine.saved.machine.get('JAVA_HOME')).toBe('C:\\jdk');
    expect(tab(machine).env.get('EDITOR')).toBe('code');
    expect(tab(machine).env.get('PORT')).toBeNull();
  });

  it('saves a %NAME% value as expandable, the way an installer would', () => {
    const { machine } = build(windows().env('user', 'TOOLS', '%USERPROFILE%\\tools'));

    expect(machine.saved.user.expands('TOOLS')).toBe(true);
    expect(tab(machine).env.get('TOOLS')).toBe('C:\\Users\\kyle\\tools');
  });

  it("adds a PATH folder at the start or the end, keeping the Path's kind", () => {
    const { machine } = build(
      windows()
        .pathAdd('user', 'C:\\tools\\node16', 'end')
        .pathAdd('user', 'C:\\first', 'start')
        .session()
        .pathAdd('session', 'C:\\Program Files\\nodejs', 'start'),
    );

    expect(machine.saved.user.get('Path')).toBe(
      'C:\\first;%USERPROFILE%\\AppData\\Local\\Microsoft\\WindowsApps;C:\\tools\\node16',
    );
    expect(machine.saved.user.expands('Path')).toBe(true);
    expect(tab(machine).env.get('Path')?.startsWith('C:\\Program Files\\nodejs;')).toBe(true);
  });

  it('announces the folders a mkdir step makes on a live laptop, and only new ones', () => {
    const { machine } = build(windows().mkdir('Users/kyle/Projects'));
    const events = recordMachineEvents(machine);
    applyMachineStep(machine, { op: 'mkdir', path: 'Users/kyle/projects/api/src' });
    applyMachineStep(machine, { op: 'mkdir', path: 'Users/kyle/Projects' });

    expect(events).toEqual([
      { type: 'folderChanged', path: 'Users/kyle/Projects/api', change: 'created' },
      { type: 'folderChanged', path: 'Users/kyle/Projects/api/src', change: 'created' },
    ]);
  });

  it('restarts every terminal', () => {
    const { machine } = build(windows().session().env('session', 'X', '1').restartTerminals());

    expect(tab(machine).env.get('X')).toBeNull();
  });
});

describe('mixing sandboxes', () => {
  it('keeps windows() first', () => {
    expect(() =>
      buildWorkspace([{ op: 'init' }, { op: 'windows', user: 'kyle', computer: 'PC' }], testDeps()),
    ).toThrow('windows() must be the first step.');
  });

  it('refuses laptop steps in an Act 2 project sandbox', () => {
    expect(() => folder().mkdir('src').build(testDeps())).toThrow(
      'The "mkdir" step needs a windows() sandbox.',
    );
  });

  it("leaves Act 2's sandboxes exactly as they were: no machine", () => {
    expect(repo().build(testDeps()).machine).toBeNull();
  });
});
