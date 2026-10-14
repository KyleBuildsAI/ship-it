/**
 * One piece of a word. Text is final: quotes are gone and backtick escapes are applied.
 * `quoted` matters to the parameter binder: -Force is a parameter, but '-Force' and
 * `-Force are just text. So text from quotes or from a backtick escape is quoted.
 * A variable is only named here; the shell expands it later, because only the terminal
 * tab knows its value.
 */
export type WordPart =
  | { readonly kind: 'text'; readonly text: string; readonly quoted: boolean }
  | { readonly kind: 'variable'; readonly name: string };

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
    }
  /** 2>&1 sends errors wherever the output goes: npm test 2>&1 > log.txt. */
  | { readonly kind: 'merge' };

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

/**
 * Characters that end a bare word, because each starts a token of its own. Not >: in
 * PowerShell, echo hi>>a.txt prints hi>>a.txt. A redirect starts its own token.
 */
const WORD_END = new Set(['|', ';', ',', '(', ')', '&', '{', '}']);

/** PowerShell also reads the curly quotes that web pages and chat apps paste as quotes. */
const SINGLE_QUOTES = new Set(["'", '\u2018', '\u2019', '\u201A', '\u201B']);
const DOUBLE_QUOTES = new Set(['"', '\u201C', '\u201D', '\u201E']);

/** A redirect: > or >> alone, or after a stream number, like 2> for errors. */
const REDIRECT = /^[1-6*]?>/;

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

/**
 * A variable's name: letters, digits, _ and ? ($name? is one name in PowerShell 7). A name
 * followed by a colon and more name is drive-qualified, like $env:Path; after the drive,
 * a single colon stays in the name and :: ends it.
 */
const VARIABLE = /^[\p{L}\p{Nd}_?]+(?::(?=[\p{L}\p{Nd}_?])(?:[\p{L}\p{Nd}_?]|:(?!:))*)?/u;

const isSpace = (char: string) => /\s/.test(char);

/**
 * Splits a line into tokens the way PowerShell reads a command line. 'Single quotes' keep
 * text exactly ('' is one quote). "Double quotes" name variables and apply backtick
 * escapes (`n, `t, `", `$). Outside quotes, whitespace separates words, $name is a
 * variable, a backtick escapes the next character, and # starts a comment. A word that
 * starts with a quote ends where the quote closes, so "C:\Program Files"\nodejs is two
 * words, as in PowerShell. Throws a LexError for an unclosed quote and for syntax this
 * sandbox doesn't run, like { } and $( ).
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
    } else if (WORD_END.has(char) || REDIRECT.test(input.slice(index, index + 2))) {
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
      // > >> 1> 1>> 2> 2>>
      const numbered = char !== '>';
      if (numbered && char !== '1' && char !== '2')
        throw new LexError(
          `This sandbox doesn't redirect stream ${char}.`,
          'Redirect output with > or >>, and errors with 2> or 2>>.',
        );
      const stream = char === '2' ? 'error' : 'output';
      const arrow = numbered ? start + 1 : start;
      // 2>&1 is one token, so 2>&1x is 2>&1 then x. PowerShell reserves the other pairs of
      // 1 and 2; any other & after the arrow is a missing file (all checked in 7.6.6).
      const into = input.charAt(arrow + 2);
      if (numbered && input.charAt(arrow + 1) === '&' && (into === '1' || into === '2')) {
        if (char === '2' && into === '1') return { token: { kind: 'merge' }, end: arrow + 3 };
        throw new LexError(
          `The '${char}>&${into}' operator is reserved for future use.`,
          'To send errors where the output goes, use 2>&1.',
        );
      }
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

  variable(name: string): void {
    this.parts.push({ kind: 'variable', name });
  }
}

function readWord(input: string, start: number): { parts: WordPart[]; end: number } {
  const parts = new PartList();
  let index = start;
  while (index < input.length) {
    const char = input.charAt(index);
    if (isSpace(char) || WORD_END.has(char)) break;
    if (SINGLE_QUOTES.has(char) || DOUBLE_QUOTES.has(char)) {
      const opensWord = index === start;
      index = SINGLE_QUOTES.has(char)
        ? readSingleQuoted(input, index, parts)
        : readDoubleQuoted(input, index, parts);
      // "a"b is two words, but a"b" is one: only a leading quote ends the word.
      if (opensWord) break;
    } else if (char === '`') {
      index = readEscape(input, index, parts);
    } else if (char === '$') {
      index = readVariable(input, index, parts, false);
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
    const next = input.charAt(index + 1);
    if (SINGLE_QUOTES.has(char) && SINGLE_QUOTES.has(next)) {
      // A doubled quote is one quote: 'it''s' is it's.
      text += next;
      index += 2;
    } else if (SINGLE_QUOTES.has(char)) {
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
    const next = input.charAt(index + 1);
    if (DOUBLE_QUOTES.has(char) && DOUBLE_QUOTES.has(next)) {
      parts.text(next, true);
      index += 2;
    } else if (DOUBLE_QUOTES.has(char)) {
      return index + 1;
    } else if (char === '`') {
      index = readEscape(input, index, parts);
    } else if (char === '$') {
      index = readVariable(input, index, parts, true);
    } else {
      parts.text(char, true);
      index++;
    }
  }
}

function readEscape(input: string, start: number, parts: PartList): number {
  const next = input.charAt(start + 1);
  if (next === '')
    throw new LexError(
      'A backtick at the end of a line continues it on the next one.',
      'This sandbox runs one line at a time, so remove the ` at the end.',
    );
  parts.text(ESCAPES[next] ?? next, true);
  return start + 2;
}

/** A variable, or a plain $ when no name follows it (echo $ prints $). */
function readVariable(input: string, start: number, parts: PartList, quoted: boolean): number {
  const next = input.charAt(start + 1);
  if (next === '(') throw scriptBlocks();
  if (next === '{') return readBracedVariable(input, start, parts);
  if (next === '$' || next === '^') {
    parts.variable(next);
    return start + 2;
  }
  const name = VARIABLE.exec(input.slice(start + 1))?.[0];
  if (name === undefined) {
    parts.text('$', quoted);
    return start + 1;
  }
  const end = start + 1 + name.length;
  // "$HOME:" reads as a drive with no name after it, which PowerShell refuses.
  if (input.charAt(end) === ':' && input.charAt(end + 1) !== ':')
    throw new LexError(
      "Variable reference is not valid. ':' was not followed by a valid variable name character. Consider using ${} to delimit the name.",
      `Put the name in braces so the colon stays text: \${${name}}:`,
    );
  parts.variable(name);
  return end;
}

/** ${name}: any characters up to the closing brace, like ${env:ProgramFiles(x86)}. */
function readBracedVariable(input: string, start: number, parts: PartList): number {
  const close = input.indexOf('}', start + 2);
  if (close === -1)
    throw new LexError(
      "The variable name that starts with ${ is missing its closing '}'.",
      'Close it like this: ${env:ProgramFiles(x86)}',
    );
  if (close === start + 2)
    throw new LexError(
      'An empty ${} variable reference was found. A name is required inside the braces.',
      'Put the name inside the braces: ${HOME}',
    );
  parts.variable(input.slice(start + 2, close));
  return close + 1;
}

function unterminated(quote: string): LexError {
  return new LexError(
    `The string is missing the terminator: ${quote}.`,
    'Close the quote and try again.',
  );
}
