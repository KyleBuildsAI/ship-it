import type { FixtureStep } from '../../engine/fixtures';
import type { RepositoryDeps } from '../../engine/git/repository';
import { diffSnapshots, snapshotMachine, type MachineChange } from '../../engine/machine/snapshot';
import { drive, type DriverAction, type DriverStep } from '../../engine/shell/driver';
import { Shell } from '../../engine/shell/shell';
import type { EngineEvent, Workspace } from '../../engine/workspace';
import { describe, evaluate, type Predicate, type SandboxQueries } from '../missions/predicates';
import { applySteps, createSandbox, DISPLAY_ROOT, sandboxQueries } from '../missions/sandbox';
import { transcriptEntry, transcriptQueries, type TranscriptEntry } from './transcript';

/*
 * The sandbox log: a setup, then everything done to the sandbox since, in order. The
 * engine is deterministic, so playing a log into a fresh sandbox rebuilds the same
 * laptop. That one idea gives the game three things:
 *   - a dry run: play the log into a scratch copy and try the next action there first
 *   - rewind: swap the live sandbox for a replay of the log as it was earlier
 *   - drill scenes: a drill's setup and the lines Otto already ran are a log too
 */

/**
 * One action for the driver, as the log keeps it. Content's run line may carry Otto's
 * answer to PowerShell's Confirm question, and that is two actions: the line, then the
 * answer, which gets a gate of its own (D7). Passed straight in, it would run the line and
 * quietly drop the answer, so `answer?: never` makes TypeScript refuse it here.
 */
export type LoggedAction = DriverAction & { readonly answer?: never };

/** One thing done to a sandbox after its setup. */
export type LogEntry =
  /** Setup steps applied to the live sandbox, like a step's `before` or a boss twist. */
  | { readonly kind: 'steps'; readonly steps: readonly FixtureStep[] }
  /** One of Otto's actions, exactly as it was passed to drive(). */
  | { readonly kind: 'action'; readonly action: LoggedAction };

export interface SandboxLog {
  readonly setup: readonly FixtureStep[];
  readonly entries: readonly LogEntry[];
}

/** A log that starts from a setup, with driver actions Otto has already taken. */
export function startLog(
  setup: readonly FixtureStep[],
  actions: readonly LoggedAction[] = [],
): SandboxLog {
  return { setup, entries: actions.map((action) => ({ kind: 'action', action })) };
}

/** The same log with one more entry. A log never changes, so one kept earlier is a checkpoint. */
export function withEntry(log: SandboxLog, entry: LogEntry): SandboxLog {
  return { setup: log.setup, entries: [...log.entries, entry] };
}

/**
 * Otto takes one action and it goes into his transcript. Live play and replays both act
 * through here, so a replay plays each action exactly the way it was first played.
 */
export function playAction(
  shell: Shell,
  transcript: TranscriptEntry[],
  action: LoggedAction,
): DriverStep {
  const step = drive(shell, action);
  transcript.push(transcriptEntry(action, step));
  return step;
}

export interface Replay {
  readonly shell: Shell;
  readonly transcript: TranscriptEntry[];
}

/**
 * Plays a log into a brand-new sandbox. Given fresh deps that start the same way (tests
 * pass a new testDeps()), the result equals the live sandbox the log came from, commit ids
 * included. Entries play in order, so an answer still follows the line that asked: the
 * driver refuses a line while a question is open, and an answer before its question.
 */
export function replay(log: SandboxLog, deps: RepositoryDeps): Replay {
  const shell = new Shell(createSandbox(log.setup, deps), DISPLAY_ROOT);
  const transcript: TranscriptEntry[] = [];
  for (const entry of log.entries) {
    if (entry.kind === 'steps') applySteps(shell.ws, entry.steps);
    else playAction(shell, transcript, entry.action);
  }
  return { shell, transcript };
}

/** What an action would do, found by trying it in a scratch copy of the sandbox. */
export interface DryRun {
  /** What the terminal showed, as if it had run for real. */
  readonly step: DriverStep;
  /** What changed on the laptop, by name only: the effects a gate lists. */
  readonly changes: readonly MachineChange[];
  /** Questions about the scratch copy as the action left it, transcript included. */
  readonly queries: SandboxQueries;
  /** The guards the action broke, as the checklist words them. */
  readonly broken: readonly string[];
  /** Whether allowing the action does harm: it broke a guard. */
  readonly harmful: boolean;
}

/**
 * Tries an action in a scratch copy of the sandbox: the log is played into a brand-new
 * one, so the live sandbox never sees the action, its events, or the replay. This is how
 * a gate knows what a line will do before Kyle decides, and how the game knows whether
 * denying it was right: an author never marks a line harmful, the engine finds out.
 *
 * A guard counts as broken when it held before the action and fails after it. One that
 * had already failed isn't this action's fault, so it can't make the action harmful.
 */
export function dryRun(
  log: SandboxLog,
  action: DriverAction,
  judge: { readonly guards: readonly Predicate[] },
  deps: RepositoryDeps,
): DryRun {
  const { shell, transcript } = replay(log, deps);
  const queries = sandboxQueries(shell.ws, transcriptQueries(transcript));
  const heldBefore = judge.guards.map((guard) => evaluate(guard, queries));
  const changesSince = watchChanges(shell.ws);
  const step = playAction(shell, transcript, action);
  const broken = judge.guards
    .filter((guard, index) => heldBefore[index] === true && !evaluate(guard, queries))
    .map((guard) => describe(guard, queries.machine?.display));
  return {
    step,
    changes: changesSince(step.events),
    queries,
    broken,
    harmful: broken.length > 0,
  };
}

/**
 * Snapshots the laptop now, and returns how to ask what changed since. The action's own
 * events say which items moved where, which two snapshots alone can't tell. An Act 2
 * sandbox has no laptop, so nothing on one can change.
 */
function watchChanges(ws: Workspace): (events: readonly EngineEvent[]) => MachineChange[] {
  const machine = ws.machine;
  if (machine === null) return () => [];
  const before = snapshotMachine(machine);
  return (events) => diffSnapshots(before, snapshotMachine(machine), events);
}
