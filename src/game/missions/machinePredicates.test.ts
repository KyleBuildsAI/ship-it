import { describe, expect, it } from 'vitest';
import { windows } from '../../engine/fixtures';
import { testDeps } from '../../engine/git/testDeps';
import { machineQueries, type MachineQueries } from '../../engine/machine/queries';
import { display } from '../../engine/machine/winPath';
import {
  describeMachine,
  evaluateMachine,
  isMachinePredicate,
  PredicateContextError,
  requireMachine,
  type MachinePredicate,
} from './machinePredicates';

const HOME = 'Users/kyle';
const API = 'Users/kyle/quillwork/api';

/**
 * Kyle's laptop mid-mission: PS 1 opened at home before QUILL_ENV was saved, so it never
 * copied it. PS 2 opened after, walked into the API, and set PORT for itself. PS 2 is
 * active.
 */
function laptop() {
  const ws = windows()
    .mkdir(API)
    .write(`${API}/package.json`, '{ "name": "api" }\n')
    .session()
    .env('user', 'QUILL_ENV', 'dev')
    .session()
    .cd(API)
    .env('session', 'PORT', '4000')
    .build(testDeps());
  if (ws.machine === null) throw new Error('windows() should build a laptop.');
  return { machine: ws.machine, q: machineQueries(ws.machine) };
}

const holds = (q: MachineQueries, predicate: MachinePredicate) => evaluateMachine(predicate, q);

describe('currentDirectory', () => {
  it('checks the active tab unless a tab is named, in any case', () => {
    const { machine, q } = laptop();
    expect(holds(q, { kind: 'currentDirectory', path: API })).toBe(true);
    expect(holds(q, { kind: 'currentDirectory', path: 'users/KYLE/quillwork/API' })).toBe(true);
    expect(holds(q, { kind: 'currentDirectory', path: HOME })).toBe(false);
    machine.activate(1);
    expect(holds(q, { kind: 'currentDirectory', path: HOME })).toBe(true);
  });

  it('checks one tab by its number, and a tab that is not open stands nowhere', () => {
    const { q } = laptop();
    expect(holds(q, { kind: 'currentDirectory', path: HOME, tab: 1 })).toBe(true);
    expect(holds(q, { kind: 'currentDirectory', path: API, tab: 1 })).toBe(false);
    expect(holds(q, { kind: 'currentDirectory', path: API, tab: 2 })).toBe(true);
    expect(holds(q, { kind: 'currentDirectory', path: HOME, tab: 3 })).toBe(false);
  });

  it("with 'any', passes when at least one open tab stands there", () => {
    const { q } = laptop();
    expect(holds(q, { kind: 'currentDirectory', path: HOME, tab: 'any' })).toBe(true);
    expect(holds(q, { kind: 'currentDirectory', path: API, tab: 'any' })).toBe(true);
    expect(holds(q, { kind: 'currentDirectory', path: `${HOME}/Documents`, tab: 'any' })).toBe(
      false,
    );
  });
});

describe('driveFolder', () => {
  it('finds a folder in any case, and exists: false wants it gone', () => {
    const { q } = laptop();
    expect(holds(q, { kind: 'driveFolder', path: 'users/kyle/QUILLWORK/api' })).toBe(true);
    expect(holds(q, { kind: 'driveFolder', path: API, exists: false })).toBe(false);
    expect(holds(q, { kind: 'driveFolder', path: `${HOME}/notes` })).toBe(false);
    expect(holds(q, { kind: 'driveFolder', path: `${HOME}/notes`, exists: false })).toBe(true);
  });

  it('never counts a file as a folder', () => {
    const { q } = laptop();
    const file = `${API}/package.json`;
    expect(holds(q, { kind: 'driveFolder', path: file })).toBe(false);
    expect(holds(q, { kind: 'driveFolder', path: file, exists: false })).toBe(true);
  });
});

describe('driveFile', () => {
  const file = `${API}/package.json`;

  it('finds a file in any case and checks its text', () => {
    const { q } = laptop();
    expect(holds(q, { kind: 'driveFile', path: file.toUpperCase() })).toBe(true);
    expect(holds(q, { kind: 'driveFile', path: file, equals: '{ "name": "api" }\n' })).toBe(true);
    expect(holds(q, { kind: 'driveFile', path: file, equals: '{ "name": "api" }' })).toBe(false);
    expect(holds(q, { kind: 'driveFile', path: file, contains: '"api"' })).toBe(true);
    expect(holds(q, { kind: 'driveFile', path: file, contains: '"web"' })).toBe(false);
    expect(holds(q, { kind: 'driveFile', path: file, pattern: 'NAME', flags: 'i' })).toBe(true);
    expect(holds(q, { kind: 'driveFile', path: file, pattern: 'NAME' })).toBe(false);
  });

  it('with exists: false, passes only when no file is there', () => {
    const { q } = laptop();
    expect(holds(q, { kind: 'driveFile', path: file, exists: false })).toBe(false);
    expect(holds(q, { kind: 'driveFile', path: `${API}/.env`, exists: false })).toBe(true);
    expect(holds(q, { kind: 'driveFile', path: `${API}/.env` })).toBe(false);
    // A folder is not a file, whichever way the check asks.
    expect(holds(q, { kind: 'driveFile', path: API })).toBe(false);
    expect(holds(q, { kind: 'driveFile', path: API, exists: false })).toBe(true);
  });
});

describe('envVar', () => {
  it('reads the active tab by default, with names in any case', () => {
    const { q } = laptop();
    expect(holds(q, { kind: 'envVar', name: 'port', equals: '4000' })).toBe(true);
    expect(holds(q, { kind: 'envVar', name: 'PORT', equals: '40' })).toBe(false);
    expect(holds(q, { kind: 'envVar', name: 'PORT', contains: '40' })).toBe(true);
    expect(holds(q, { kind: 'envVar', name: 'PORT', exists: false })).toBe(false);
    expect(holds(q, { kind: 'envVar', name: 'DEBUG' })).toBe(false);
    expect(holds(q, { kind: 'envVar', name: 'DEBUG', exists: false })).toBe(true);
  });

  it('reads each saved scope, and what a new terminal would copy', () => {
    const { q } = laptop();
    const allTrue: MachinePredicate[] = [
      { kind: 'envVar', name: 'QUILL_ENV', scope: 'user', equals: 'dev' },
      { kind: 'envVar', name: 'QUILL_ENV', scope: 'machine', exists: false },
      { kind: 'envVar', name: 'OS', scope: 'machine', equals: 'Windows_NT' },
      { kind: 'envVar', name: 'QUILL_ENV', scope: 'newTerminal' },
      // PORT lives only in PS 2, so a terminal opened now wouldn't have it.
      { kind: 'envVar', name: 'PORT', scope: 'newTerminal', exists: false },
    ];
    for (const check of allTrue) expect(holds(q, check)).toBe(true);
  });

  it('sees that a tab opened before a saved change never got it', () => {
    const { machine, q } = laptop();
    machine.activate(1);
    expect(holds(q, { kind: 'envVar', name: 'QUILL_ENV', exists: false })).toBe(true);
    expect(holds(q, { kind: 'envVar', name: 'QUILL_ENV', scope: 'newTerminal' })).toBe(true);
  });
});

describe('with every terminal closed', () => {
  it('answers no instead of throwing, since there is no active tab to ask', () => {
    const { machine, q } = laptop();
    machine.closeSession(1);
    machine.closeSession(2);
    expect(holds(q, { kind: 'currentDirectory', path: HOME })).toBe(false);
    expect(holds(q, { kind: 'currentDirectory', path: HOME, tab: 'any' })).toBe(false);
    expect(holds(q, { kind: 'envVar', name: 'PORT', exists: false })).toBe(true);
    // Saved variables don't need a terminal.
    expect(holds(q, { kind: 'envVar', name: 'QUILL_ENV', scope: 'user' })).toBe(true);
  });
});

describe('isMachinePredicate and requireMachine', () => {
  it('tells laptop checks from git checks', () => {
    for (const kind of ['currentDirectory', 'driveFolder', 'driveFile', 'envVar']) {
      expect(isMachinePredicate({ kind })).toBe(true);
    }
    for (const kind of ['clean', 'workingFile', 'all', 'toString']) {
      expect(isMachinePredicate({ kind })).toBe(false);
    }
  });

  it('refuses to grade a laptop check without a laptop', () => {
    const { q } = laptop();
    expect(requireMachine(q)).toBe(q);
    expect(() => requireMachine(undefined)).toThrow(PredicateContextError);
    expect(() => requireMachine(undefined)).toThrow('This check needs a laptop sandbox.');
  });
});

describe('describeMachine', () => {
  // Short paths keep the table readable: display() turns 'api' into C:\api.
  const cases: [MachinePredicate, string][] = [
    [{ kind: 'currentDirectory', path: 'api' }, 'The active terminal is in C:\\api'],
    [{ kind: 'currentDirectory', path: 'api', tab: 2 }, 'Terminal PS 2 is in C:\\api'],
    [{ kind: 'currentDirectory', path: 'api', tab: 'any' }, 'At least one terminal is in C:\\api'],
    [{ kind: 'driveFolder', path: 'Users/kyle/notes' }, 'Folder C:\\Users\\kyle\\notes exists'],
    [{ kind: 'driveFolder', path: 'notes', exists: false }, 'Folder C:\\notes does not exist'],
    [{ kind: 'driveFile', path: 'a.txt' }, 'File C:\\a.txt exists'],
    [{ kind: 'driveFile', path: 'a.txt', exists: false }, 'File C:\\a.txt does not exist'],
    [{ kind: 'driveFile', path: 'a.txt', equals: 'x' }, 'File C:\\a.txt has the expected content'],
    [{ kind: 'driveFile', path: 'a.txt', contains: 'x' }, 'File C:\\a.txt has the expected text'],
    [{ kind: 'driveFile', path: 'a.txt', pattern: '^x' }, 'File C:\\a.txt has the expected text'],
    [{ kind: 'envVar', name: 'PORT' }, 'PORT is set in the active terminal'],
    [
      { kind: 'envVar', name: 'PORT', exists: false, scope: 'newTerminal' },
      'PORT is not set in a new terminal',
    ],
    [
      { kind: 'envVar', name: 'PORT', scope: 'user', equals: '4000' },
      'PORT is set in your saved user variables, with the expected value',
    ],
    [
      { kind: 'envVar', name: 'Path', scope: 'machine', contains: 'node' },
      'Path is set in the saved system variables, with the expected text',
    ],
  ];

  it.each(cases)('describes %j', (predicate, text) => {
    expect(describeMachine(predicate, display)).toBe(text);
  });

  it('never prints the value or text a check expects, which could be a secret', () => {
    const secret = 'not-a-real-key-7f3a';
    const checks: MachinePredicate[] = [
      { kind: 'envVar', name: 'QUILL_API_KEY', equals: secret },
      { kind: 'envVar', name: 'QUILL_API_KEY', scope: 'user', contains: secret },
      { kind: 'driveFile', path: `${API}/.env`, equals: secret },
      { kind: 'driveFile', path: `${API}/.env`, contains: secret },
      { kind: 'driveFile', path: `${API}/.env`, pattern: secret },
    ];
    for (const check of checks) expect(describeMachine(check, display)).not.toContain(secret);
  });
});
