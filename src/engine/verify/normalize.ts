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

  const firstContent = lines.findIndex((line) => !isBlank(line));
  if (firstContent === -1) return { lines: [], command: null };

  // A copy that starts at the prompt brings the typed command along. It isn't output,
  // but it is a useful hint about what produced the output.
  const typed = promptCommand(lines[firstContent] ?? '');
  if (typed !== null) lines.splice(firstContent, 1);

  const start = lines.findIndex((line) => !isBlank(line));
  const end = lines.findLastIndex((line) => !isTrailingNoise(line));
  return {
    lines: end === -1 ? [] : lines.slice(start, end + 1),
    command: typed === '' ? null : typed,
  };
}
