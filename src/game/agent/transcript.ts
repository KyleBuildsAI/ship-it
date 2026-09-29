import type { DriverAction, DriverStep } from '../../engine/shell/driver';

/*
 * Otto's transcript: everything that went through his hands, in order. A real coding
 * agent keeps what it typed and every line the terminal printed back in its context, so a
 * secret that scrolled past in the output is a secret the agent now holds, even if nobody
 * read the screen. Checks read the transcript through SandboxQueries.transcript.
 */

/** One action Otto took, and what came back from it. */
export interface TranscriptEntry {
  /** The terminal tab it happened in. */
  readonly tab: number;
  /** The action exactly as it was driven. */
  readonly action: DriverAction;
  /** The text of every line the terminal printed back. */
  readonly output: readonly string[];
  readonly exitCode: number;
}

/** What a check can ask about Otto's transcript. */
export interface TranscriptQueries {
  /**
   * Whether this text went through Otto's hands: in a line he typed, a file he wrote, or
   * the output that came back. It ignores case, like a predict's `printed` outcome, so a
   * secret can't slip past in different capitals.
   */
  readonly printed: (text: string) => boolean;
}

export function transcriptEntry(action: DriverAction, step: DriverStep): TranscriptEntry {
  return {
    tab: step.tab,
    action,
    output: step.lines.map((line) => line.text),
    exitCode: step.exitCode,
  };
}

/** What Otto sent with an action: the line, the letter, or the file he wrote. */
function sent(action: DriverAction): readonly string[] {
  switch (action.do) {
    case 'run':
      return [action.line];
    case 'answer':
      return [action.choice];
    case 'write':
      return [action.path, action.content];
    case 'newTerminal':
    case 'useTerminal':
      return [];
  }
}

/**
 * Questions about a transcript that keeps growing. Like the sandbox's own queries, they
 * read it when asked, so an entry added later is seen too.
 */
export function transcriptQueries(entries: readonly TranscriptEntry[]): TranscriptQueries {
  return {
    printed: (text) => {
      const wanted = text.toLowerCase();
      return entries.some((entry) =>
        [...sent(entry.action), ...entry.output].some((part) =>
          part.toLowerCase().includes(wanted),
        ),
      );
    },
  };
}
