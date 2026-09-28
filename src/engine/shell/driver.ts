import { writeSandboxFile } from '../fixtures';
import { parentDir } from '../fs/paths';
import { FsError } from '../fs/virtualFs';
import { line, type OutputLine } from '../git/cli/output';
import type { Machine } from '../machine/machine';
import { display } from '../machine/winPath';
import type { EngineEvent, Workspace } from '../workspace';
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
  | { readonly do: 'answer'; readonly choice: ConfirmLetter }
  /**
   * Write a whole file with the agent's file tool, not the terminal. The path is a drive
   * path on a laptop ('Users/kyle/notes.txt'), and a project path in Act 2's sandboxes.
   */
  | { readonly do: 'write'; readonly path: string; readonly content: string }
  /** Open a new terminal tab. It becomes the active one, as a new tab does. */
  | { readonly do: 'newTerminal' }
  /** Switch to an open tab by its number. */
  | { readonly do: 'useTerminal'; readonly tab: number };

/** What one action did: all the terminal and the world need to show it. */
export interface DriverStep {
  /** The tab the action happened in: the active one, or the tab a switch landed on. */
  readonly tab: number;
  /**
   * That tab's prompt as the action began: `PS C:\Users\kyle> `, or PowerShell's choice
   * line while a question is open. A new tab's is its first prompt.
   */
  readonly prompt: string;
  /**
   * What appears typed after the prompt: the line, or the answer's letter. Null when
   * nothing is typed, as for a file write or a tab switch.
   */
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

const SILENT: ShellResult = { lines: [], exitCode: 0 };

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
    case 'write':
      return {
        ...where(shell),
        echo: null,
        result: writeFile(shell.ws, action.path, action.content),
      };
    case 'newTerminal':
      requireMachine(shell, action).openSession();
      return { ...where(shell), echo: null, result: SILENT };
    case 'useTerminal': {
      const machine = requireMachine(shell, action);
      if (!machine.sessions().some((session) => session.id === action.tab))
        throw new DriverError(`No terminal tab ${String(action.tab)} is open.`);
      machine.activate(action.tab);
      return { ...where(shell), echo: null, result: SILENT };
    }
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

/**
 * The agent's file tool writes a whole file. Like an editor saving, it makes any folders
 * the file needs; on a laptop that goes through the machine, so the world hears about each
 * new folder. A folder or file in the way fails the write with a message, as a real tool
 * reports it, rather than throwing.
 */
function writeFile(ws: Workspace, path: string, content: string): ShellResult {
  try {
    ws.machine?.makeFolder(parentDir(path));
    writeSandboxFile(ws, path, content);
    return SILENT;
  } catch (error) {
    if (!(error instanceof FsError)) throw error;
    const shown = ws.machine === null ? path : display(path);
    const reason = error.code === 'EISDIR' ? "it's a folder" : 'a file is in the way';
    return { lines: [line(`Can't write ${shown}: ${reason}.`, 'error')], exitCode: 1 };
  }
}

function where(shell: Shell): { readonly tab: number; readonly prompt: string } {
  return { tab: activeTab(shell), prompt: shell.prompt() };
}

function activeTab(shell: Shell): number {
  return shell.ws.machine?.active().id ?? ONLY_TAB;
}

function isAsking(shell: Shell): boolean {
  return shell.machineShell?.asking === true;
}

/** Terminal tabs belong to a laptop. Act 2's project sandboxes have just one terminal. */
function requireMachine(shell: Shell, action: DriverAction): Machine {
  const machine = shell.ws.machine;
  if (machine === null)
    throw new DriverError(`"${action.do}" needs a laptop sandbox; this one has one terminal.`);
  return machine;
}
