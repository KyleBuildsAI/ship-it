import type { OutputLine } from '../git/cli/output';
import type { EngineEvent } from '../workspace';
import type { Shell, ShellResult } from './shell';

/** The letters that answer PowerShell's Confirm question: Yes, Yes to All, No, No to All. */
export const CONFIRM_LETTERS = ['Y', 'A', 'N', 'L'] as const;
export type ConfirmLetter = (typeof CONFIRM_LETTERS)[number];

/**
 * One thing the in-game coding agent does to a sandbox. Mission content says more about
 * each action, like what the agent says while doing it. The game hands the driver only
 * what the machine needs, so the engine never depends on game code.
 */
export type DriverAction =
  /** Type a line into the active terminal and press Enter. */
  | { readonly do: 'run'; readonly line: string }
  /** Answer the question open in the active terminal by typing its letter. */
  | { readonly do: 'answer'; readonly choice: ConfirmLetter };

/** What one action did: all the terminal and the world need to show it. */
export interface DriverStep {
  /** The terminal tab the action happened in. */
  readonly tab: number;
  /**
   * That tab's prompt as the action began: `PS C:\Users\kyle> `, or PowerShell's choice
   * line while a question is open.
   */
  readonly prompt: string;
  /** What appears typed after the prompt: the line, or the answer's letter. Null when nothing is. */
  readonly echo: string | null;
  /** The real output, exactly as the shell printed it. */
  readonly lines: readonly OutputLine[];
  readonly exitCode: number;
  /**
   * PowerShell's Confirm question is open in the active tab afterwards, so the next thing
   * typed there must answer it.
   */
  readonly asking: boolean;
  /** Everything the machine and git announced during this action, in order. */
  readonly events: readonly EngineEvent[];
}

/**
 * An action the sandbox can't take, like answering when nothing asked. It's a bug in the
 * caller or the content, never something a player did, so it throws instead of printing.
 */
export class DriverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriverError';
  }
}

/** Act 2's sandboxes have a single terminal with no tabs, so it counts as tab 1. */
const ONLY_TAB = 1;

interface Acted {
  readonly tab: number;
  readonly prompt: string;
  readonly echo: string | null;
  readonly result: ShellResult;
}

/**
 * Runs one agent action through the sandbox's shell, the same shell the player types in,
 * so the agent's output and errors are real ones. Lines go to the active tab's own
 * PowerShell. The events are recorded only for this action, so each step of the agent's
 * work can be animated and explained on its own.
 */
export function drive(shell: Shell, action: DriverAction): DriverStep {
  const events: EngineEvent[] = [];
  const stop = shell.ws.events.on((event) => {
    events.push(event);
  });
  try {
    const { tab, prompt, echo, result } = act(shell, action);
    return {
      tab,
      prompt,
      echo,
      lines: result.lines,
      exitCode: result.exitCode,
      asking: isAsking(shell),
      events,
    };
  } finally {
    // Even when the action throws, so a refused action never leaves a listener behind.
    stop();
  }
}

function act(shell: Shell, action: DriverAction): Acted {
  switch (action.do) {
    case 'run':
      return typeIn(shell, action.line, 'line');
    case 'answer':
      return typeIn(shell, action.choice, 'answer');
  }
}

/**
 * Types into the active tab. An answer needs an open question, and a line needs none:
 * while PowerShell asks, it reads whatever is typed next as the answer, so a command
 * sent then would be swallowed instead of run.
 */
function typeIn(shell: Shell, text: string, kind: 'line' | 'answer'): Acted {
  const tab = activeTab(shell);
  if (kind === 'answer' && !isAsking(shell))
    throw new DriverError(
      `Nothing is asking in tab ${String(tab)}, so there is nothing to answer.`,
    );
  if (kind === 'line' && isAsking(shell))
    throw new DriverError(`Tab ${String(tab)} is asking a question: answer it before "${text}".`);
  const prompt = shell.prompt();
  return { tab, prompt, echo: text, result: shell.run(text) };
}

function activeTab(shell: Shell): number {
  return shell.ws.machine?.active().id ?? ONLY_TAB;
}

function isAsking(shell: Shell): boolean {
  return shell.machineShell?.asking === true;
}
