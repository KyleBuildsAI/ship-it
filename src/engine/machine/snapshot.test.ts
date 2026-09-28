import { describe, expect, it } from 'vitest';
import { windows } from '../fixtures';
import { testDeps } from '../git/testDeps';
import { Shell } from '../shell/shell';
import type { Machine } from './machine';
import { diffSnapshots, snapshotMachine, type MachineChange } from './snapshot';
import { testMachine } from './testDeps';

/** A small laptop: one terminal open at home, a project, and some notes. */
function laptop(): Machine {
  const machine = testMachine();
  machine.openSession();
  const files = {
    'Users/kyle/api/package.json': '{}\n',
    'Users/kyle/api/src/index.ts': 'serve()\n',
    'Users/kyle/api/src/routes/users.ts': 'users()\n',
    'Users/kyle/empty.txt': '',
    'Users/kyle/notes.txt': 'ship it\n',
  };
  for (const [path, content] of Object.entries(files)) machine.drive.writeFile(path, content);
  return machine;
}

/** What `act` changes on a fresh laptop. */
function changesAfter(act: (machine: Machine) => void): MachineChange[] {
  const machine = laptop();
  const before = snapshotMachine(machine);
  act(machine);
  return diffSnapshots(before, snapshotMachine(machine));
}

describe('diffSnapshots', () => {
  it.each<{ does: string; act: (machine: Machine) => void; changes: MachineChange[] }>([
    {
      does: 'writes a file into a new folder',
      act: (machine) => machine.drive.writeFile('Users/kyle/web/app.ts', 'x'),
      changes: [
        { kind: 'created', path: 'Users/kyle/web', item: 'folder' },
        { kind: 'created', path: 'Users/kyle/web/app.ts', item: 'file' },
      ],
    },
    {
      // Graded by state: something made and removed again changed nothing.
      does: 'makes a folder and removes it again',
      act: (machine) => {
        machine.drive.makeDir('Users/kyle/tmp');
        machine.drive.removeDir('Users/kyle/tmp', { recursive: false });
      },
      changes: [],
    },
    {
      does: 'turns a folder into a file',
      act: (machine) => {
        machine.drive.removeDir('Users/kyle/api/src', { recursive: true });
        machine.drive.writeFile('Users/kyle/api/src', 'x');
      },
      changes: [
        { kind: 'created', path: 'Users/kyle/api/src', item: 'file' },
        { kind: 'deleted', path: 'Users/kyle/api/src', item: 'folder', inside: 3 },
      ],
    },
    {
      does: 'saves a new variable for the user',
      act: (machine) => machine.setEnv('user', 'API_URL', 'http://localhost:3000'),
      changes: [{ kind: 'env', scope: 'user', tab: null, name: 'API_URL', change: 'set' }],
    },
    {
      does: 'changes a saved variable',
      act: (machine) => machine.setEnv('user', 'temp', 'C:\\Temp'),
      changes: [{ kind: 'env', scope: 'user', tab: null, name: 'TEMP', change: 'changed' }],
    },
    {
      does: 'removes a saved variable',
      act: (machine) => machine.setEnv('user', 'TEMP', null),
      changes: [{ kind: 'env', scope: 'user', tab: null, name: 'TEMP', change: 'removed' }],
    },
    {
      // Same text, but saved plain, so %USERPROFILE% no longer expands in new terminals.
      does: 'saves the same Path as plain text',
      act: (machine) =>
        machine.setEnv('user', 'Path', '%USERPROFILE%\\AppData\\Local\\Microsoft\\WindowsApps'),
      changes: [{ kind: 'env', scope: 'user', tab: null, name: 'Path', change: 'changed' }],
    },
    {
      does: 'saves a variable for every user, as an administrator',
      act: (machine) => machine.setEnv('machine', 'JAVA_HOME', 'C:\\jdk', { admin: true }),
      changes: [{ kind: 'env', scope: 'machine', tab: null, name: 'JAVA_HOME', change: 'set' }],
    },
    {
      does: 'sets a variable in one terminal',
      act: (machine) => machine.setEnv('session', 'GREETING', 'hi'),
      changes: [{ kind: 'env', scope: 'session', tab: 1, name: 'GREETING', change: 'set' }],
    },
    {
      does: 'moves a terminal to another folder',
      act: (machine) => {
        machine.setLocation(1, 'Users/kyle/api', 'relative');
      },
      changes: [{ kind: 'location', tab: 1, from: 'Users/kyle', to: 'Users/kyle/api' }],
    },
    {
      does: 'opens a terminal',
      act: (machine) => machine.openSession(),
      changes: [{ kind: 'terminal', tab: 2, change: 'opened' }],
    },
    {
      does: 'closes a terminal',
      act: (machine) => {
        machine.closeSession(1);
      },
      changes: [{ kind: 'terminal', tab: 1, change: 'closed' }],
    },
  ])('$does', ({ act, changes }) => {
    expect(changesAfter(act)).toEqual(changes);
  });

  it('collapses a deleted folder into one change that counts what was inside it', () => {
    const changes = changesAfter((machine) => {
      machine.drive.removeDir('Users/kyle/api/src', { recursive: true });
      machine.drive.deleteFile('Users/kyle/notes.txt');
    });

    expect(changes).toEqual([
      // index.ts, routes, and routes/users.ts; package.json beside it stays.
      { kind: 'deleted', path: 'Users/kyle/api/src', item: 'folder', inside: 3 },
      { kind: 'deleted', path: 'Users/kyle/notes.txt', item: 'file', inside: 0 },
    ]);
  });

  it('tells an append, which loses nothing, from a replace', () => {
    const edit = (path: string, content: string) =>
      changesAfter((machine) => machine.drive.writeFile(path, content));

    expect(edit('Users/kyle/notes.txt', 'ship it\nsoon\n')).toEqual([
      { kind: 'modified', path: 'Users/kyle/notes.txt', how: 'appended' },
    ]);
    expect(edit('Users/kyle/notes.txt', 'ship it later\n')).toEqual([
      { kind: 'modified', path: 'Users/kyle/notes.txt', how: 'replaced' },
    ]);
    // An empty file had nothing to lose.
    expect(edit('Users/kyle/empty.txt', 'first line\n')).toEqual([
      { kind: 'modified', path: 'Users/kyle/empty.txt', how: 'appended' },
    ]);
    expect(edit('Users/kyle/notes.txt', 'ship it\n')).toEqual([]);
  });

  it('names variables and files but never carries their values', () => {
    const value = 'sk-super-secret';
    const changes = changesAfter((machine) => {
      machine.setEnv('session', 'API_KEY', value);
      machine.setEnv('user', 'API_KEY', value);
      machine.drive.writeFile('Users/kyle/api/.env', `API_KEY=${value}\n`);
    });

    expect(changes).toEqual([
      { kind: 'created', path: 'Users/kyle/api/.env', item: 'file' },
      { kind: 'env', scope: 'user', tab: null, name: 'API_KEY', change: 'set' },
      { kind: 'env', scope: 'session', tab: 1, name: 'API_KEY', change: 'set' },
    ]);
    expect(JSON.stringify(changes)).not.toContain(value);
  });

  it('reports a restarted terminal as closed and opened, not the notes and folder it lost', () => {
    const machine = laptop();
    machine.setLocation(1, 'Users/kyle/api', 'absolute');
    machine.setEnv('session', 'GREETING', 'hi');
    const before = snapshotMachine(machine);
    machine.restartTerminals();

    expect(diffSnapshots(before, snapshotMachine(machine))).toEqual([
      { kind: 'terminal', tab: 1, change: 'closed' },
      { kind: 'terminal', tab: 1, change: 'opened' },
    ]);
  });
});

describe('snapshots around real PowerShell lines', () => {
  function shellLaptop() {
    const ws = windows().write('Users/kyle/api/src/index.ts', 'serve()\n').build(testDeps());
    if (ws.machine === null) throw new Error('Not a laptop');
    return { shell: new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app'), machine: ws.machine };
  }

  it('sees what a line changed', () => {
    const { shell, machine } = shellLaptop();
    const before = snapshotMachine(machine);
    shell.run('mkdir web; Remove-Item api -Recurse; cd web');

    expect(diffSnapshots(before, snapshotMachine(machine))).toEqual([
      { kind: 'created', path: 'Users/kyle/web', item: 'folder' },
      { kind: 'deleted', path: 'Users/kyle/api', item: 'folder', inside: 2 },
      { kind: 'location', tab: 1, from: 'Users/kyle', to: 'Users/kyle/web' },
    ]);
  });

  it('sees no change from a look', () => {
    const { shell, machine } = shellLaptop();
    const before = snapshotMachine(machine);
    shell.run('Get-ChildItem -Recurse; Get-Location; Get-ChildItem Env:');

    expect(diffSnapshots(before, snapshotMachine(machine))).toEqual([]);
  });
});
