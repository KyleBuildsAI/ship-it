import type { FixtureStep } from '../../engine/fixtures';
import type { RepositoryDeps } from '../../engine/git/repository';
import { drive, type DriverAction, type DriverStep } from '../../engine/shell/driver';
import { Shell } from '../../engine/shell/shell';
import { applySteps, createSandbox, DISPLAY_ROOT } from '../missions/sandbox';
import { transcriptEntry, type TranscriptEntry } from './transcript';

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
