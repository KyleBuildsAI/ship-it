import type { EnvScope } from '../../engine/machine/events';
import type { MachineQueries, TabState } from '../../engine/machine/queries';

/*
 * Act 1's success language: states of the laptop, never commands (DESIGN.md pillar 3).
 * Paths are canonical drive paths ('Users/kyle/notes') and, like variable names, match
 * in any case, as they do on Windows. Checklists show them as C:\Users\kyle\notes.
 */

/** Where a variable is read: one of the three scopes, or a terminal opened right now. */
export type EnvView = EnvScope | 'newTerminal';

export type MachinePredicate =
  /**
   * A terminal stands in this folder: the active tab when `tab` is left out, the tab with
   * that number (PS 2 is tab 2), or with 'any', at least one open tab.
   */
  | { kind: 'currentDirectory'; path: string; tab?: number | 'any'; label?: string }
  /** A folder is there. `exists: false` means no folder is there. */
  | { kind: 'driveFolder'; path: string; exists?: boolean; label?: string }
  /** A file is there and matches every check given. `exists: false` means no file is there. */
  | {
      kind: 'driveFile';
      path: string;
      equals?: string;
      contains?: string;
      pattern?: string;
      flags?: string;
      exists?: boolean;
      label?: string;
    }
  /**
   * A variable's value in the active tab (`session`, the default), saved for this user or
   * for every user, or as a terminal opened now would see it (`newTerminal`). `exists:
   * false` means unset. An empty value counts as unset, as it does on Windows.
   */
  | {
      kind: 'envVar';
      name: string;
      scope?: EnvView;
      equals?: string;
      contains?: string;
      exists?: boolean;
      label?: string;
    };

export type MachinePredicateKind = MachinePredicate['kind'];

// A record rather than a list, so adding a kind to the type above fails to compile until
// it is added here too. A kind missing here would skip the laptop grader entirely.
const KIND_TABLE: Record<MachinePredicateKind, true> = {
  currentDirectory: true,
  driveFolder: true,
  driveFile: true,
  envVar: true,
};

/** Does this check ask about the laptop, rather than git? */
export function isMachinePredicate(predicate: {
  readonly kind: string;
}): predicate is MachinePredicate {
  return Object.hasOwn(KIND_TABLE, predicate.kind);
}

/** Thrown when a laptop check runs in a sandbox without a laptop: a content mistake. */
export class PredicateContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PredicateContextError';
  }
}

export function requireMachine(machine: MachineQueries | undefined): MachineQueries {
  if (machine === undefined) throw new PredicateContextError('This check needs a laptop sandbox.');
  return machine;
}

function samePath(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function textMatches(
  text: string,
  expected: { equals?: string; contains?: string; pattern?: string; flags?: string },
): boolean {
  if (expected.equals !== undefined && text !== expected.equals) return false;
  if (expected.contains !== undefined && !text.includes(expected.contains)) return false;
  if (expected.pattern !== undefined && !new RegExp(expected.pattern, expected.flags).test(text))
    return false;
  return true;
}

/** The tabs a location check looks at. Asked through tabs(), which never throws. */
function tabsToCheck(tab: number | 'any' | undefined, open: readonly TabState[]) {
  if (tab === 'any') return open;
  return open.filter((state) => (tab === undefined ? state.active : state.tab === tab));
}

/**
 * A variable's value, or null when it's unset. With no terminal open there is no active
 * tab to read, which counts as unset rather than an error: grading only ever says no.
 */
function readVariable(q: MachineQueries, name: string, view: EnvView): string | null {
  if (view === 'session' && !q.tabs().some((tab) => tab.active)) return null;
  return q.env(name, view);
}

/** Is the laptop in this state right now? */
export function evaluateMachine(predicate: MachinePredicate, q: MachineQueries): boolean {
  switch (predicate.kind) {
    case 'currentDirectory':
      return tabsToCheck(predicate.tab, q.tabs()).some((tab) => samePath(tab.cwd, predicate.path));
    case 'driveFolder': {
      const isFolder = q.item(predicate.path)?.kind === 'folder';
      return predicate.exists === false ? !isFolder : isFolder;
    }
    case 'driveFile': {
      const item = q.item(predicate.path);
      // No file there (nothing, or a folder): right only when the check wants it gone.
      if (item?.kind !== 'file') return predicate.exists === false;
      return predicate.exists !== false && textMatches(item.content ?? '', predicate);
    }
    case 'envVar': {
      const value = readVariable(q, predicate.name, predicate.scope ?? 'session');
      if (value === null) return predicate.exists === false;
      return predicate.exists !== false && textMatches(value, predicate);
    }
  }
}

// ---- Plain-English descriptions ---------------------------------------------------

function whichTerminal(tab: number | 'any' | undefined): string {
  if (tab === undefined) return 'The active terminal';
  if (tab === 'any') return 'At least one terminal';
  return `Terminal PS ${String(tab)}`;
}

const VARIABLE_PLACE: Record<EnvView, string> = {
  session: 'in the active terminal',
  // The Windows Environment Variables dialog calls the two saved scopes these names.
  user: 'in your saved user variables',
  machine: 'in the saved system variables',
  newTerminal: 'in a new terminal',
};

// The describers below say "the expected value" rather than the value itself: a variable
// or a file may hold a secret, and the checklist is on screen for anyone to read.

function describeFile(predicate: Extract<MachinePredicate, { kind: 'driveFile' }>): string {
  if (predicate.exists === false) return 'does not exist';
  if (predicate.equals !== undefined) return 'has the expected content';
  if (predicate.contains !== undefined || predicate.pattern !== undefined)
    return 'has the expected text';
  return 'exists';
}

function describeVariable(predicate: Extract<MachinePredicate, { kind: 'envVar' }>): string {
  const { name } = predicate;
  const place = VARIABLE_PLACE[predicate.scope ?? 'session'];
  if (predicate.exists === false) return `${name} is not set ${place}`;
  if (predicate.equals !== undefined) return `${name} is set ${place}, with the expected value`;
  if (predicate.contains !== undefined) return `${name} is set ${place}, with the expected text`;
  return `${name} is set ${place}`;
}

/**
 * A plain-English sentence for the checklist, with paths as Windows shows them. It never
 * prints a variable's value or a file's text, so a check can't leak a secret.
 */
export function describeMachine(
  predicate: MachinePredicate,
  display: (path: string) => string,
): string {
  switch (predicate.kind) {
    case 'currentDirectory':
      return `${whichTerminal(predicate.tab)} is in ${display(predicate.path)}`;
    case 'driveFolder':
      return `Folder ${display(predicate.path)} ${predicate.exists === false ? 'does not exist' : 'exists'}`;
    case 'driveFile':
      return `File ${display(predicate.path)} ${describeFile(predicate)}`;
    case 'envVar':
      return describeVariable(predicate);
  }
}
