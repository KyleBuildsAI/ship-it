import type { LexToken, WordPart } from './lex';

/**
 * A command's word after variables expand: `-Name` (maybe with `-Name:value`), or a value.
 * Values joined by commas arrive as one value with several items: node, npm.
 */
export type Arg =
  | { readonly kind: 'parameter'; readonly name: string; readonly value: readonly string[] | null }
  | { readonly kind: 'value'; readonly items: readonly string[] };

/** A command PowerShell refuses before it runs, like a parameter it doesn't have. */
export interface BindError {
  readonly ok: false;
  /** PowerShell's own wording, without the "Cmdlet-Name: " in front. */
  readonly message: string;
  readonly hints: readonly string[];
}

export function bindError(message: string, ...hints: string[]): BindError {
  return { ok: false, message, hints };
}

/**
 * -Force is a parameter; '-Force', -1 and --force are values, as PowerShell reads them.
 * PowerShell also accepts the long dashes a word processor swaps in: –Force and —Force.
 */
const PARAMETER = /^[-–—―]([\p{L}_?][^:]*)(?::(.*))?$/su;

const MISSING_AFTER_COMMA = "Missing expression after ','.";

/**
 * Turns a command's words and commas into Args. `expand` gives a variable's value. Only a
 * word whose start was typed bare can be a parameter, so '-Force' in quotes stays text.
 */
export function toArgs(
  tokens: readonly LexToken[],
  expand: (name: string) => string,
): Arg[] | BindError {
  const text = (parts: readonly WordPart[]) =>
    parts.map((part) => (part.kind === 'text' ? part.text : expand(part.name))).join('');
  const args: Arg[] = [];
  let joining = false;
  for (const token of tokens) {
    if (token.kind === 'comma') {
      const last = args.at(-1);
      if (joining || last === undefined || (last.kind === 'parameter' && last.value === null))
        return bindError(MISSING_AFTER_COMMA);
      joining = true;
      continue;
    }
    if (token.kind !== 'word') throw new Error(`toArgs takes words and commas, not ${token.kind}`);
    const last = args.at(-1);
    if (joining && last !== undefined) {
      args[args.length - 1] = withItem(last, text(token.parts));
      joining = false;
      continue;
    }
    const [first, ...rest] = token.parts;
    const match = first?.kind === 'text' && !first.quoted ? PARAMETER.exec(first.text) : null;
    const name = match?.[1];
    const attached = match?.[2];
    if (name !== undefined && (rest.length === 0 || attached !== undefined)) {
      // -Path:value carries its value. A bare -Path: waits for the next word, like -Path.
      const value = attached === undefined ? '' : attached + text(rest);
      const waits = attached === undefined || (value === '' && rest.length === 0);
      args.push({ kind: 'parameter', name, value: waits ? null : [value] });
    } else {
      args.push({ kind: 'value', items: [text(token.parts)] });
    }
  }
  return joining ? bindError(MISSING_AFTER_COMMA) : args;
}

function withItem(arg: Arg, item: string): Arg {
  if (arg.kind === 'value') return { kind: 'value', items: [...arg.items, item] };
  return { ...arg, value: [...(arg.value ?? []), item] };
}
