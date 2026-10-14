import { normalizePaste } from './normalize';

/** One line PowerShell's Select-String found, like `README.md:12:GET /health`. */
export interface SelectStringMatch {
  /** The file as PowerShell printed it: relative, or a full path like `C:\repo\README.md`. */
  readonly path: string;
  readonly lineNumber: number;
  /** The matching line itself, as it appears in the file. */
  readonly text: string;
}

// "path:line:text". The path is matched lazily, so the colon after a drive letter in
// C:\repo\README.md isn't mistaken for the one before the line number.
const MATCH_LINE = /^(.+?):(\d+):(.*)$/;

/**
 * Reads what `Select-String -Path README.md -Pattern '...'` prints, one match per line.
 * Lines that aren't matches, like a copied command, are skipped rather than failing the
 * paste: what counts is which lines of the file matched.
 */
export function parseSelectString(text: string): SelectStringMatch[] {
  const matches: SelectStringMatch[] = [];
  for (const line of normalizePaste(text).lines) {
    const found = MATCH_LINE.exec(line);
    if (found === null) continue;
    const [, path = '', lineNumber = '0', content = ''] = found;
    matches.push({ path: path.trim(), lineNumber: Number(lineNumber), text: content });
  }
  return matches;
}

/** True when the match came from a file with this name, in whatever folder, any case. */
export function isFromFile(match: SelectStringMatch, fileName: string): boolean {
  const name = match.path.slice(
    Math.max(match.path.lastIndexOf('/'), match.path.lastIndexOf('\\')) + 1,
  );
  return name.toLowerCase() === fileName.toLowerCase();
}

// An HTTP method, a space, then a path that starts with a slash: "GET /health". The path
// stops at a backtick, since READMEs often write it as code.
const REQUEST_LINE = /\b(?:GET|POST|PUT|PATCH|DELETE) \/[^\s`]*/;

// A status code is three digits from 100 to 599, standing alone, so a year, a port like
// 3000 or a version like 1.204.3 doesn't count. A full stop after it still does.
const STATUS_CODE = /(?<![\d.])[1-5]\d\d(?!\d|\.\d)/;

/** What a README's lines show about one documented request. */
export interface DocumentedRequest {
  /** The first line naming a method and path, like `GET /health`, or null. */
  readonly request: string | null;
  /** The first status code mentioned, like `200`, or null. */
  readonly statusCode: string | null;
}

/**
 * Looks through matched lines for the two things a documented request needs: the method
 * and path, and the status code that says how it went. The example JSON can't be checked
 * this way, since any shape is fine, so Kyle checks that against the real app himself.
 */
export function documentedRequest(lines: readonly string[]): DocumentedRequest {
  let request: string | null = null;
  let statusCode: string | null = null;
  for (const line of lines) {
    request ??= REQUEST_LINE.exec(line)?.[0] ?? null;
    statusCode ??= STATUS_CODE.exec(line)?.[0] ?? null;
  }
  return { request, statusCode };
}
