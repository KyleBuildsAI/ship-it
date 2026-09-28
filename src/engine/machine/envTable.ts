/** One environment variable: its name as first written, and its value. */
export interface EnvEntry {
  readonly name: string;
  readonly value: string;
}

/**
 * One scope's environment variables, the way Windows keeps them: names are
 * case-insensitive (`$env:path` and `$env:PATH` are the same note) and keep the spelling
 * they were first given (`Path`). Setting a variable to an empty value deletes it, as
 * `$env:NAME = ''` does in PowerShell.
 */
export class EnvTable {
  private readonly byKey = new Map<string, EnvEntry>();
  /**
   * Saved variables whose %NAME% references expand when a terminal opens (the registry's
   * REG_EXPAND_SZ). Others are plain text (REG_SZ) and never expand.
   */
  private readonly expanding = new Set<string>();

  /**
   * `initial` is how Windows stores a fresh install: a value with a %NAME% reference in
   * it is saved as expandable, like the stock User Path.
   */
  constructor(initial: Readonly<Record<string, string>> = {}) {
    for (const [name, value] of Object.entries(initial)) {
      this.set(name, value, { expand: value.includes('%') });
    }
  }

  get(name: string): string | null {
    return this.byKey.get(name.toUpperCase())?.value ?? null;
  }

  has(name: string): boolean {
    return this.byKey.has(name.toUpperCase());
  }

  /**
   * Sets a variable, keeping an existing name's spelling. An empty value deletes it. It's
   * stored as plain text unless `expand` says otherwise, as .NET's SetEnvironmentVariable
   * does (even for a Path that used to expand, a well-known way to break %USERPROFILE%).
   */
  set(name: string, value: string, options: { expand?: boolean } = {}): void {
    const key = name.toUpperCase();
    if (value === '') {
      this.delete(name);
      return;
    }
    this.byKey.set(key, { name: this.byKey.get(key)?.name ?? name, value });
    if (options.expand === true) this.expanding.add(key);
    else this.expanding.delete(key);
  }

  /** Whether a saved variable's %NAME% references expand when a terminal opens. */
  expands(name: string): boolean {
    return this.expanding.has(name.toUpperCase());
  }

  /** Removes a variable. Returns whether it was there. */
  delete(name: string): boolean {
    this.expanding.delete(name.toUpperCase());
    return this.byKey.delete(name.toUpperCase());
  }

  /** Every variable, sorted by name the way `Get-ChildItem Env:` lists them. */
  entries(): EnvEntry[] {
    return [...this.byKey.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }),
    );
  }

  clone(): EnvTable {
    const copy = new EnvTable();
    for (const entry of this.byKey.values()) {
      copy.set(entry.name, entry.value, { expand: this.expands(entry.name) });
    }
    return copy;
  }
}

/**
 * Replaces `%NAME%` references the way Windows expands saved variables, like
 * `%USERPROFILE%\AppData` in the saved Path. Unknown names stay as written, as they do
 * on Windows.
 */
export function expandPercent(text: string, lookup: (name: string) => string | null): string {
  return text.replace(/%([^%;\\/]+)%/g, (whole, name: string) => lookup(name) ?? whole);
}
