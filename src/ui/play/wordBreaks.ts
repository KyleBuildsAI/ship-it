/** A stretch of text, for wrapping: a word to keep on one line, or text that wraps as usual. */
export interface TextPiece {
  readonly text: string;
  /** A word holding a character a browser would break the line after. */
  readonly whole: boolean;
}

/**
 * What a browser may end a line after in the middle of a word: a hyphen or a slash. In a
 * Field Mission prompt that turned Get-Command into "Get-" at the end of one line and
 * "Command" on the next, which reads as two commands.
 */
const BREAKS_INSIDE = /[-/]/;

/**
 * Splits `text` so the panel can wrap it only at spaces (FieldView.tsx): each word that
 * holds a hyphen or slash is a piece of its own, kept whole, and everything between them
 * stays plain text. The pieces join back into exactly `text`, so text selected by hand is
 * still the real command.
 */
export function wrapAtSpaces(text: string): TextPiece[] {
  const pieces: TextPiece[] = [];
  for (const part of text.split(/(\s+)/)) {
    if (part === '') continue;
    const whole = BREAKS_INSIDE.test(part);
    const last = pieces.at(-1);
    if (!whole && last !== undefined && !last.whole) {
      pieces[pieces.length - 1] = { text: last.text + part, whole: false };
    } else {
      pieces.push({ text: part, whole });
    }
  }
  return pieces;
}
