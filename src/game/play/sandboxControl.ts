import { defaultDeps, type FixtureStep } from '../../engine/fixtures';
import type { RepositoryDeps } from '../../engine/git/repository';
import type { ConfirmLetter, DriverStep } from '../../engine/shell/driver';
import { Shell } from '../../engine/shell/shell';
import type { Workspace } from '../../engine/workspace';
import {
  dryRun,
  dryRunRefused,
  playAction,
  replay,
  startLog,
  withEntry,
  type DryRun,
  type LoggedAction,
  type Replay,
  type SandboxLog,
} from '../agent/replay';
import { transcriptQueries, type TranscriptEntry } from '../agent/transcript';
import { announce } from '../hud';
import type { Predicate, SandboxQueries } from '../missions/predicates';
import { applySteps, createSandbox, sandboxQueries } from '../missions/sandbox';
import { DISPLAY_ROOT, sandbox } from '../sandbox';

/**
 * The live sandbox's log and Otto's transcript. They belong to one workspace, so a
 * sandbox swapped in some other way has no log, rather than someone else's.
 *
 * The log holds what went through loadSandbox, applyChange and recordAction. Lines the
 * player types into the terminal aren't in it, so a replay matches the live sandbox
 * only where Otto does all the typing, as in Act 1's directed missions and drills.
 *
 * `makeDeps` makes fresh dependencies for every replay. Handing a replay the live
 * sandbox's own would move the live clock forward (testDeps() counts every commit), so
 * later live commits would stop matching a replay of the log.
 */
interface Recording {
  readonly ws: Workspace;
  log: SandboxLog;
  readonly transcript: TranscriptEntry[];
  readonly makeDeps: () => RepositoryDeps;
}

let recording: Recording | null = null;

function swapIn(
  { shell, transcript }: Replay,
  log: SandboxLog,
  makeDeps: () => RepositoryDeps,
  notice: string,
): Workspace {
  // The log goes in first: the store's listeners may ask for queries straight away.
  recording = { ws: shell.ws, log, transcript, makeDeps };
  sandbox.update({ shell, openFile: null });
  announce(notice);
  return shell.ws;
}

/**
 * Swaps the player's sandbox for a fresh one built from `steps`, and says why in the
 * terminal. The 3D world follows the sandbox store, so crates and history redraw too.
 * A new log starts from the same steps. Tests pass testDeps, so every replay's commit ids
 * match the live sandbox's.
 */
export function loadSandbox(
  steps: readonly FixtureStep[],
  notice: string,
  makeDeps: () => RepositoryDeps = defaultDeps,
): Workspace {
  const shell = new Shell(createSandbox(steps, makeDeps()), DISPLAY_ROOT);
  return swapIn({ shell, transcript: [] }, startLog(steps), makeDeps, notice);
}

export function currentWorkspace(): Workspace {
  return sandbox.get().shell.ws;
}

function liveRecording(): Recording {
  const live = recording;
  if (live?.ws !== currentWorkspace())
    throw new Error('This sandbox has no log: load it with loadSandbox.');
  return live;
}

/**
 * The live sandbox's log so far. Logs never change, so keep one, say when a step begins,
 * and it stays a checkpoint to rewind to.
 */
export function currentLog(): SandboxLog {
  return liveRecording().log;
}

/** What predicates are checked against: the sandbox as it is right now, laptop included. */
export function currentQueries(): SandboxQueries {
  const ws = currentWorkspace();
  const live = recording?.ws === ws ? recording : null;
  return sandboxQueries(ws, live === null ? undefined : transcriptQueries(live.transcript));
}

/**
 * Otto takes one action in the live sandbox. The log keeps the action exactly as it was
 * passed to drive(), and only once it ran: an action the driver refused never happened,
 * so a replay must not try it either.
 */
export function recordAction(action: LoggedAction): DriverStep {
  const live = liveRecording();
  const step = playAction(sandbox.get().shell, live.transcript, action);
  live.log = withEntry(live.log, { kind: 'action', action });
  return step;
}

/**
 * Applies setup steps to the live sandbox, like a step's `before`, and logs them. They are
 * tried in a scratch copy first: a step that fails halfway (a `cd` to a folder that isn't
 * there) must not leave the live sandbox changed while its log says it isn't.
 */
export function applyChange(steps: readonly FixtureStep[]): void {
  const live = liveRecording();
  const log = withEntry(live.log, { kind: 'steps', steps });
  replay(log, live.makeDeps()); // throws before anything live changes if a step can't apply
  applySteps(live.ws, steps);
  live.log = log;
}

/**
 * What an action would do from here, tried in a scratch copy with fresh dependencies:
 * the live sandbox, its clock included, never feels it. On the real clock a commit in the
 * copy gets a new time and id; nothing grades by commit id.
 *
 * With `refusal`, every Confirm question the line asks gets that answer (replay.ts
 * dryRunRefused): what the line does even if Kyle refuses, which is what a line gate shows.
 */
export function dryRunNow(
  action: LoggedAction,
  judge: { readonly guards: readonly Predicate[] },
  refusal?: ConfirmLetter,
): DryRun {
  const live = liveRecording();
  if (refusal === undefined) return dryRun(live.log, action, judge, live.makeDeps());
  return dryRunRefused(live.log, action, judge, live.makeDeps(), refusal);
}

/**
 * Rewind: swaps the live sandbox for a replay of an earlier log, like the one kept when a
 * step began. Otto's transcript goes back with it. The world redraws from the new sandbox,
 * as it does for loadSandbox. On the real clock its commits get new times, so new ids.
 */
export function rewindTo(checkpoint: SandboxLog, notice: string): Workspace {
  const { makeDeps } = liveRecording();
  return swapIn(replay(checkpoint, makeDeps()), checkpoint, makeDeps, notice);
}

/**
 * Calls `onChange` once after any burst of changes to the sandbox (a command, a saved
 * edit, a boss twist), and keeps watching when a new sandbox replaces the old one.
 * Grading by state means this is the only signal play needs: no command parsing.
 */
export function watchSandbox(onChange: () => void): () => void {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    // One `git add .` fires an event per file; check once, after the command finishes.
    queueMicrotask(() => {
      scheduled = false;
      onChange();
    });
  };
  let watched = currentWorkspace();
  let stopEvents = watched.events.on(schedule);
  const stopStore = sandbox.subscribe(() => {
    const ws = currentWorkspace();
    if (ws === watched) return;
    stopEvents();
    watched = ws;
    stopEvents = ws.events.on(schedule);
    schedule();
  });
  return () => {
    stopEvents();
    stopStore();
  };
}
