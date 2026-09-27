export interface ParsedArgs {
  /** Flags present, by their canonical name (e.g. 'staged', 'm'). */
  readonly flags: ReadonlySet<string>;
  /** Flag values in order, e.g. every `-m` message. */
  readonly values: ReadonlyMap<string, readonly string[]>;
  /** Everything that isn't a flag: paths, revisions. */
  readonly positional: readonly string[];
  /** Paths after a bare `--`, which are never mistaken for revisions. */
  readonly afterDoubleDash: readonly string[] | null;
  /** Flags the command doesn't know, reported as git's "unknown option" error. */
  readonly unknown: readonly string[];
}

export interface FlagSpec {
  /** Canonical name, then aliases: ['staged', 'cached'] or ['m', 'message']. */
  readonly names: readonly string[];
  /** Takes a value: `-m msg`, `-mmsg`, `--message=msg`, `--message msg`. */
  readonly takesValue?: boolean;
}

/**
 * Parses git-style arguments: combined short flags (`-am`), attached and separate values,
 * `--long=value`, a bare `--`, and number shortcuts like `-3` (read as `-n 3`).
 */
export function parseArgs(argv: readonly string[], specs: readonly FlagSpec[]): ParsedArgs {
  const flags = new Set<string>();
  const values = new Map<string, string[]>();
  const positional: string[] = [];
  const unknown: string[] = [];
  let afterDoubleDash: string[] | null = null;

  const lookup = (name: string) => specs.find((spec) => spec.names.includes(name));
  // Commands with a count flag (`log -n 3`) also accept the shortcut `log -3`.
  const countSpec = lookup('n');
  const record = (spec: FlagSpec, value?: string) => {
    const canonical = spec.names[0] ?? '';
    flags.add(canonical);
    if (value !== undefined) values.set(canonical, [...(values.get(canonical) ?? []), value]);
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (afterDoubleDash !== null) {
      afterDoubleDash.push(arg);
    } else if (arg === '--') {
      afterDoubleDash = [];
    } else if (arg.startsWith('--')) {
      const [name = '', inlineValue] = arg.slice(2).split(/=(.*)/s);
      const spec = lookup(name);
      if (!spec) unknown.push(arg);
      else if (!spec.takesValue) record(spec);
      else if (inlineValue !== undefined) record(spec, inlineValue);
      else record(spec, argv[++i] ?? '');
    } else if (/^-\d+$/.test(arg) && countSpec) {
      record(countSpec, arg.slice(1));
    } else if (arg.startsWith('-') && arg.length > 1) {
      // `-am "msg"` is `-a -m "msg"`; `-mfix` is `-m fix`.
      for (let j = 1; j < arg.length; j++) {
        const spec = lookup(arg.charAt(j));
        if (!spec) {
          unknown.push(`-${arg.charAt(j)}`);
        } else if (spec.takesValue) {
          const attached = arg.slice(j + 1);
          record(spec, attached !== '' ? attached : (argv[++i] ?? ''));
          break;
        } else {
          record(spec);
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, values, positional, afterDoubleDash, unknown };
}
