/**
 * Git wraps a path in double quotes when printing it bare could be misread: when it has a
 * quote, a backslash, or a control character, when it has a space (short format only), or
 * when it has any non-ASCII letter (the default `core.quotePath`). Inside the quotes it
 * uses C-style escapes and writes non-ASCII letters as octal UTF-8 bytes, so `café.txt`
 * prints as `"caf\303\251.txt"`.
 */

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  a: '\u0007',
  b: '\b',
  t: '\t',
  n: '\n',
  v: '\v',
  f: '\f',
  r: '\r',
  '"': '"',
  '\\': '\\',
};

// One backslash escape (three octal digits, or any single character), or a run of plain text.
const ESCAPE_OR_TEXT = /\\([0-7]{3}|[\s\S])|[^\\]+/g;
const OCTAL_BYTE = /^[0-7]{3}$/;

/** Where the quote that closes a quoted path starting at `text[0]` is, or -1 if it never closes. */
export function closingQuote(text: string): number {
  if (!text.startsWith('"')) return -1;
  for (let i = 1; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '"') return i;
  }
  return -1;
}

/** Turns git's quoted form of a path back into the real name. Unquoted paths come back as-is. */
export function unquotePath(raw: string): string {
  if (raw.length < 2 || closingQuote(raw) !== raw.length - 1) return raw;
  const body = raw.slice(1, -1);

  // One letter can take several octal bytes. Writing every byte as %XX and handing the
  // result to decodeURIComponent reuses the standard library's UTF-8 decoder.
  let percentEncoded = '';
  for (const [whole, escape] of body.matchAll(ESCAPE_OR_TEXT)) {
    if (escape === undefined) {
      percentEncoded += encodeURIComponent(whole);
    } else if (OCTAL_BYTE.test(escape)) {
      percentEncoded += `%${parseInt(escape, 8).toString(16).padStart(2, '0')}`;
    } else {
      percentEncoded += encodeURIComponent(SIMPLE_ESCAPES[escape] ?? escape);
    }
  }

  try {
    return decodeURIComponent(percentEncoded);
  } catch (error) {
    // Bytes that aren't valid UTF-8 (a file named on an old system, say) can't become
    // letters. Git's escaped spelling is still a faithful, readable name for the file.
    if (error instanceof URIError) return body;
    throw error;
  }
}

/** Splits git's `old -> new` rename notation into both names. Null when there is no arrow. */
export function splitRename(text: string): { from: string; to: string } | null {
  // A quoted old name can itself contain " -> ", so the search starts after its closing quote.
  const arrow = text.indexOf(' -> ', Math.max(closingQuote(text), 0));
  if (arrow === -1) return null;
  return { from: unquotePath(text.slice(0, arrow)), to: unquotePath(text.slice(arrow + 4)) };
}
