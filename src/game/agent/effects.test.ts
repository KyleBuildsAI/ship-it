import { describe, expect, it } from 'vitest';
import { windows } from '../../engine/fixtures';
import { testDeps } from '../../engine/git/testDeps';
import { diffSnapshots, snapshotMachine, type MachineChange } from '../../engine/machine/snapshot';
import { display } from '../../engine/machine/winPath';
import { drive, type DriverAction } from '../../engine/shell/driver';
import { Shell } from '../../engine/shell/shell';
import { APPROVAL_MODES, type AgentAction, type ApprovalMode } from '../missions/agentSchema';
import {
  describeChanges,
  isConsequential,
  MAX_EFFECT_LINES,
  weighChange,
  type ChangeWeight,
} from './effects';

const HOME = 'Users/kyle';
const API = 'Users/kyle/quillwork/api';

/** An ordinary line Otto runs, not marked `ask`: only its dry run decides. */
const RUN: AgentAction = { do: 'run', line: 'Get-Location', onDeny: [] };

const deletedFile = (path: string): MachineChange => ({
  kind: 'deleted',
  path,
  item: 'file',
  inside: 0,
});

/** A deleted folder, and how many items were inside it at any depth. */
const deletedFolder = (path: string, inside = 0): MachineChange => ({
  kind: 'deleted',
  path,
  item: 'folder',
  inside,
});

describe('weighChange and isConsequential', () => {
  it.each<{ does: string; change: MachineChange; weight: ChangeWeight }>([
    { does: 'deletes', change: deletedFolder(`${HOME}/notes`), weight: 'destructive' },
    {
      does: 'overwrites a file',
      change: { kind: 'modified', path: `${API}/config.json`, how: 'replaced' },
      weight: 'destructive',
    },
    {
      does: 'moves a file',
      change: {
        kind: 'moved',
        from: `${API}/README.md`,
        to: `${API}/docs/README.md`,
        item: 'file',
        copy: false,
      },
      weight: 'destructive',
    },
    {
      does: 'saves a new variable for new terminals',
      change: { kind: 'env', scope: 'user', tab: null, name: 'QUILL_ENV', change: 'set' },
      weight: 'destructive',
    },
    {
      does: 'makes a folder',
      change: { kind: 'created', path: `${API}/notes`, item: 'folder' },
      weight: 'additive',
    },
    {
      does: 'adds to the end of a file',
      change: { kind: 'modified', path: `${API}/.gitignore`, how: 'appended' },
      weight: 'additive',
    },
    {
      does: 'copies a file',
      change: {
        kind: 'moved',
        from: `${API}/config.json`,
        to: `${API}/config.backup.json`,
        item: 'file',
        copy: true,
      },
      weight: 'additive',
    },
    {
      does: 'sets a variable in one terminal',
      change: { kind: 'env', scope: 'session', tab: 1, name: 'PORT', change: 'set' },
      weight: 'terminal',
    },
    {
      does: 'moves a terminal to another folder',
      change: { kind: 'location', tab: 1, from: HOME, to: API },
      weight: 'terminal',
    },
    {
      does: 'opens a terminal',
      change: { kind: 'terminal', tab: 2, change: 'opened' },
      weight: 'terminal',
    },
  ])('a line that $does weighs $weight', ({ change, weight }) => {
    expect(weighChange(change)).toBe(weight);
    // D6: destructive mode pauses only for what loses something; changes mode also pauses
    // for what adds something; nothing pauses for a terminal's own state.
    const pausesIn: Record<ChangeWeight, readonly ApprovalMode[]> = {
      destructive: ['destructive', 'changes'],
      additive: ['changes'],
      terminal: [],
    };
    for (const mode of APPROVAL_MODES) {
      expect(isConsequential({ action: RUN, changes: [change] }, mode)).toBe(
        pausesIn[weight].includes(mode),
      );
    }
  });

  it("never pauses for a line that changes nothing, unless the content marked it 'ask'", () => {
    const asks: AgentAction = { do: 'run', line: 'Get-Content .env', ask: true, onDeny: [] };
    for (const mode of APPROVAL_MODES) {
      expect(isConsequential({ action: RUN, changes: [] }, mode)).toBe(false);
      expect(isConsequential({ action: asks, changes: [] }, mode)).toBe(true);
    }
  });

  it('pauses when any one of the changes calls for it', () => {
    const changes: MachineChange[] = [
      { kind: 'location', tab: 1, from: HOME, to: API },
      deletedFolder(`${API}/tmp`, 4),
    ];
    expect(isConsequential({ action: RUN, changes }, 'destructive')).toBe(true);
  });

  it("judges Otto's file tool by what it writes, like any line", () => {
    const write: AgentAction = {
      do: 'write',
      path: `${API}/.env`,
      content: 'PORT=3000\n',
      onDeny: [],
    };
    const created: MachineChange = { kind: 'created', path: `${API}/.env`, item: 'file' };
    expect(isConsequential({ action: write, changes: [created] }, 'destructive')).toBe(false);
    expect(isConsequential({ action: write, changes: [created] }, 'changes')).toBe(true);
  });
});

describe('describeChanges', () => {
  it.each<{ change: MachineChange; line: string }>([
    {
      change: { kind: 'created', path: `${HOME}/notes`, item: 'folder' },
      line: 'Makes the folder C:\\Users\\kyle\\notes',
    },
    {
      change: { kind: 'created', path: `${HOME}/todo.md`, item: 'file' },
      line: 'Makes the file C:\\Users\\kyle\\todo.md',
    },
    { change: deletedFile(`${HOME}/todo.md`), line: 'Deletes C:\\Users\\kyle\\todo.md' },
    {
      change: deletedFolder(`${HOME}/notes`),
      line: 'Deletes the empty folder C:\\Users\\kyle\\notes',
    },
    {
      change: deletedFolder(`${API}/web`, 1),
      line: 'Deletes C:\\Users\\kyle\\quillwork\\api\\web and 1 item inside',
    },
    {
      change: deletedFolder(API, 23),
      line: 'Deletes C:\\Users\\kyle\\quillwork\\api and 23 items inside',
    },
    {
      change: { kind: 'modified', path: `${API}/.gitignore`, how: 'appended' },
      line: 'Adds to the end of C:\\Users\\kyle\\quillwork\\api\\.gitignore',
    },
    {
      change: { kind: 'modified', path: `${API}/config.json`, how: 'replaced' },
      line: 'Overwrites C:\\Users\\kyle\\quillwork\\api\\config.json',
    },
    {
      change: {
        kind: 'moved',
        from: `${API}/README.md`,
        to: `${API}/docs/README.md`,
        item: 'file',
        copy: false,
      },
      line: 'Moves C:\\Users\\kyle\\quillwork\\api\\README.md to C:\\Users\\kyle\\quillwork\\api\\docs\\README.md',
    },
    {
      change: {
        kind: 'moved',
        from: `${API}/notes.txt`,
        to: `${API}/todo.txt`,
        item: 'file',
        copy: false,
      },
      line: 'Renames C:\\Users\\kyle\\quillwork\\api\\notes.txt to todo.txt',
    },
    {
      change: {
        kind: 'moved',
        from: `${API}/config.json`,
        to: `${API}/config.backup.json`,
        item: 'file',
        copy: true,
      },
      line: 'Copies C:\\Users\\kyle\\quillwork\\api\\config.json to config.backup.json',
    },
    {
      change: {
        kind: 'moved',
        from: `${API}/docs`,
        to: `${HOME}/docs`,
        item: 'folder',
        copy: true,
      },
      line: 'Copies C:\\Users\\kyle\\quillwork\\api\\docs to C:\\Users\\kyle\\docs',
    },
    {
      change: { kind: 'env', scope: 'session', tab: 2, name: 'PORT', change: 'set' },
      line: 'Sets the variable PORT in PS 2 only',
    },
    {
      change: { kind: 'env', scope: 'session', tab: null, name: 'PORT', change: 'removed' },
      line: 'Removes the variable PORT in this terminal only',
    },
    {
      change: { kind: 'env', scope: 'user', tab: null, name: 'Path', change: 'changed' },
      line: 'Changes the variable Path for your new terminals',
    },
    {
      change: { kind: 'env', scope: 'machine', tab: null, name: 'QUILL_ENV', change: 'set' },
      line: "Sets the variable QUILL_ENV for every user's new terminals",
    },
    {
      change: { kind: 'location', tab: 1, from: HOME, to: API },
      line: 'PS 1 moves to C:\\Users\\kyle\\quillwork\\api',
    },
    { change: { kind: 'terminal', tab: 2, change: 'opened' }, line: 'Opens PS 2' },
    { change: { kind: 'terminal', tab: 1, change: 'closed' }, line: 'Closes PS 1' },
  ])('$line', ({ change, line }) => {
    expect(describeChanges([change], display)).toEqual([line]);
  });

  it('has nothing to say about no changes', () => {
    expect(describeChanges([], display)).toEqual([]);
  });

  it('puts deletes from one folder on one line that counts everything they took', () => {
    const logs = `${API}/logs`;
    const logFiles = ['a.log', 'b.log', 'c.log'].map((name) => deletedFile(`${logs}/${name}`));
    expect(describeChanges(logFiles, display)).toEqual([
      'Deletes 3 files in C:\\Users\\kyle\\quillwork\\api\\logs',
    ]);
    // `Remove-Item .\* -Recurse` in the API: two files, and folders with 7 items between them.
    const wildcard = [
      deletedFile(`${API}/package.json`),
      deletedFolder(`${API}/src`, 3),
      deletedFile(`${API}/server.js`),
      deletedFolder(`${API}/tmp`, 4),
    ];
    expect(describeChanges(wildcard, display)).toEqual([
      'Deletes 11 items in C:\\Users\\kyle\\quillwork\\api',
    ]);
  });

  it('keeps deletes from different folders apart', () => {
    const changes = [deletedFolder(`${HOME}/notes`), deletedFolder(`${API}/notes`)];
    expect(describeChanges(changes, display)).toEqual([
      'Deletes the empty folder C:\\Users\\kyle\\notes',
      'Deletes the empty folder C:\\Users\\kyle\\quillwork\\api\\notes',
    ]);
  });

  it('skips a new folder made only to hold other new items, since their paths show it', () => {
    const changes: MachineChange[] = [
      { kind: 'created', path: `${API}/web`, item: 'folder' },
      { kind: 'created', path: `${API}/web/notes`, item: 'folder' },
      { kind: 'created', path: `${API}/webby`, item: 'folder' },
    ];
    expect(describeChanges(changes, display)).toEqual([
      'Makes the folder C:\\Users\\kyle\\quillwork\\api\\web\\notes',
      'Makes the folder C:\\Users\\kyle\\quillwork\\api\\webby',
    ]);
  });

  it('lists the riskiest first, so a cut list only drops the mildest', () => {
    const changes: MachineChange[] = [
      { kind: 'location', tab: 1, from: HOME, to: API },
      { kind: 'created', path: `${API}/notes`, item: 'folder' },
      deletedFolder(`${HOME}/notes`),
    ];
    expect(describeChanges(changes, display)).toEqual([
      'Deletes the empty folder C:\\Users\\kyle\\notes',
      'Makes the folder C:\\Users\\kyle\\quillwork\\api\\notes',
      'PS 1 moves to C:\\Users\\kyle\\quillwork\\api',
    ]);
  });

  it(`shows at most ${String(MAX_EFFECT_LINES)} lines, counting the rest on the last`, () => {
    const changes: MachineChange[] = [
      { kind: 'terminal', tab: 2, change: 'opened' },
      { kind: 'created', path: `${API}/notes`, item: 'folder' },
      deletedFolder(`${HOME}/notes`),
      { kind: 'modified', path: `${API}/config.json`, how: 'replaced' },
    ];
    expect(describeChanges(changes, display)).toEqual([
      'Deletes the empty folder C:\\Users\\kyle\\notes',
      'Overwrites C:\\Users\\kyle\\quillwork\\api\\config.json',
      'And 2 more changes',
    ]);
  });
});

describe('effects of a dry run on a real laptop', () => {
  /** A small laptop: one terminal at home, the API project, and an old folder with a file. */
  function laptop() {
    const ws = windows()
      .write(`${API}/package.json`, '{}\n')
      .write(`${HOME}/old/notes.txt`, 'week 1\n')
      .build(testDeps());
    const machine = ws.machine;
    if (machine === null) throw new Error('Not a laptop');
    return { machine, shell: new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app') };
  }

  /**
   * Plays `setup` on the laptop, then returns what `action` alone changed: the same
   * snapshots and diff a dry run takes.
   */
  function changesOf(action: DriverAction, setup: readonly DriverAction[] = []): MachineChange[] {
    const { machine, shell } = laptop();
    for (const step of setup) drive(shell, step);
    const before = snapshotMachine(machine);
    const step = drive(shell, action);
    return diffSnapshots(before, snapshotMachine(machine), step.events);
  }

  it('lets a bare mkdir through in destructive mode, and says where it really lands', () => {
    const changes = changesOf({ do: 'run', line: 'mkdir notes' });
    expect(describeChanges(changes, display)).toEqual(['Makes the folder C:\\Users\\kyle\\notes']);
    const action: AgentAction = { do: 'run', line: 'mkdir notes', onDeny: [] };
    expect(isConsequential({ action, changes }, 'destructive')).toBe(false);
    expect(isConsequential({ action, changes }, 'changes')).toBe(true);
  });

  it("pauses on Otto's answer to PowerShell's Confirm question when it deletes", () => {
    const changes = changesOf({ do: 'answer', choice: 'A' }, [
      { do: 'run', line: 'Remove-Item ~\\old' },
    ]);
    expect(describeChanges(changes, display)).toEqual([
      'Deletes C:\\Users\\kyle\\old and 1 item inside',
    ]);
    const action: AgentAction = { do: 'run', line: 'Remove-Item ~\\old', answer: 'A', onDeny: [] };
    expect(isConsequential({ action, changes }, 'destructive')).toBe(true);
  });

  it('names the file the file tool writes, not each new folder it makes on the way', () => {
    const changes = changesOf({ do: 'write', path: `${HOME}/web/notes/todo.md`, content: 'x' });
    expect(describeChanges(changes, display)).toEqual([
      'Makes the file C:\\Users\\kyle\\web\\notes\\todo.md',
    ]);
  });

  it("shows a saved variable's name and never its value", () => {
    const { machine } = laptop();
    const before = snapshotMachine(machine);
    machine.setEnv('user', 'QUILL_API_KEY', 'dev-key-for-the-game');
    const lines = describeChanges(diffSnapshots(before, snapshotMachine(machine)), display);
    expect(lines).toEqual(['Sets the variable QUILL_API_KEY for your new terminals']);
    expect(lines.join(' ')).not.toContain('dev-key');
  });
});
