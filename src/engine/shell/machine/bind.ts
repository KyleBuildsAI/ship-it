import { bindError, type Arg, type BindError } from './args';

/** The .NET types PowerShell names in its errors, for the types this sandbox binds. */
const DOTNET_TYPE = {
  switch: 'System.Management.Automation.SwitchParameter',
  string: 'System.String',
  'string[]': 'System.String[]',
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
}

type ParameterArg = Extract<Arg, { kind: 'parameter' }>;

type Unbound =
  | { readonly kind: 'unknown'; readonly name: string }
  | { readonly kind: 'value'; readonly items: readonly string[] };

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
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined) break;
    if (arg.kind === 'value') {
      unbound.push({ kind: 'value', items: arg.items });
      continue;
    }
    const match = matchParameter(spec, arg.name);
    if (match === 'none') {
      unbound.push({ kind: 'unknown', name: arg.name });
      continue;
    }
    if (isBindError(match)) return match;
    if (match.type === 'switch') {
      named.push({ parameter: match, arg, value: [] });
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
    const checked = checkValue(parameter, entry.items);
    if (isBindError(checked)) return checked;
    values.set(parameter.name, checked);
  }

  const [first] = leftover;
  if (first?.kind === 'unknown')
    return bindError(`A parameter cannot be found that matches parameter name '${first.name}'.`);
  if (first?.kind === 'value') {
    // PowerShell names a list by its .NET type rather than by what's in it.
    const rejected = first.items.length > 1 ? 'System.Object[]' : (first.items[0] ?? '');
    return bindError(`A positional parameter cannot be found that accepts argument '${rejected}'.`);
  }
  return { ok: true, bound: new Bound(values) };
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

/** The value, if it fits the parameter's type, or PowerShell's refusal. */
function checkValue(parameter: ParamSpec, items: readonly string[]): readonly string[] | BindError {
  if (items.length > 1 && !parameter.type.endsWith('[]'))
    return bindError(
      `Cannot convert 'System.Object[]' to the type '${DOTNET_TYPE[parameter.type]}' required by parameter '${parameter.name}'. Specified method is not supported.`,
    );
  return items;
}
