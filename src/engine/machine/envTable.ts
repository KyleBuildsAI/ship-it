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

  constructor(initial: Readonly<Record<string, string>> = {}) {
    for (const [name, value] of Object.entries(initial)) this.set(name, value);
  }

  get(name: string): string | null {
    return this.byKey.get(name.toUpperCase())?.value ?? null;
  }

  has(name: string): boolean {
    return this.byKey.has(name.toUpperCase());
  }

  /** Sets a variable, keeping an existing name's spelling. An empty value deletes it. */
  set(name: string, value: string): void {
    const key = name.toUpperCase();
    if (value === '') {
      this.byKey.delete(key);
      return;
    }
    this.byKey.set(key, { name: this.byKey.get(key)?.name ?? name, value });
  }

  /** Removes a variable. Returns whether it was there. */
  delete(name: string): boolean {
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
    for (const entry of this.byKey.values()) copy.set(entry.name, entry.value);
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
