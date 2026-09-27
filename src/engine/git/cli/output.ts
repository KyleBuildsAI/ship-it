/**
 * How a line should look in the terminal. The engine only labels meaning; the
 * terminal decides colors. That keeps the engine free of ANSI codes and UI choices.
 */
export type Tone =
  | 'plain'
  | 'error'
  | 'hint'
  | 'staged'
  | 'unstaged'
  | 'untracked'
  | 'added'
  | 'removed'
  | 'hunk'
  | 'meta'
  | 'commit';

export interface OutputLine {
  readonly text: string;
  readonly tone: Tone;
}

export interface CommandResult {
  readonly lines: readonly OutputLine[];
  /** 0 success, 1 a refused operation, 128 a fatal usage error, matching real git. */
  readonly exitCode: number;
}

export const line = (text: string, tone: Tone = 'plain'): OutputLine => ({ text, tone });

export const ok = (lines: readonly OutputLine[] = []): CommandResult => ({ lines, exitCode: 0 });

/** `fatal: ...`, git's wording for a command it refuses to even start. */
export const fatal = (message: string, ...hints: string[]): CommandResult => ({
  lines: [
    line(`fatal: ${message}`, 'error'),
    ...hints.map((hint) => line(`hint: ${hint}`, 'hint')),
  ],
  exitCode: 128,
});

/** `error: ...`, for an operation git started but declined to complete. */
export const failure = (lines: readonly OutputLine[]): CommandResult => ({ lines, exitCode: 1 });

/** Joins output into plain text, for tests and for pasting into mission verification. */
export function toText(result: CommandResult): string {
  return result.lines.map((output) => output.text).join('\n');
}
