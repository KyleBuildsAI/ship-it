/*
 * The rows of a diff artifact, as a code review card reads them (DESIGN.md section 5,
 * Lessons). This file imports nothing, so the lesson schema, the review grading and the
 * diff view can all use it without an import cycle.
 */

/** The rows of a diff artifact, in order. The view numbers them from 1; this list from 0. */
export function diffRows(text: string): string[] {
  return text.split('\n');
}

// "+++ b/file" and "--- a/file" name the files a diff compares; they change no line.
const FILE_HEADER = /^(?:\+\+\+|---) /;

/** A row Kyle can flag: an added or removed line, never a file header, hunk header or context. */
export function isChangedRow(line: string): boolean {
  return /^[+-]/.test(line) && !FILE_HEADER.test(line);
}

/**
 * Code that turns a check off: a skipped or focused test, a script that can't fail, a
 * lint or type check silenced. Each is a classic way for an agent to make checks green.
 */
export const SILENCED_CHECK =
  /\.(?:skip|only)\(|\|\|\s*true\b|eslint-disable|@ts-(?:ignore|expect-error|nocheck)/;

/**
 * An added row that turns a check off. Content may never call one fine. A removed one is
 * the opposite, a check coming back, so only added rows count.
 */
export function silencesACheck(line: string): boolean {
  return line.startsWith('+') && isChangedRow(line) && SILENCED_CHECK.test(line);
}
