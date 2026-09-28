import type { LexToken, WordPart } from './lex';

/**
 * A command's word after variables expand: `-Name` (maybe with `-Name:value`), or a value.
 * Values joined by commas arrive as one value with several items: node, npm.
 */
export type Arg =
  | {
      readonly kind: 'parameter';
      readonly name: string;
      readonly value: readonly string[] | null;
      /**
       * Set when the value after the colon was $true, $false, $null or a bare number: the
       * only values a switch takes. -Force:$false is off, but -Force:false is text, and
       * PowerShell refuses it.
       */
      readonly switchValue?: boolean | number;
    }
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

/** A number as PowerShell reads one bare: 1, +2, 1.5, 0x10. */
const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+|0x[0-9a-f]+)$/i;

// PowerShell's parser messages for a comma with nothing on one side.
const MISSING_ARGUMENT = 'Missing argument in parameter list.';
const MISSING_AFTER_COMMA = "Missing expression after ',' in pipeline element.";

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
  // After a bare `-Name:`, the next word is its value, even one that starts with -.
  let colonWaiting = false;
  for (const token of tokens) {
    const last = args.at(-1);
    if (token.kind === 'comma') {
      if (joining) return bindError(MISSING_AFTER_COMMA);
      if (last === undefined || colonWaiting || (last.kind === 'parameter' && last.value === null))
        return bindError(MISSING_ARGUMENT);
      joining = true;
      continue;
    }
    if (token.kind !== 'word') throw new Error(`toArgs takes words and commas, not ${token.kind}`);
    if (joining && last !== undefined) {
      args[args.length - 1] = withItem(last, text(token.parts));
      joining = false;
      continue;
    }
    if (colonWaiting && last?.kind === 'parameter') {
      args[args.length - 1] = attach(last.name, token.parts, text);
      colonWaiting = false;
      continue;
    }
    const [first, ...rest] = token.parts;
    const match = first?.kind === 'text' && !first.quoted ? PARAMETER.exec(first.text) : null;
    const name = match?.[1];
    const attached = match?.[2];
    if (name === undefined || (rest.length > 0 && attached === undefined)) {
      args.push({ kind: 'value', items: [text(token.parts)] });
    } else if (attached === undefined) {
      args.push({ kind: 'parameter', name, value: null });
    } else if (attached === '' && rest.length === 0) {
      args.push({ kind: 'parameter', name, value: null });
      colonWaiting = true;
    } else {
      const valueParts: WordPart[] =
        attached === '' ? rest : [{ kind: 'text', text: attached, quoted: false }, ...rest];
      args.push(attach(name, valueParts, text));
    }
  }
  if (joining)
    return bindError(
      MISSING_AFTER_COMMA,
      'Finish the list on this line, or remove the last comma.',
    );
  return args;
}

function attach(
  name: string,
  parts: readonly WordPart[],
  text: (parts: readonly WordPart[]) => string,
): Arg {
  const switchValue = switchValueOf(parts);
  const value = [text(parts)];
  return switchValue === undefined
    ? { kind: 'parameter', name, value }
    : { kind: 'parameter', name, value, switchValue };
}

/** $true, $false and $null, or a bare number, are values a switch accepts. */
function switchValueOf(parts: readonly WordPart[]): boolean | number | undefined {
  const [only] = parts;
  if (only === undefined || parts.length > 1) return undefined;
  if (only.kind === 'variable') {
    const name = only.name.toLowerCase();
    if (name === 'true') return true;
    return name === 'false' || name === 'null' ? false : undefined;
  }
  if (only.quoted || !NUMBER.test(only.text)) return undefined;
  const hex = /^([+-]?)0x(.+)$/i.exec(only.text);
  return hex ? Number.parseInt(`${hex[1] ?? ''}${hex[2] ?? ''}`, 16) : Number(only.text);
}

function withItem(arg: Arg, item: string): Arg {
  if (arg.kind === 'value') return { kind: 'value', items: [...arg.items, item] };
  return { kind: 'parameter', name: arg.name, value: [...(arg.value ?? []), item] };
}
