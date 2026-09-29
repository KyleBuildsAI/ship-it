import { describe, expect, it } from 'vitest';
import { testDeps } from '../git/testDeps';
import { Workspace, type EngineEvent } from '../workspace';
import { LOCATION_HISTORY_LIMIT, Machine } from './machine';
import { recordMachineEvents, testMachine } from './testDeps';

describe('Machine', () => {
  it('starts with a home folder and no terminal open', () => {
    const machine = testMachine();

    expect(machine.home).toBe('Users/kyle');
    expect(machine.drive.isDir('Users/kyle')).toBe(true);
    expect(machine.sessions()).toEqual([]);
    expect(() => machine.active()).toThrow('No terminal is open.');
  });

  it('opens a tab at home with its own process id', () => {
    const machine = testMachine();
    const events = recordMachineEvents(machine);
    const first = machine.openSession();
    const second = machine.openSession();

    expect(first).toMatchObject({ id: 1, pid: 9000, cwd: 'Users/kyle', back: [], forward: [] });
    expect(second).toMatchObject({ id: 2, pid: 9004 });
    expect(machine.active()).toBe(second);
    expect(events).toEqual([
      { type: 'sessionOpened', session: 1 },
      { type: 'sessionOpened', session: 2 },
    ]);
  });

  it("builds a new tab's Path from the saved Machine Path, then the User Path", () => {
    const env = testMachine().newTerminalEnv();

    expect(env.get('Path')).toBe(
      'C:\\Windows\\system32;C:\\Windows;C:\\Program Files\\PowerShell\\7\\;' +
        'C:\\Users\\kyle\\AppData\\Local\\Microsoft\\WindowsApps',
    );
  });

  it('gives a new tab the sign-in variables, then Machine, then User values on top', () => {
    const machine = new Machine({
      user: 'priya',
      computer: 'QUILL-LT-12',
      saved: { machine: { LOG_LEVEL: 'warn', OS: 'Windows_NT' }, user: { LOG_LEVEL: 'debug' } },
    });
    const env = machine.newTerminalEnv();

    expect(env.get('USERNAME')).toBe('priya');
    expect(env.get('USERPROFILE')).toBe('C:\\Users\\priya');
    expect(env.get('HOMEPATH')).toBe('\\Users\\priya');
    expect(env.get('LOCALAPPDATA')).toBe('C:\\Users\\priya\\AppData\\Local');
    expect(env.get('COMPUTERNAME')).toBe('QUILL-LT-12');
    expect(env.get('OS')).toBe('Windows_NT');
    expect(env.get('LOG_LEVEL')).toBe('debug');
    expect(env.has('Path')).toBe(false);
  });

  it('expands the Machine scope before any User variable exists, as Windows does', () => {
    const machine = new Machine({
      user: 'kyle',
      computer: 'QUILL-LT-7',
      saved: { machine: { Path: 'C:\\%TOOLS%\\bin' }, user: { TOOLS: 'tools' } },
    });

    expect(machine.newTerminalEnv().get('Path')).toBe('C:\\%TOOLS%\\bin');
  });

  it('sets plain values before expanding the others, whatever their names', () => {
    const machine = new Machine({
      user: 'kyle',
      computer: 'QUILL-LT-7',
      saved: { user: { A_HOME: '%Z_ROOT%\\a', Z_ROOT: 'C:\\z' } },
    });

    expect(machine.newTerminalEnv().get('A_HOME')).toBe('C:\\z\\a');
  });

  it("never expands a value saved as plain text, like SetEnvironmentVariable's", () => {
    const machine = testMachine();
    machine.setEnv('user', 'Path', '%USERPROFILE%\\bin');

    // The real trap: a tool rewrote the User Path as plain text, and %USERPROFILE% broke.
    expect(machine.newTerminalEnv().get('Path')).toContain(';%USERPROFILE%\\bin');
    machine.setEnv('user', 'Path', '%USERPROFILE%\\bin', { expand: true });
    expect(machine.newTerminalEnv().get('Path')).toContain(';C:\\Users\\kyle\\bin');
  });

  it('keeps a tab on the variables it copied when it opened', () => {
    const machine = testMachine();
    const old = machine.openSession();
    machine.setEnv('user', 'QUILLWORK_ENV', 'dev');

    expect(old.env.get('QUILLWORK_ENV')).toBeNull();
    expect(machine.newTerminalEnv().get('QUILLWORK_ENV')).toBe('dev');
    expect(machine.openSession().env.get('QUILLWORK_ENV')).toBe('dev');
  });

  it("sets a tab's variables without touching other tabs or the saved ones", () => {
    const machine = testMachine();
    const first = machine.openSession();
    const second = machine.openSession();
    const events = recordMachineEvents(machine);
    machine.setEnv('session', 'PORT', '4000', { session: first.id });

    expect(first.env.get('PORT')).toBe('4000');
    expect(second.env.get('PORT')).toBeNull();
    expect(machine.saved.user.get('PORT')).toBeNull();
    expect(events).toEqual([
      { type: 'envChanged', scope: 'session', session: 1, name: 'PORT', change: 'set' },
    ]);
  });

  it('sets the active tab by default, and removes with null or an empty value', () => {
    const machine = testMachine();
    const tab = machine.openSession();
    const events = recordMachineEvents(machine);
    machine.setEnv('session', 'FEATURE_X', 'on');
    machine.setEnv('session', 'FEATURE_X', '');
    expect(tab.env.get('FEATURE_X')).toBeNull();
    machine.setEnv('session', 'FEATURE_X', 'on');
    machine.setEnv('session', 'FEATURE_X', null);
    expect(tab.env.get('FEATURE_X')).toBeNull();
    // Removing what's already gone changes nothing, so it announces nothing.
    machine.setEnv('session', 'FEATURE_X', null);

    expect(events.map((event) => event.type === 'envChanged' && event.change)).toEqual([
      'set',
      'removed',
      'set',
      'removed',
    ]);
  });

  it('announces names, never values', () => {
    const machine = testMachine();
    machine.openSession();
    const events = recordMachineEvents(machine);
    machine.setEnv('session', 'API_KEY', 'sk-super-secret');

    expect(JSON.stringify(events)).not.toContain('sk-super-secret');
  });

  it('refuses Machine-scope changes to a player who is not an administrator', () => {
    const machine = testMachine();
    const events = recordMachineEvents(machine);

    expect(machine.setEnv('machine', 'Path', 'C:\\evil')).toBe('denied');
    expect(machine.saved.machine.get('Path')).toContain('system32');
    expect(events).toEqual([]);
    expect(machine.setEnv('machine', 'JAVA_HOME', 'C:\\jdk', { admin: true })).toBe('ok');
    expect(machine.saved.machine.get('JAVA_HOME')).toBe('C:\\jdk');
  });

  it('moves a tab and announces the route it took', () => {
    const machine = testMachine();
    const tab = machine.openSession();
    const events = recordMachineEvents(machine);
    machine.setLocation(tab.id, 'Users/kyle/quillwork', 'relative');

    expect(tab.cwd).toBe('Users/kyle/quillwork');
    expect(events).toEqual([
      {
        type: 'cwdChanged',
        session: 1,
        from: 'Users/kyle',
        to: 'Users/kyle/quillwork',
        via: 'relative',
      },
    ]);
  });

  it('steps back and forward through the history, as PowerShell 7 does with cd - and cd +', () => {
    const machine = testMachine();
    machine.drive.makeDir('A');
    machine.drive.makeDir('B');
    const tab = machine.openSession();
    machine.setLocation(tab.id, 'A', 'absolute');
    machine.setLocation(tab.id, 'B', 'absolute');
    const events = recordMachineEvents(machine);

    expect(machine.goBack(tab.id)).toBe('moved');
    expect(tab.cwd).toBe('A');
    // A second cd - keeps going back (bash would toggle to B instead).
    expect(machine.goBack(tab.id)).toBe('moved');
    expect(tab.cwd).toBe('Users/kyle');
    expect(machine.goBack(tab.id)).toBe('empty');
    expect(machine.goForward(tab.id)).toBe('moved');
    expect(tab.cwd).toBe('A');
    expect(events.map((event) => event.type === 'cwdChanged' && event.via)).toEqual([
      'back',
      'back',
      'forward',
    ]);
  });

  it('reports a folder deleted since, and uses up that step, as PowerShell does', () => {
    const machine = testMachine();
    machine.drive.makeDir('A');
    machine.drive.makeDir('B');
    const tab = machine.openSession();
    machine.setLocation(tab.id, 'A', 'absolute');
    machine.setLocation(tab.id, 'B', 'absolute');
    machine.drive.removeDir('A', { recursive: true });

    expect(machine.goBack(tab.id)).toEqual({ missing: 'A' });
    expect(tab.cwd).toBe('B');
    expect(machine.goBack(tab.id)).toBe('moved');
    expect(tab.cwd).toBe('Users/kyle');
    expect(machine.goForward(tab.id)).toBe('moved');
    expect(tab.cwd).toBe('B');
  });

  it('forgets the way forward after a new move', () => {
    const machine = testMachine();
    machine.drive.makeDir('A');
    machine.drive.makeDir('B');
    const tab = machine.openSession();
    machine.setLocation(tab.id, 'A', 'absolute');
    machine.goBack(tab.id);
    machine.setLocation(tab.id, 'C', 'absolute');

    expect(machine.goForward(tab.id)).toBe('empty');
    expect(tab.cwd).toBe('C');
  });

  it('remembers at most 20 folders back', () => {
    const machine = testMachine();
    const tab = machine.openSession();
    for (let step = 1; step <= 25; step++)
      machine.setLocation(tab.id, `F${String(step)}`, 'absolute');

    expect(tab.back).toHaveLength(LOCATION_HISTORY_LIMIT);
    expect(tab.back[0]).toBe('F5');
  });

  it('closes tabs, handing the keyboard to the most recent one left', () => {
    const machine = testMachine();
    machine.openSession();
    machine.openSession();
    machine.openSession();
    machine.activate(2);
    const events = recordMachineEvents(machine);
    machine.closeSession(2);

    expect(machine.sessions().map((tab) => tab.id)).toEqual([1, 3]);
    expect(machine.active().id).toBe(3);
    expect(events).toEqual([
      { type: 'sessionClosed', session: 2 },
      { type: 'sessionActivated', session: 3 },
    ]);
  });

  it('has already moved the keyboard when it announces a closed tab', () => {
    const machine = testMachine();
    machine.openSession();
    machine.openSession();
    let activeWhenClosed = 0;
    machine.events.on((event) => {
      if (event.type === 'sessionClosed') activeWhenClosed = machine.active().id;
    });
    machine.closeSession(2);

    expect(activeWhenClosed).toBe(1);
  });

  it('closing a background tab leaves the active one alone', () => {
    const machine = testMachine();
    machine.openSession();
    machine.openSession();
    machine.closeSession(1);

    expect(machine.active().id).toBe(2);
  });

  it('has no active tab once the last one closes', () => {
    const machine = testMachine();
    machine.closeSession(machine.openSession().id);

    expect(() => machine.active()).toThrow('No terminal is open.');
  });

  it('switching to the tab already active changes nothing', () => {
    const machine = testMachine();
    machine.openSession();
    const events = recordMachineEvents(machine);
    machine.activate(1);

    expect(events).toEqual([]);
  });

  it('refuses a tab that is not open', () => {
    const machine = testMachine();

    expect(() => {
      machine.activate(4);
    }).toThrow('No terminal tab 4 is open.');
    expect(() => {
      machine.closeSession(4);
    }).toThrow('No terminal tab 4 is open.');
  });

  it('restarts every tab: same numbers, new processes, home again, fresh variables', () => {
    const machine = testMachine();
    const tab = machine.openSession();
    machine.setEnv('session', 'DATABASE_URL', 'postgres://localhost/dev');
    machine.setLocation(tab.id, 'Users/kyle/quillwork', 'relative');
    machine.setEnv('user', 'EDITOR', 'code');
    const events = recordMachineEvents(machine);
    machine.restartTerminals();

    const [restarted] = machine.sessions();
    expect(restarted).toMatchObject({ id: 1, cwd: 'Users/kyle', back: [], forward: [] });
    expect(restarted?.pid).not.toBe(tab.pid);
    expect(restarted?.env.get('DATABASE_URL')).toBeNull();
    expect(restarted?.env.get('EDITOR')).toBe('code');
    expect(events).toEqual([{ type: 'terminalsRestarted' }]);
  });
});

describe('folders', () => {
  it('announces each new folder, outermost first, spelled as stored', () => {
    const machine = testMachine();
    machine.drive.makeDir('Users/kyle/Projects');
    const events = recordMachineEvents(machine);

    expect(machine.makeFolder('users/kyle/projects/api/src')).toBe('Users/kyle/Projects/api/src');
    expect(events).toEqual([
      { type: 'folderChanged', path: 'Users/kyle/Projects/api', change: 'created' },
      { type: 'folderChanged', path: 'Users/kyle/Projects/api/src', change: 'created' },
    ]);
  });

  it('stays quiet about a folder that was already there', () => {
    const machine = testMachine();
    const events = recordMachineEvents(machine);

    expect(machine.makeFolder('USERS/KYLE')).toBe('Users/kyle');
    expect(events).toEqual([]);
  });

  it('removes an empty folder and announces it, but never a full one', () => {
    const machine = testMachine();
    machine.drive.writeFile('Users/kyle/old/notes.txt', 'x');
    machine.drive.makeDir('Users/kyle/empty');
    const events = recordMachineEvents(machine);

    machine.removeFolder('users/kyle/EMPTY');
    expect(machine.drive.exists('Users/kyle/empty')).toBe(false);
    expect(() => {
      machine.removeFolder('Users/kyle/old');
    }).toThrow('ENOTEMPTY');
    expect(machine.drive.isFile('Users/kyle/old/notes.txt')).toBe(true);
    expect(events).toEqual([
      { type: 'folderChanged', path: 'Users/kyle/empty', change: 'deleted' },
    ]);
  });
});

describe('a workspace with a machine', () => {
  it("passes the machine's events along with git's on one stream", () => {
    const machine = testMachine();
    const ws = new Workspace(testDeps(), { machine });
    const events: EngineEvent[] = [];
    ws.events.on((event) => events.push(event));
    machine.openSession();

    expect(ws.machine).toBe(machine);
    expect(events).toEqual([{ type: 'sessionOpened', session: 1 }]);
  });

  it('has no machine in an Act 2 sandbox', () => {
    expect(new Workspace(testDeps()).machine).toBeNull();
  });
});
