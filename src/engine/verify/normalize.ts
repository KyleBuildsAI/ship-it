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
const PROMPTS = [/^PS(?: [^>]*)?>(.*)$/, /^[A-Za-z]:\\[^>]*>(.*)$/, /^\$ (.*)$/];

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
    if (match) return (match[1] ?? '').trim();
  }
  return null;
}

function isBlank(line: string): boolean {
  return line.trim() === '';
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

  let command: string | null = null;
  const firstContent = lines.findIndex((line) => !isBlank(line));
  const typed = firstContent === -1 ? null : promptCommand(lines[firstContent] ?? '');
  if (typed !== null) {
    command = typed === '' ? null : typed;
    lines.splice(firstContent, 1);
  }

  // The bottom of a copy often catches the next prompt or the pager's marker. Blank lines
  // go too, since git never ends its output with one that matters.
  while (lines.length > 0) {
    const last = lines[lines.length - 1] ?? '';
    if (isBlank(last) || PAGER_MARKERS.has(last) || promptCommand(last) !== null) lines.pop();
    else break;
  }
  while (lines.length > 0 && isBlank(lines[0] ?? '')) lines.shift();

  return { lines, command };
}
