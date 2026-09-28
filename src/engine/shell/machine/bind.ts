import { bindError, type Arg, type BindError } from './args';

/** The .NET types PowerShell names in its errors, for the types this sandbox binds. */
const DOTNET_TYPE = {
  switch: 'System.Management.Automation.SwitchParameter',
  string: 'System.String',
  'string[]': 'System.String[]',
  int: 'System.Int32',
  'int[]': 'System.Int32[]',
  uint: 'System.UInt32',
} as const;

export type ParamType = keyof typeof DOTNET_TYPE;

export interface ParamSpec {
  readonly name: string;
  readonly type: ParamType;
  /** Where a bare value lands: 0 takes the first one. Omitted means it must be named. */
  readonly position?: number;
  /** Other names for the parameter, like -ea for -ErrorAction. Like names, they shorten. */
  readonly aliases?: readonly string[];
  /**
   * A parameter the drive's provider adds, like Get-ChildItem's -File. A shortened name
   * matches the cmdlet's own parameters first: -fi is -Filter, and only -file is -File.
   */
  readonly provider?: boolean;
  /**
   * Takes every bare value left over, like Write-Output's -InputObject: echo a b prints
   * both. Only a list parameter can.
   */
  readonly remaining?: boolean;
}

export interface CmdletSpec {
  readonly name: string;
  /** In the cmdlet's own order, which PowerShell also uses when it lists matches. */
  readonly parameters: readonly ParamSpec[];
}

/** The values a command was given, by parameter name. */
export class Bound {
  private readonly values: ReadonlyMap<string, readonly string[] | boolean>;

  constructor(values: ReadonlyMap<string, readonly string[] | boolean>) {
    this.values = values;
  }

  has(name: string): boolean {
    return this.values.has(name);
  }

  flag(name: string): boolean {
    return this.values.get(name) === true;
  }

  text(name: string): string | null {
    return this.texts(name)?.[0] ?? null;
  }

  texts(name: string): readonly string[] | null {
    const value = this.values.get(name);
    return value === undefined || typeof value === 'boolean' ? null : value;
  }

  /** A number parameter's values, already checked and converted by bind(). */
  numbers(name: string): readonly number[] | null {
    return this.texts(name)?.map(Number) ?? null;
  }
}

type ParameterArg = Extract<Arg, { kind: 'parameter' }>;

/** The words typed just before a bare value, for the hint when a path splits at a space. */
interface Previous {
  readonly words: readonly string[];
  /** Where the last of them went, if it was named. Null: it landed by position. */
  readonly parameter: ParamSpec | null;
}

type Unbound =
  | { readonly kind: 'unknown'; readonly name: string }
  | {
      readonly kind: 'value';
      readonly items: readonly string[];
      readonly previous: Previous | null;
    };

/** A bare value typed straight after the words before it: part of the same run. */
function followedBy(previous: Previous | null, items: readonly string[]): Previous {
  return { words: [...(previous?.words ?? []), items.join(',')], parameter: null };
}

const isBindError = (value: unknown): value is BindError =>
  typeof value === 'object' && value !== null && 'ok' in value;

/**
 * Matches Args to a cmdlet's parameters the way PowerShell does: names ignore case and
 * may be shortened to any unambiguous start (-Rec for -Recurse), switches take no value,
 * and bare values fill the positional parameters in order. It works in PowerShell's
 * passes, so when a line has several mistakes, the one reported is PowerShell's:
 *   1. names, taking their values (ambiguous names and missing values stop here);
 *   2. the named values (a parameter given twice, a value of the wrong type);
 *   3. bare values into positions;
 *   4. whatever is left: an unknown name, or a value with no position to go to.
 */
export function bind(
  spec: CmdletSpec,
  args: readonly Arg[],
): { ok: true; bound: Bound } | BindError {
  const named: { parameter: ParamSpec; arg: ParameterArg; value: readonly string[] }[] = [];
  const unbound: Unbound[] = [];
  let previous: Previous | null = null;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined) break;
    if (arg.kind === 'value') {
      unbound.push({ kind: 'value', items: arg.items, previous });
      previous = followedBy(previous, arg.items);
      continue;
    }
    const match = matchParameter(spec, arg.name);
    if (match === 'none') {
      unbound.push({ kind: 'unknown', name: arg.name });
      previous = null;
      continue;
    }
    if (isBindError(match)) return match;
    if (match.type === 'switch') {
      named.push({ parameter: match, arg, value: [] });
      previous = null;
      continue;
    }
    let value = arg.value;
    const next = args[index + 1];
    // A value is missing only if a real parameter follows. PowerShell takes any other
    // -word as text: cd -Path -Force looks for a folder called -Force.
    if (value === null && next?.kind === 'value') {
      value = next.items;
    } else if (value === null && next?.kind === 'parameter' && next.value === null) {
      const following = matchParameter(spec, next.name);
      if (following === 'none') value = [`-${next.name}`];
      else if (isBindError(following)) return following;
    }
    if (value === null)
      return bindError(
        `Missing an argument for parameter '${match.name}'. Specify a parameter of type '${DOTNET_TYPE[match.type]}' and try again.`,
      );
    if (arg.value === null) index++;
    named.push({ parameter: match, arg, value });
    previous = { words: [value.join(',')], parameter: match };
  }

  const values = new Map<string, readonly string[] | boolean>();
  for (const { parameter, arg, value } of named) {
    if (values.has(parameter.name))
      return bindError(
        `Cannot bind parameter because parameter '${parameter.name}' is specified more than once. To provide multiple values to parameters that can accept multiple values, use the array syntax. For example, "-parameter value1,value2,value3".`,
      );
    const checked =
      parameter.type === 'switch' ? readSwitch(parameter, arg) : checkValue(parameter, value);
    if (isBindError(checked)) return checked;
    values.set(parameter.name, checked);
  }

  const open = spec.parameters
    .filter((parameter) => parameter.position !== undefined && !values.has(parameter.name))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const leftover: Unbound[] = [];
  let filled = 0;
  for (let index = 0; index < unbound.length; index++) {
    const entry = unbound[index];
    if (entry === undefined) break;
    if (entry.kind === 'unknown') {
      // An unknown name keeps the value after it, as PowerShell would have bound it there.
      leftover.push(entry);
      const next = unbound[index + 1];
      if (next?.kind === 'value') {
        leftover.push(next);
        index++;
      }
      continue;
    }
    const parameter = open[filled];
    if (parameter === undefined) {
      leftover.push(...unbound.slice(index));
      break;
    }
    filled++;
    const items = parameter.remaining === true ? takeRemaining(unbound, index) : entry.items;
    if (parameter.remaining === true) index = unbound.length;
    const checked = checkValue(parameter, items);
    if (isBindError(checked)) return checked;
    values.set(parameter.name, checked);
  }

  const [first] = leftover;
  if (first?.kind === 'unknown')
    return bindError(
      `A parameter cannot be found that matches parameter name '${first.name}'.`,
      ...combinedFlagsHint(spec, first.name),
    );
  if (first?.kind === 'value') return positionalFailure(leftover, open[filled - 1] ?? null);
  return { ok: true, bound: new Bound(values) };
}

/**
 * Everything from here on, for a parameter that takes the rest. An unknown -name goes in
 * as text too: Write-Output a -zz prints a and -zz.
 */
function takeRemaining(unbound: readonly Unbound[], from: number): string[] {
  return unbound
    .slice(from)
    .flatMap((entry) => (entry.kind === 'value' ? entry.items : [`-${entry.name}`]));
}

/**
 * A typed name to a parameter: an exact name or alias wins; otherwise the start of a name,
 * then of an alias, among the cmdlet's own parameters and then the provider's.
 */
function matchParameter(spec: CmdletSpec, typed: string): ParamSpec | BindError | 'none' {
  const lower = typed.toLowerCase();
  const exact = spec.parameters.find(
    (parameter) =>
      parameter.name.toLowerCase() === lower ||
      parameter.aliases?.some((alias) => alias.toLowerCase() === lower) === true,
  );
  if (exact) return exact;
  for (const provider of [false, true]) {
    const tier = spec.parameters.filter((parameter) => (parameter.provider === true) === provider);
    const byName = tier.filter((parameter) => parameter.name.toLowerCase().startsWith(lower));
    const byAlias = tier.filter(
      (parameter) =>
        !byName.includes(parameter) &&
        parameter.aliases?.some((alias) => alias.toLowerCase().startsWith(lower)) === true,
    );
    const matches = [...byName, ...byAlias];
    const [only] = matches;
    if (only !== undefined && matches.length === 1) return only;
    if (matches.length > 1)
      return bindError(
        `Parameter cannot be processed because the parameter name '${typed}' is ambiguous. Possible matches include: ${matches.map((match) => `-${match.name}`).join(' ')}.`,
      );
  }
  return 'none';
}

/** rm -rf is two Unix flags in one. If each letter starts a different switch, name them. */
function combinedFlagsHint(spec: CmdletSpec, typed: string): string[] {
  if (typed.length < 2) return [];
  const names = Array.from(typed.toLowerCase()).map((letter) => {
    const found = spec.parameters.filter(
      (parameter) => parameter.type === 'switch' && parameter.name.toLowerCase().startsWith(letter),
    );
    return found.length === 1 ? found[0]?.name : undefined;
  });
  if (names.includes(undefined) || new Set(names).size !== names.length) return [];
  return [`PowerShell spells each switch out: ${names.map((name) => `-${name ?? ''}`).join(' ')}`];
}

/** A switch is on unless given $false, $null or 0. Text, even "false", is refused. */
function readSwitch(parameter: ParamSpec, arg: ParameterArg): boolean | BindError {
  if (arg.value === null) return true;
  if (arg.value.length === 1 && typeof arg.switchValue === 'boolean') return arg.switchValue;
  if (arg.value.length === 1 && typeof arg.switchValue === 'number') return arg.switchValue !== 0;
  const from = arg.value.length > 1 ? 'System.Object[]' : 'System.String';
  return bindError(
    // PowerShell's message ends with a space (captured).
    `Cannot convert '${from}' to the type '${DOTNET_TYPE.switch}' required by parameter '${parameter.name}'. `,
    `Turn a switch off with -${parameter.name}:$false, or leave it out.`,
  );
}

/** The value, checked for its type (numbers come back converted), or PowerShell's refusal. */
function checkValue(parameter: ParamSpec, items: readonly string[]): readonly string[] | BindError {
  if (items.length > 1 && !parameter.type.endsWith('[]'))
    return bindError(
      `Cannot convert 'System.Object[]' to the type '${DOTNET_TYPE[parameter.type]}' required by parameter '${parameter.name}'. Specified method is not supported.`,
    );
  const range = WHOLE_NUMBERS[parameter.type];
  if (range === undefined) return items;
  const numbers: string[] = [];
  for (const item of items) {
    const converted = toWhole(item, range);
    if (typeof converted === 'string')
      return bindError(
        `Cannot bind parameter '${parameter.name}'. Cannot convert value "${item}" to type "${range.type}". Error: "${converted}"`,
      );
    numbers.push(String(converted));
  }
  return numbers;
}

interface WholeRange {
  readonly type: string;
  readonly short: string;
  readonly min: number;
  readonly max: number;
}

const INT32: WholeRange = {
  type: 'System.Int32',
  short: 'an Int32',
  min: -2147483648,
  max: 2147483647,
};
const UINT32: WholeRange = { type: 'System.UInt32', short: 'a UInt32', min: 0, max: 4294967295 };

/** The whole-number types, and the range each holds. */
const WHOLE_NUMBERS: Partial<Record<ParamType, WholeRange>> = {
  int: INT32,
  'int[]': INT32,
  uint: UINT32,
};

/**
 * Text to a whole number the way PowerShell's binder converts it: spaces trimmed, empty
 * is 0, a sign or 0x allowed, and decimals rounded half to even (1.5 is 2, 2.5 is 2).
 * Returns .NET's reason when it can't.
 */
function toWhole(text: string, range: WholeRange): number | string {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  const hex = /^([+-]?)0x([0-9a-f]+)$/i.exec(trimmed);
  let value: number;
  if (hex) value = Number.parseInt(`${hex[1] ?? ''}${hex[2] ?? ''}`, 16);
  else if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(trimmed)) value = roundHalfToEven(Number(trimmed));
  else return `The input string '${trimmed}' was not in a correct format.`;
  if (value < range.min || value > range.max)
    return `Value was either too large or too small for ${range.short}.`;
  return value;
}

function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  if (value - floor !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * More bare values than positions. Usually a path with a space in it, which PowerShell
 * reads as two values: cd C:\Program Files\nodejs.
 */
function positionalFailure(leftover: readonly Unbound[], lastFilled: ParamSpec | null): BindError {
  const values = leftover.flatMap((entry) => (entry.kind === 'value' ? [entry] : []));
  const [first] = values;
  const rejected =
    first === undefined ? '' : first.items.length > 1 ? 'System.Object[]' : (first.items[0] ?? '');
  const message = `A positional parameter cannot be found that accepts argument '${rejected}'.`;
  const previous = first?.previous ?? null;
  if (previous === null) return bindError(message);
  const words = [...previous.words, ...values.map((entry) => entry.items.join(','))];
  const hints = [`Paths with spaces need quotes: '${words.join(' ')}'`];
  // The value before took a list, so maybe several were meant: rm a.txt b.txt.
  if ((previous.parameter ?? lastFilled)?.type.endsWith('[]') === true)
    hints.push(`To name several, separate them with commas: ${words.join(', ')}`);
  return bindError(message, ...hints);
}
