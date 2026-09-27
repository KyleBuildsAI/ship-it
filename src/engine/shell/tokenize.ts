export type Token =
  | { readonly kind: 'word'; readonly value: string }
  | { readonly kind: 'redirect'; readonly append: boolean };

export class TokenizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenizeError';
  }
}

/**
 * Splits a command line into words the way PowerShell does for the commands the game
 * teaches: whitespace separates words, "double" or 'single' quotes keep spaces inside
 * one word, and `>` / `>>` redirect output to a file (with or without spaces around).
 */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let current = '';
  let inWord = false;
  let quote: '"' | "'" | null = null;

  const endWord = () => {
    if (inWord) tokens.push({ kind: 'word', value: current });
    current = '';
    inWord = false;
  };

  for (let i = 0; i < input.length; i++) {
    const char = input.charAt(i);
    if (quote !== null) {
      if (char === quote && input.charAt(i + 1) === quote) {
        // PowerShell escapes a quote inside quotes by doubling it: 'it''s' is it's.
        current += char;
        i++;
      } else if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
      inWord = true;
    } else if (char === '>') {
      endWord();
      const append = input.charAt(i + 1) === '>';
      if (append) i++;
      tokens.push({ kind: 'redirect', append });
    } else if (/\s/.test(char)) {
      endWord();
    } else {
      current += char;
      inWord = true;
    }
  }
  if (quote !== null)
    throw new TokenizeError(`missing closing ${quote === '"' ? 'double' : 'single'} quote`);
  endWord();
  return tokens;
}
