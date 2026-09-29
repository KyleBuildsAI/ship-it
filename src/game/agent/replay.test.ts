import { describe, expect, it } from 'vitest';
import { repo, windows } from '../../engine/fixtures';
import { gitQueries } from '../../engine/git/queries';
import { testDeps } from '../../engine/git/testDeps';
import { snapshotMachine } from '../../engine/machine/snapshot';
import { DriverError, type DriverAction } from '../../engine/shell/driver';
import { Shell } from '../../engine/shell/shell';
import {
  AgentActionSchema,
  BaseActionSchema,
  type AgentAction,
  type BaseAction,
} from '../missions/agentSchema';
import { applySteps, createSandbox } from '../missions/sandbox';
import { DISPLAY_ROOT } from '../sandbox';
import { playAction, replay, startLog, withEntry, type LogEntry } from './replay';
import type { TranscriptEntry } from './transcript';

const HOME = 'Users/kyle';
const API = 'Users/kyle/quillwork/api';

/** The API project, committed once, and an old notes folder at home with a file in it. */
const setup = windows({ mount: API })
  .write(`${API}/package.json`, '{}\n')
  .init()
  .stage('package.json')
  .commit('chore: initial api')
  .write(`${HOME}/old/notes.txt`, 'week 1\n')
  .toSpec();

const run = (line: string): LogEntry => ({ kind: 'action', action: { do: 'run', line } });

/** Everything a replay must get right: the laptop, the prompt, the history and git. */
function stateOf(shell: Shell) {
  const machine = shell.ws.machine;
  return {
    laptop: machine === null ? null : snapshotMachine(machine),
    prompt: shell.prompt(),
    history: [...shell.history],
    commits: gitQueries(shell.ws)
      .log()
      .map((commit) => commit.id),
  };
}

/** Plays one entry into a sandbox that is already running, as live play does. */
function playLive(shell: Shell, transcript: TranscriptEntry[], entry: LogEntry): void {
  if (entry.kind === 'steps') applySteps(shell.ws, entry.steps);
  else playAction(shell, transcript, entry.action);
}

describe('replay', () => {
  it('rebuilds the live sandbox at every point, questions, answers and commits included', () => {
    const entries: LogEntry[] = [
      run('cd quillwork\\api'),
      run('mkdir notes'),
      // old has a file inside, so PowerShell asks before deleting it.
      run('Remove-Item C:\\Users\\kyle\\old'),
      { kind: 'action', action: { do: 'answer', choice: 'A' } },
      { kind: 'steps', steps: [{ op: 'restartTerminals' }] },
      { kind: 'action', action: { do: 'write', path: `${API}/notes/today.md`, content: '# Hi\n' } },
      {
        kind: 'steps',
        steps: [
          { op: 'stage', paths: ['notes/today.md'] },
          { op: 'commit', message: 'docs: today' },
        ],
      },
      { kind: 'action', action: { do: 'newTerminal' } },
      run('cd C:\\Users\\kyle\\quillwork'),
      { kind: 'action', action: { do: 'useTerminal', tab: 1 } },
    ];
    const live = new Shell(createSandbox(setup, testDeps()), DISPLAY_ROOT);
    const transcript: TranscriptEntry[] = [];
    let log = startLog(setup);
    for (const entry of entries) {
      playLive(live, transcript, entry);
      log = withEntry(log, entry);
      const replayed = replay(log, testDeps());
      expect(stateOf(replayed.shell)).toEqual(stateOf(live));
      expect(replayed.transcript).toEqual(transcript);
    }
    // Proof the run did what it says: nothing failed, old is gone, and Otto's file is committed.
    expect(transcript.map((entry) => entry.exitCode)).toEqual(transcript.map(() => 0));
    expect(stateOf(live).laptop?.items.has(`${HOME}/old`)).toBe(false);
    expect(stateOf(live).commits).toHaveLength(2);
  });

  it('replays an Act 2 sandbox, where Otto commits through git', () => {
    const act2 = repo().commit('init', { 'app.ts': 'v1\n' }).toSpec();
    const live = new Shell(createSandbox(act2, testDeps()), DISPLAY_ROOT);
    const transcript: TranscriptEntry[] = [];
    let log = startLog(act2);
    const entries: LogEntry[] = [
      { kind: 'action', action: { do: 'write', path: 'app.ts', content: 'v2\n' } },
      run('git commit -am "feat: v2"'),
    ];
    for (const entry of entries) {
      playLive(live, transcript, entry);
      log = withEntry(log, entry);
    }
    expect(stateOf(replay(log, testDeps()).shell)).toEqual(stateOf(live));
    expect(stateOf(live).commits).toHaveLength(2);
  });

  it('refuses a log where a line comes while a question is still open', () => {
    const log = startLog(setup, [
      { do: 'run', line: 'Remove-Item C:\\Users\\kyle\\old' },
      { do: 'run', line: 'Get-Location' },
    ]);
    expect(() => replay(log, testDeps())).toThrow(DriverError);
  });
});

describe("the content's actions", () => {
  // These compile only if every action a plan, a deny branch or a drill can hold is one
  // drive() takes. So content goes to the driver, and into the log, exactly as written.
  const fromBase = (action: BaseAction): DriverAction => action;
  const fromScript = (action: AgentAction): DriverAction => action;

  it("go to the driver and into a log as written, with Otto's words kept for the screen", () => {
    const script = AgentActionSchema.parse({ do: 'run', line: 'mkdir notes', say: 'Notes.' });
    const deny = BaseActionSchema.parse({ do: 'newTerminal', say: 'A fresh terminal.' });
    const log = startLog(setup, [fromScript(script), fromBase(deny)]);
    expect(log.entries).toEqual([
      { kind: 'action', action: script },
      { kind: 'action', action: deny },
    ]);
    const { shell } = replay(log, testDeps());
    expect(shell.ws.machine?.drive.isDir(`${HOME}/notes`)).toBe(true);
    expect(shell.ws.machine?.sessions()).toHaveLength(2);
  });
});
