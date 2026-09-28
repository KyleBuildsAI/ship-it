/**
 * One piece of a word. Text is final: quotes are gone and backtick escapes are applied.
 * `quoted` matters to the parameter binder: -Force is a parameter, but '-Force' is just
 * text.
 */
export interface WordPart {
  readonly kind: 'text';
  readonly text: string;
  readonly quoted: boolean;
}

export type LexToken =
  | { readonly kind: 'word'; readonly parts: readonly WordPart[] }
  /** | sends one command's output into the next. */
  | { readonly kind: 'pipe' }
  /** ; ends a statement, so the next command runs after it. */
  | { readonly kind: 'end' }
  /** , separates the items of a list: Get-Command node, npm. */
  | { readonly kind: 'comma' }
  | { readonly kind: 'open' }
  | { readonly kind: 'close' }
  /** & runs a command named by a string or path: & 'C:\Program Files\nodejs\node.exe'. */
  | { readonly kind: 'call' }
  /** > and >> write output to a file; 2> and 2>> write errors to one. */
  | {
      readonly kind: 'redirect';
      readonly stream: 'output' | 'error';
      readonly append: boolean;
    };

/** A line the shell can't run, with PowerShell's message and a hint about what to type. */
export class LexError extends Error {
  readonly hint: string;

  constructor(message: string, hint: string) {
    super(message);
    this.name = 'LexError';
    this.hint = hint;
  }
}

const scriptBlocks = () =>
  new LexError(
    "This sandbox doesn't run script blocks.",
    "Try naming what you want, like: Get-Process node. Text with { } in it needs quotes: 'HEAD@{1}'.",
  );

/** Characters that end a bare word, because each starts a token of its own. */
const WORD_END = new Set(['|', ';', ',', '(', ')', '&', '>', '{', '}']);

/** What a backtick turns the next character into. Any other character stays as it is. */
const ESCAPES: Readonly<Record<string, string>> = {
  '0': '\0',
  a: '\x07',
  b: '\b',
  e: '\x1b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
};

const isSpace = (char: string) => /\s/.test(char);

/**
 * Splits a line into tokens the way PowerShell reads a command line. 'Single quotes' keep
 * text exactly ('' is one quote). "Double quotes" apply backtick escapes (`n, `t, `").
 * Outside quotes, whitespace separates words, a backtick escapes the next character, and
 * # starts a comment. Throws a LexError for an unclosed quote and for syntax this sandbox
 * doesn't run, like { }.
 */
export function lex(input: string): LexToken[] {
  const tokens: LexToken[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input.charAt(index);
    if (isSpace(char)) {
      index++;
    } else if (char === '#') {
      break;
    } else if (WORD_END.has(char) || (char === '2' && input.charAt(index + 1) === '>')) {
      const operator = readOperator(input, index);
      tokens.push(operator.token);
      index = operator.end;
    } else {
      const word = readWord(input, index);
      tokens.push({ kind: 'word', parts: word.parts });
      index = word.end;
    }
  }
  return tokens;
}

function readOperator(input: string, start: number): { token: LexToken; end: number } {
  const char = input.charAt(start);
  const single = (token: LexToken) => ({ token, end: start + 1 });
  switch (char) {
    case '|':
      return single({ kind: 'pipe' });
    case ';':
      return single({ kind: 'end' });
    case ',':
      return single({ kind: 'comma' });
    case '(':
      return single({ kind: 'open' });
    case ')':
      return single({ kind: 'close' });
    case '&':
      return single({ kind: 'call' });
    case '{':
    case '}':
      throw scriptBlocks();
    default: {
      // > >> 2> 2>>
      const stream = char === '2' ? 'error' : 'output';
      const arrow = char === '2' ? start + 1 : start;
      const append = input.charAt(arrow + 1) === '>';
      return { token: { kind: 'redirect', stream, append }, end: arrow + (append ? 2 : 1) };
    }
  }
}

/** Collects a word's parts, joining neighbouring text that was quoted the same way. */
class PartList {
  readonly parts: WordPart[] = [];

  text(text: string, quoted: boolean): void {
    const last = this.parts.at(-1);
    if (last?.kind === 'text' && last.quoted === quoted) {
      this.parts[this.parts.length - 1] = { kind: 'text', text: last.text + text, quoted };
    } else {
      this.parts.push({ kind: 'text', text, quoted });
    }
  }
}

function readWord(input: string, start: number): { parts: WordPart[]; end: number } {
  const parts = new PartList();
  let index = start;
  while (index < input.length) {
    const char = input.charAt(index);
    if (isSpace(char) || WORD_END.has(char)) break;
    if (char === "'") {
      index = readSingleQuoted(input, index, parts);
    } else if (char === '"') {
      index = readDoubleQuoted(input, index, parts);
    } else if (char === '`') {
      index = readEscape(input, index, parts, false);
    } else {
      parts.text(char, false);
      index++;
    }
  }
  return { parts: parts.parts, end: index };
}

function readSingleQuoted(input: string, start: number, parts: PartList): number {
  let text = '';
  let index = start + 1;
  for (;;) {
    if (index >= input.length) throw unterminated("'");
    const char = input.charAt(index);
    if (char === "'" && input.charAt(index + 1) === "'") {
      text += "'";
      index += 2;
    } else if (char === "'") {
      parts.text(text, true);
      return index + 1;
    } else {
      text += char;
      index++;
    }
  }
}

function readDoubleQuoted(input: string, start: number, parts: PartList): number {
  // An empty "" is still a word: echo "" > empty.txt writes an empty line.
  parts.text('', true);
  let index = start + 1;
  for (;;) {
    if (index >= input.length) throw unterminated('"');
    const char = input.charAt(index);
    if (char === '"' && input.charAt(index + 1) === '"') {
      parts.text('"', true);
      index += 2;
    } else if (char === '"') {
      return index + 1;
    } else if (char === '`') {
      index = readEscape(input, index, parts, true);
    } else {
      parts.text(char, true);
      index++;
    }
  }
}

function readEscape(input: string, start: number, parts: PartList, quoted: boolean): number {
  const next = input.charAt(start + 1);
  if (next === '')
    throw new LexError(
      'A backtick at the end of a line continues it on the next one.',
      'This sandbox runs one line at a time, so remove the ` at the end.',
    );
  parts.text(ESCAPES[next] ?? next, quoted);
  return start + 2;
}

function unterminated(quote: string): LexError {
  return new LexError(
    `The string is missing the terminator: ${quote}.`,
    'Close the quote and try again.',
  );
}
