import { describe, expect, it } from 'vitest';
import { windows } from '../../engine/fixtures';
import { gitQueries } from '../../engine/git/queries';
import { testDeps } from '../../engine/git/testDeps';
import { snapshotMachine } from '../../engine/machine/snapshot';
import { DriverError, type DriverAction } from '../../engine/shell/driver';
import { Shell } from '../../engine/shell/shell';
import type { Workspace } from '../../engine/workspace';
import { replay } from '../agent/replay';
import { hud } from '../hud';
import type { Predicate } from '../missions/predicates';
import { createSandbox } from '../missions/sandbox';
import { DISPLAY_ROOT, sandbox } from '../sandbox';
import {
  applyChange,
  currentLog,
  currentQueries,
  currentWorkspace,
  dryRunNow,
  loadSandbox,
  recordAction,
  rewindTo,
} from './sandboxControl';

const API = 'Users/kyle/quillwork/api';

/** A laptop whose API project is committed once. */
const setup = windows({ mount: API })
  .write(`${API}/package.json`, '{}\n')
  .init()
  .stage('package.json')
  .commit('chore: initial api')
  .toSpec();

const load = () => loadSandbox(setup, 'A fresh laptop.', testDeps());

/** The laptop, and git's history by message, which a rewind keeps. */
function laptopOf(ws: Workspace) {
  if (ws.machine === null) throw new Error('Not a laptop');
  const messages = gitQueries(ws)
    .log()
    .map((commit) => commit.message);
  return { machine: snapshotMachine(ws.machine), messages };
}

describe('the live sandbox log', () => {
  it("starts from the setup, then keeps Otto's action exactly as passed, and his transcript", () => {
    load();
    expect(currentLog()).toEqual({ setup, entries: [] });
    const action: DriverAction = { do: 'run', line: 'mkdir notes' };
    expect(recordAction(action).exitCode).toBe(0);
    const [entry] = currentLog().entries;
    expect(entry?.kind === 'action' && entry.action).toBe(action);
    expect(currentQueries().transcript?.printed('Directory: C:\\Users\\kyle')).toBe(true);
  });

  it('leaves out an action the driver refused, because it never happened', () => {
    load();
    const before = currentLog();
    expect(() => recordAction({ do: 'answer', choice: 'Y' })).toThrow(DriverError);
    expect(currentLog()).toBe(before);
  });

  it('replays to exactly the live sandbox, commit ids included', () => {
    load();
    recordAction({ do: 'run', line: 'mkdir C:\\Users\\kyle\\notes' });
    applyChange([
      { op: 'restartTerminals' },
      { op: 'write', path: `${API}/a.md`, content: 'a\n' },
      { op: 'stage', paths: ['a.md'] },
      { op: 'commit', message: 'docs: a' },
    ]);
    recordAction({ do: 'newTerminal' });
    recordAction({ do: 'run', line: 'cd quillwork\\api' });

    const live = currentWorkspace();
    const replayed = replay(currentLog(), testDeps()).shell.ws;
    expect(laptopOf(replayed)).toEqual(laptopOf(live));
    expect(gitQueries(replayed).log()).toEqual(gitQueries(live).log());
  });

  it('tries an action from here without touching the live sandbox or its log', () => {
    load();
    recordAction({ do: 'run', line: 'cd quillwork\\api' });
    const log = currentLog();
    const before = laptopOf(currentWorkspace());
    const guard: Predicate = { kind: 'driveFile', path: `${API}/package.json`, label: 'API' };

    const dry = dryRunNow({ do: 'run', line: 'Remove-Item package.json' }, { guards: [guard] });

    expect(dry.broken).toEqual(['API']);
    expect(laptopOf(currentWorkspace())).toEqual(before);
    expect(currentLog()).toBe(log);
  });

  it("rewinds by swapping in a replay of a checkpoint, Otto's transcript too", () => {
    const first = load();
    const checkpoint = currentLog();
    const atCheckpoint = laptopOf(first);
    recordAction({ do: 'run', line: 'mkdir notes' });
    applyChange([{ op: 'cd', path: API }]);

    const rewound = rewindTo(checkpoint, 'Rewound to the start of the step.');

    expect(rewound).not.toBe(first);
    expect(currentWorkspace()).toBe(rewound);
    expect(laptopOf(rewound)).toEqual(atCheckpoint);
    expect(currentLog()).toBe(checkpoint);
    expect(currentQueries().transcript?.printed('mkdir')).toBe(false);
    expect(hud.get().notice?.text).toBe('Rewound to the start of the step.');
  });

  it("has no log for a sandbox that didn't load through it, and still answers checks", () => {
    sandbox.update({ shell: new Shell(createSandbox(setup, testDeps()), DISPLAY_ROOT) });
    const noLog = 'This sandbox has no log';
    expect(() => currentLog()).toThrow(noLog);
    expect(() => recordAction({ do: 'newTerminal' })).toThrow(noLog);
    expect(currentQueries().transcript).toBeUndefined();
    expect(currentQueries().machine).toBeDefined();
  });
});
