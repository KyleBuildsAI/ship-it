import { describe, expect, it } from 'vitest';
import { testDeps } from '../git/testDeps';
import { Workspace, type EngineEvent } from '../workspace';
import { Machine } from './machine';
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

    expect(first).toMatchObject({ id: 1, pid: 9000, cwd: 'Users/kyle', previousCwd: null });
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

  it('moves a tab and remembers where it was, for cd -', () => {
    const machine = testMachine();
    const tab = machine.openSession();
    const events = recordMachineEvents(machine);
    machine.setLocation(tab.id, 'Users/kyle/quillwork', 'relative');

    expect(tab).toMatchObject({ cwd: 'Users/kyle/quillwork', previousCwd: 'Users/kyle' });
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
    expect(restarted).toMatchObject({ id: 1, cwd: 'Users/kyle', previousCwd: null });
    expect(restarted?.pid).not.toBe(tab.pid);
    expect(restarted?.env.get('DATABASE_URL')).toBeNull();
    expect(restarted?.env.get('EDITOR')).toBe('code');
    expect(events).toEqual([{ type: 'terminalsRestarted' }]);
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
