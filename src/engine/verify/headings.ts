import { normalizePaste } from './normalize';

/*
 * Reads the Markdown headings of a file from what PowerShell's Select-String prints, so a
 * Field Mission can check a document's shape without a GitHub token. Piped input, as in
 * `git show HEAD:docs/story.md | Select-String '^## '`, prints just the matching lines.
 * Run with -Path, it puts `file:line:` in front of each, so that prefix is allowed too.
 */

// An optional `docs\story.md:3:` prefix, then the hashes, then the heading's words.
const HEADING_LINE = /^(?:.*?:\d+:)?\s*(#{1,6})\s+(.*\S)\s*$/;

/** The text of every heading at `level` (2 for `##`) in a Select-String paste, in order. */
export function parseMarkdownHeadings(text: string, level = 2): string[] {
  const headings: string[] = [];
  for (const line of normalizePaste(text).lines) {
    const match = HEADING_LINE.exec(line);
    const hashes = match?.[1];
    const words = match?.[2];
    if (hashes?.length === level && words !== undefined) headings.push(words);
  }
  return headings;
}

export interface HeadingProblems {
  /** Wanted headings that appear nowhere in the paste. */
  readonly missing: readonly string[];
  /** Wanted headings that are there, but not in the wanted order. */
  readonly outOfOrder: readonly string[];
}

/** Headings compare without case or a trailing colon, the two ways an agent drifts most. */
function sameHeading(a: string, b: string): boolean {
  const plain = (heading: string) => heading.replace(/:$/, '').trim().toLowerCase();
  return plain(a) === plain(b);
}

/**
 * How `found` falls short of `wanted`. Other headings may sit between the wanted ones, so
 * a story with an extra "## Links" section still passes; only order and presence matter.
 */
export function headingProblems(
  found: readonly string[],
  wanted: readonly string[],
): HeadingProblems {
  const missing: string[] = [];
  const outOfOrder: string[] = [];
  let next = 0;
  for (const heading of wanted) {
    const at = found.findIndex(
      (candidate, index) => index >= next && sameHeading(candidate, heading),
    );
    if (at !== -1) {
      next = at + 1;
    } else if (found.some((candidate) => sameHeading(candidate, heading))) {
      outOfOrder.push(heading);
    } else {
      missing.push(heading);
    }
  }
  return { missing, outOfOrder };
}
