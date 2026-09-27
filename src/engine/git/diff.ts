export interface DiffLine {
  /** ' ' unchanged, '-' only in the old version, '+' only in the new one. */
  readonly kind: ' ' | '-' | '+';
  /** The line's text, including its '\n' unless it is a last line without one. */
  readonly text: string;
}

export interface Hunk {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly lines: readonly DiffLine[];
}

/** Past this many line comparisons, show the whole file as replaced instead of searching. */
const MAX_CELLS = 4_000_000;

/**
 * Splits content into lines that keep their '\n'. A last line without one stays
 * different from the same text with one, so "No newline at end of file" shows up.
 */
export function splitLines(content: string): string[] {
  if (content === '') return [];
  const lines = content.split('\n').map((text) => `${text}\n`);
  if (content.endsWith('\n')) lines.pop();
  else lines[lines.length - 1] = (lines.at(-1) ?? '').slice(0, -1);
  return lines;
}

/**
 * The shortest edit from `before` to `after`, found with the longest common subsequence.
 * Walking the table front to back and preferring deletions puts each run of removed
 * lines before the added lines that replace them, the way git prints a change.
 */
export function diffLines(before: readonly string[], after: readonly string[]): DiffLine[] {
  const n = before.length;
  const m = after.length;
  if (n * m > MAX_CELLS) {
    return [
      ...before.map((text): DiffLine => ({ kind: '-', text })),
      ...after.map((text): DiffLine => ({ kind: '+', text })),
    ];
  }

  // common[i * (m + 1) + j] = length of the longest common subsequence of before[i..] and after[j..].
  const width = m + 1;
  const common = new Int32Array((n + 1) * width);
  const at = (i: number, j: number) => common[i * width + j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      common[i * width + j] =
        before[i] === after[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  const script: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const oldLine = before[i];
    const newLine = after[j];
    if (i < n && j < m && oldLine === newLine) {
      script.push({ kind: ' ', text: oldLine ?? '' });
      i++;
      j++;
    } else if (j >= m || (i < n && at(i + 1, j) >= at(i, j + 1))) {
      script.push({ kind: '-', text: oldLine ?? '' });
      i++;
    } else {
      script.push({ kind: '+', text: newLine ?? '' });
      j++;
    }
  }
  return script;
}

/** Groups an edit script into hunks with `context` unchanged lines around each change. */
export function buildHunks(script: readonly DiffLine[], context = 3): Hunk[] {
  const changed = script.flatMap((line, index) => (line.kind === ' ' ? [] : [index]));
  const hunks: Hunk[] = [];
  let cursor = 0;

  while (cursor < changed.length) {
    const first = changed[cursor] ?? 0;
    let last = first;
    // Changes closer than two contexts apart share one hunk, as in git.
    while (cursor + 1 < changed.length && (changed[cursor + 1] ?? 0) - last <= context * 2 + 1) {
      cursor++;
      last = changed[cursor] ?? last;
    }
    cursor++;

    const start = Math.max(0, first - context);
    const end = Math.min(script.length, last + context + 1);
    const before = script.slice(0, start);
    const lines = script.slice(start, end);
    const oldBefore = before.filter((line) => line.kind !== '+').length;
    const newBefore = before.filter((line) => line.kind !== '-').length;
    const oldCount = lines.filter((line) => line.kind !== '+').length;
    const newCount = lines.filter((line) => line.kind !== '-').length;
    hunks.push({
      // An empty side starts at the line before it, which is 0 at the top of a file.
      oldStart: oldCount === 0 ? oldBefore : oldBefore + 1,
      oldCount,
      newStart: newCount === 0 ? newBefore : newBefore + 1,
      newCount,
      lines,
    });
  }
  return hunks;
}

/** Added and removed line counts, for "3 insertions(+), 1 deletion(-)" summaries. */
export function countChanges(
  before: string,
  after: string,
): { insertions: number; deletions: number } {
  const script = diffLines(splitLines(before), splitLines(after));
  return {
    insertions: script.filter((line) => line.kind === '+').length,
    deletions: script.filter((line) => line.kind === '-').length,
  };
}
