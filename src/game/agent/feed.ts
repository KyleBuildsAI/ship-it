import type { OutputLine } from '../../engine/git/cli/output';
import type { DriverStep } from '../../engine/shell/driver';
import { CHOICES } from '../../engine/shell/machine/confirm';
import type { EngineEvent } from '../../engine/workspace';

/** Who typed a line: Otto, or Kyle through a look chip. Only Otto's lines get his marker. */
export type Typist = 'otto' | 'kyle';

/**
 * One moment of Otto's work, in the order it happens. The feed decides what appears; the
 * pace decides when; the terminal only draws. A divider, a prompt and output always start
 * on a fresh line, so the terminal ends a line that's still open (a prompt waiting in a
 * tab Otto just left) before drawing them.
 */
export type FeedBeat =
  /** The terminal changed tabs, so it prints a divider like `── PS 2 ──`. */
  | { readonly kind: 'divider'; readonly tab: number }
  /** A prompt, left open for whatever is typed next. */
  | { readonly kind: 'prompt'; readonly tab: number; readonly text: string }
  /** A line typed after the prompt. The pace types it out a few characters at a time. */
  | { readonly kind: 'type'; readonly tab: number; readonly text: string; readonly by: Typist }
  /** Enter: the typed line ends and runs. */
  | { readonly kind: 'enter'; readonly tab: number }
  /** The typed line ends without running, because Kyle denied it. */
  | { readonly kind: 'cancel'; readonly tab: number }
  /** The real output, each line printed whole. */
  | { readonly kind: 'output'; readonly tab: number; readonly lines: readonly OutputLine[] }
  /**
   * Everything the machine and git announced, kept in order with the other beats for views
   * that follow the playback. The world doesn't animate from this beat: it hears the same
   * events live on `ws.events` (spec section 4), so two sources never animate one event.
   */
  | { readonly kind: 'world'; readonly events: readonly EngineEvent[] }
  /** The action is over: its exit code for the run log and the drone's red flash. */
  | {
      readonly kind: 'result';
      readonly tab: number;
      readonly exitCode: number;
      /** PowerShell's Confirm question is open, so the next thing typed answers it. */
      readonly asking: boolean;
      /**
       * The run log's words for an action that types nothing, like "Opened a new
       * terminal": with no typed line to show, its row needs words of its own.
       */
      readonly label?: string;
    };

/**
 * What the terminal shows at its bottom right now. The feed keeps track so it never prints
 * a prompt twice: after `newTerminal`, the next line is typed after the prompt already there.
 */
export interface FeedState {
  /** The tab the terminal is showing. */
  readonly tab: number;
  /** The prompt on the last line while that line is still open, or null once it has ended. */
  readonly prompt: string | null;
  /** A line typed after that prompt that hasn't run yet: Otto waits at a predict or a gate. */
  readonly typed: string | null;
}

/** New beats, and what the terminal shows once they've played. */
export interface Fed {
  readonly state: FeedState;
  readonly beats: readonly FeedBeat[];
}

/** The part of an action that is typed, known before it runs: the tab, its prompt, the line. */
export type Typing = Pick<DriverStep, 'tab' | 'prompt' | 'echo'>;

/** Starts feeding a terminal that shows `tab`, with `prompt` open on its last line, if any. */
export function startFeed(tab: number, prompt: string | null = null): FeedState {
  return { tab, prompt, typed: null };
}

/**
 * Leaves `tab` showing `prompt`, waiting, as a terminal does between commands. A change of
 * tab prints a divider first. A prompt already open there prints nothing.
 */
export function feedPrompt(state: FeedState, tab: number, prompt: string): Fed {
  const beats: FeedBeat[] = [];
  let now = state;
  if (tab !== now.tab) {
    beats.push({ kind: 'divider', tab });
    now = startFeed(tab);
  }
  if (now.prompt !== prompt || now.typed !== null) {
    beats.push({ kind: 'prompt', tab, text: prompt });
    now = startFeed(tab, prompt);
  }
  return { state: now, beats };
}

/**
 * The first half of an action: its prompt and the line typed after it. A predict or a gate
 * stops here, with the line waiting unrun. The controller can build `typing` before it
 * drives the action (the active tab, `shell.prompt()`, the line). It plays the typing, and
 * only then drives the action: the world hears the engine's events on `ws.events` the
 * moment they happen, so this order keeps it from running ahead of the terminal. A file
 * write types nothing; a new or switched tab shows its prompt.
 */
export function feedTyping(state: FeedState, typing: Typing, by: Typist = 'otto'): Fed {
  if (typing.echo === null && typing.tab === state.tab) return { state, beats: [] };
  const shown = feedPrompt(state, typing.tab, typing.prompt);
  if (typing.echo === null) return shown;
  return {
    state: { ...shown.state, typed: typing.echo },
    beats: [...shown.beats, { kind: 'type', tab: typing.tab, text: typing.echo, by }],
  };
}

/**
 * The second half, once the action has run: Enter, the output, and the events the action
 * announced. While a Confirm question is open, PowerShell's choice line is the open prompt,
 * so Otto's answer is typed right after it. It's printed only when it isn't showing yet:
 * a file write, or a switch to a tab that's asking, leaves the question open without
 * ending the line it's on.
 */
export function feedOutcome(state: FeedState, step: DriverStep, label?: string): Fed {
  const { tab } = step;
  const beats: FeedBeat[] = [];
  let now: FeedState = { ...state, tab };
  if (now.typed !== null) {
    beats.push({ kind: 'enter', tab });
    now = startFeed(tab);
  }
  if (step.lines.length > 0) {
    beats.push({ kind: 'output', tab, lines: step.lines });
    now = startFeed(tab);
  }
  if (step.asking && now.prompt !== CHOICES) {
    beats.push({ kind: 'prompt', tab, text: CHOICES });
    now = startFeed(tab, CHOICES);
  }
  if (step.events.length > 0) beats.push({ kind: 'world', events: step.events });
  const result = { kind: 'result', tab, exitCode: step.exitCode, asking: step.asking } as const;
  beats.push(label === undefined ? result : { ...result, label });
  return { state: now, beats };
}

/** Everything one action shows, from its prompt to its result. */
export function feedAction(
  state: FeedState,
  step: DriverStep,
  by: Typist = 'otto',
  label?: string,
): Fed {
  const typing = feedTyping(state, step, by);
  const outcome = feedOutcome(typing.state, step, label);
  return { state: outcome.state, beats: [...typing.beats, ...outcome.beats] };
}

/** A typed line that will never run, because Kyle denied it at a gate. */
export function feedCancel(state: FeedState): Fed {
  if (state.typed === null) return { state, beats: [] };
  return { state: startFeed(state.tab), beats: [{ kind: 'cancel', tab: state.tab }] };
}
