/**
 * A paste from a real terminal, reduced to git's own output. Copying from PowerShell adds
 * things git never printed: Windows line endings, color codes, the prompt you typed the
 * command at, trailing spaces, and sometimes the pager's "(END)" marker.
 */
export interface NormalizedPaste {
  /** Git's output, one entry per line, with no color codes or trailing whitespace. */
  readonly lines: readonly string[];
  /** The command typed at a copied prompt, like `git status -sb`, or null when no prompt was copied. */
  readonly command: string | null;
}

// Terminal escape sequences: "ESC [ ... letter" sets colors and bold, and "ESC ] ... BEL"
// sets window titles and links. Git uses the first kind when color is on.
// eslint-disable-next-line no-control-regex -- matching the ESC control character is the whole point
const ANSI_ESCAPE = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;

// Copying from a web page or some terminals turns spaces into non-breaking spaces.
const NON_BREAKING_SPACE = /\u00a0/g;

// Prompts people copy along with the output: PowerShell ("PS C:\repo> git status", or a
// bare "PS>"), cmd.exe ("C:\repo>git status"), and Unix-style shells ("$ git status").
const PROMPTS = [/^PS(?: [^>]*)?>/, /^[A-Za-z]:\\[^>]*>/, /^\$ /];

// A copy that starts at the command itself, leaving the prompt in front of it behind.
const BARE_GIT_COMMAND = /^git\s/;

// What `less`, git's pager, leaves at the bottom of the screen when output is long.
const PAGER_MARKERS = new Set(['(END)', ':']);

/** Strips color codes so text copied from a colored terminal reads like plain output. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, '');
}

/** The command after a copied shell prompt, `''` for a bare prompt, or null if `line` is no prompt. */
export function promptCommand(line: string): string | null {
  for (const prompt of PROMPTS) {
    const match = prompt.exec(line);
    if (match) return line.slice(match[0].length).trim();
  }
  return null;
}

/**
 * The command a line shows was typed, whether a prompt was copied in front of it or not.
 * `''` for a bare prompt, null for anything else. No line of git's own output starts
 * with "git ", so a bare command can't be mistaken for output.
 */
function typedCommand(line: string): string | null {
  if (BARE_GIT_COMMAND.test(line)) return line.trim();
  return promptCommand(line);
}

function isBlank(line: string): boolean {
  return line.trim() === '';
}

/** Lines a copy picks up after the output: blanks, the next prompt, the pager's marker. */
function isTrailingNoise(line: string): boolean {
  return isBlank(line) || PAGER_MARKERS.has(line) || promptCommand(line) !== null;
}

/**
 * Cleans a pasted block of terminal text. Leading whitespace is kept on purpose: in
 * `git status --short`, a line starting with a space means "nothing staged".
 */
export function normalizePaste(text: string): NormalizedPaste {
  const lines = stripAnsi(text)
    .replace(NON_BREAKING_SPACE, ' ')
    .split(/\r\n|\r|\n/)
    .map((line) => line.trimEnd());

  // A copy that starts at the prompt brings the typed command along, sometimes below an
  // empty prompt or two. None of that is output, so the output starts at the first line
  // that is neither blank nor a typed command.
  const start = lines.findIndex((line) => !isBlank(line) && typedCommand(line) === null);
  const typedLines = start === -1 ? lines : lines.slice(0, start);
  // The last command typed is a useful hint about what produced the output.
  const command = typedLines.map(typedCommand).findLast((typed) => typed !== null && typed !== '');

  const end = lines.findLastIndex((line) => !isTrailingNoise(line));
  return {
    lines: start === -1 || end < start ? [] : lines.slice(start, end + 1),
    command: command ?? null,
  };
}
