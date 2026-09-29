import { describe, expect, it } from 'vitest';
import { repo, windows } from '../../engine/fixtures';
import { gitQueries } from '../../engine/git/queries';
import { testDeps } from '../../engine/git/testDeps';
import { snapshotMachine } from '../../engine/machine/snapshot';
import { DriverError } from '../../engine/shell/driver';
import { Shell } from '../../engine/shell/shell';
import {
  AgentActionSchema,
  BaseActionSchema,
  type AgentAction,
  type BaseAction,
} from '../missions/agentSchema';
import { evaluate, type Predicate } from '../missions/predicates';
import { sampleJudgmentDrillsInput } from '../missions/sample.test-mission';
import { applySteps, createSandbox, DISPLAY_ROOT } from '../missions/sandbox';
import { JudgmentDrillSchema } from '../missions/schema';
import {
  driverAction,
  dryRun,
  playAction,
  playContent,
  replay,
  sceneLog,
  startLog,
  withEntry,
  type ContentAction,
  type LogEntry,
} from './replay';
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

describe('dryRun', () => {
  const guards: Predicate[] = [
    { kind: 'driveFile', path: `${HOME}/old/notes.txt`, label: 'Old notes survive' },
    { kind: 'driveFile', path: `${API}/package.json`, label: 'The API is intact' },
  ];
  const deleteOld = { kind: 'deleted', path: `${HOME}/old`, item: 'folder', inside: 1 };

  it('works out what a line would do, and never touches the live sandbox', () => {
    const log = startLog(setup, [{ do: 'run', line: 'cd quillwork\\api' }]);
    const { shell: live } = replay(log, testDeps());
    const before = stateOf(live);
    const heard: unknown[] = [];
    live.ws.events.on((event) => heard.push(event));

    const line = 'Remove-Item C:\\Users\\kyle\\old -Recurse';
    const dry = dryRun(log, { do: 'run', line }, { guards }, testDeps());

    expect(dry.changes).toEqual([deleteOld]);
    expect(dry.broken).toEqual(['Old notes survive']);
    expect(dry.harmful).toBe(true);
    expect(stateOf(live)).toEqual(before);
    expect(heard).toEqual([]);
    expect(log.entries).toHaveLength(1);
  });

  it("finds a safe line harmless, and a guard that already failed isn't its fault", () => {
    const alreadyFailing: Predicate = { kind: 'driveFolder', path: `${HOME}/old`, exists: false };
    const line = 'mkdir C:\\Users\\kyle\\notes';
    const dry = dryRun(
      startLog(setup),
      { do: 'run', line },
      { guards: [...guards, alreadyFailing] },
      testDeps(),
    );
    expect(dry.changes).toEqual([{ kind: 'created', path: `${HOME}/notes`, item: 'folder' }]);
    expect(dry.broken).toEqual([]);
    expect(dry.harmful).toBe(false);
  });

  it('tries a Confirm answer after the line that asked, so each letter shows its own effects', () => {
    const line = 'Remove-Item C:\\Users\\kyle\\old';
    const asking = dryRun(startLog(setup), { do: 'run', line }, { guards }, testDeps());
    expect(asking.step.asking).toBe(true);
    expect(asking.changes).toEqual([]);

    const asked = startLog(setup, [{ do: 'run', line }]);
    const no = dryRun(asked, { do: 'answer', choice: 'N' }, { guards }, testDeps());
    const all = dryRun(asked, { do: 'answer', choice: 'A' }, { guards }, testDeps());
    expect([no.changes, no.harmful]).toEqual([[], false]);
    expect([all.changes, all.harmful]).toEqual([[deleteOld], true]);
  });

  it('answers questions about the copy as the line left it, transcript included', () => {
    const dry = dryRun(startLog(setup), { do: 'run', line: 'mkdir notes' }, { guards }, testDeps());
    expect(evaluate({ kind: 'driveFolder', path: `${HOME}/notes` }, dry.queries)).toBe(true);
    expect(dry.queries.transcript?.printed('Directory: C:\\Users\\kyle')).toBe(true);
  });

  it('gives the sample approve drills the answers they promise', () => {
    const drills = sampleJudgmentDrillsInput.map((input) => JudgmentDrillSchema.parse(input));
    const broken = drills
      .filter((drill) => drill.kind === 'approve')
      .map((drill) => {
        const scene = sceneLog(drill.setup, drill.history, testDeps());
        return [drill.id, dryRun(scene, driverAction(drill.action), drill, testDeps()).broken];
      });
    expect(Object.fromEntries(broken)).toEqual({
      'sample-approve-stray': [],
      'sample-approve-notes': ['Onboarding notes survive'],
    });
  });

  it('judges a guard part by part, so a line that finishes what another began still harms', () => {
    const oldNotes: Predicate = {
      kind: 'all',
      of: [
        { kind: 'driveFile', path: `${HOME}/old/notes.txt` },
        { kind: 'driveFile', path: `${HOME}/old2/notes.txt` },
      ],
      label: 'Old notes survive',
    };
    // Otto already deleted old; old2 is all that's left of what the guard protects.
    const oneGone = withEntry(
      withEntry(startLog(setup), {
        kind: 'steps',
        steps: [{ op: 'write', path: `${HOME}/old2/notes.txt`, content: 'week 2\n' }],
      }),
      run('Remove-Item C:\\Users\\kyle\\old -Recurse'),
    );
    const line = 'Remove-Item C:\\Users\\kyle\\old2 -Recurse';
    const dry = dryRun(oneGone, { do: 'run', line }, { guards: [oldNotes] }, testDeps());
    expect(dry.broken).toEqual(['Old notes survive']);

    // A check on several paths is judged path by path too.
    const act2 = repo().commit('init', { 'app.ts': 'v1\n' }).write('a.ts', '').write('b.ts', '');
    const untracked: Predicate = { kind: 'untracked', paths: ['a.ts', 'b.ts'] };
    const addedA = startLog(act2.toSpec(), [{ do: 'run', line: 'git add a.ts' }]);
    const addB = { do: 'run', line: 'git add b.ts' } as const;
    expect(dryRun(addedA, addB, { guards: [untracked] }, testDeps()).harmful).toBe(true);
  });

  it('tries a line in an Act 2 sandbox too, where no laptop can change', () => {
    const act2 = repo().commit('init', { 'app.ts': 'v1\n' }).toSpec();
    const guard: Predicate = { kind: 'workingFile', path: 'app.ts' };
    const dry = dryRun(
      startLog(act2),
      { do: 'run', line: 'git rm app.ts' },
      { guards: [guard] },
      testDeps(),
    );
    expect(dry.changes).toEqual([]);
    expect(dry.broken).toEqual(['app.ts exists']);
  });
});

describe("the content's actions", () => {
  // Every action a plan, a deny branch or a drill can hold is a ContentAction, so all of
  // them can go through playContent. These compile only while that stays true.
  const fromBase = (action: BaseAction): ContentAction => action;
  const fromScript = (action: AgentAction): ContentAction => action;
  const line = 'Remove-Item C:\\Users\\kyle\\old';

  it('log a Confirm answer as its own action, right after the line that asked', () => {
    const history = [
      fromBase(BaseActionSchema.parse({ do: 'run', line, answer: 'A', say: 'Clearing old.' })),
      // Nothing asks here, so this answer is never typed.
      fromScript(AgentActionSchema.parse({ do: 'run', line: 'mkdir notes', answer: 'A' })),
      fromBase(BaseActionSchema.parse({ do: 'newTerminal', say: 'A fresh terminal.' })),
      fromScript(AgentActionSchema.parse({ do: 'write', path: `${HOME}/a.md`, content: 'a' })),
      fromBase(BaseActionSchema.parse({ do: 'useTerminal', tab: 1 })),
    ];
    const scene = sceneLog(setup, history, testDeps());
    expect(scene.entries).toEqual([
      run(line),
      { kind: 'action', action: { do: 'answer', choice: 'A' } },
      run('mkdir notes'),
      { kind: 'action', action: { do: 'newTerminal' } },
      { kind: 'action', action: { do: 'write', path: `${HOME}/a.md`, content: 'a' } },
      { kind: 'action', action: { do: 'useTerminal', tab: 1 } },
    ]);

    // Playing the content straight into a sandbox ends up in the same place.
    const live = new Shell(createSandbox(setup, testDeps()), DISPLAY_ROOT);
    const transcript: TranscriptEntry[] = [];
    for (const action of history) playContent(live, transcript, action);
    const replayed = replay(scene, testDeps());
    expect(stateOf(replayed.shell)).toEqual(stateOf(live));
    expect(replayed.transcript).toEqual(transcript);
    expect(stateOf(live).laptop?.items.has(`${HOME}/old`)).toBe(false);
  });

  it('stay out of a log while a line carries its Confirm answer, which would be dropped', () => {
    const script = AgentActionSchema.parse({ do: 'run', line, answer: 'A' });
    // @ts-expect-error: this line is two actions, the line and then its answer.
    const dropped = startLog(setup, [script]);
    // What would happen: the line runs, the question stays open, and old is still there.
    const { shell } = replay(dropped, testDeps());
    expect(shell.machineShell?.asking).toBe(true);
    expect(shell.ws.machine?.drive.exists(`${HOME}/old`)).toBe(true);
    expect(driverAction(script)).toEqual({ do: 'run', line });
  });
});
