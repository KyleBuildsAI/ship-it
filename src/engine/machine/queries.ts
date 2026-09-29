import { joinPath } from '../fs/paths';
import type { EnvScope } from './events';
import type { Machine } from './machine';
import { display, resolveExisting } from './winPath';

/** One item inside a folder. */
export interface ListedItem {
  /** The name as it was created: 'Notes', not 'notes'. */
  readonly name: string;
  readonly kind: 'file' | 'folder';
  /**
   * It has the Hidden attribute, like AppData, so a plain `dir` leaves it out. Anything
   * that draws the drive can then show what `dir` shows, and still find a hidden item.
   */
  readonly hidden: boolean;
}

/** One open terminal tab. */
export interface TabState {
  /** The tab's number, as the terminal shows it: PS 1, PS 2. */
  readonly tab: number;
  /** The folder the tab stands in, canonical, with its stored casing. */
  readonly cwd: string;
  /** The tab that runs the next line typed. Exactly one is, while any tab is open. */
  readonly active: boolean;
}

/**
 * Read-only questions about the laptop, for grading. Like GitQueries, they only look:
 * asking never changes the machine or emits an event, so a checklist can ask as often as
 * it likes. Paths are canonical ('Users/kyle/notes') and match in any case, as on Windows.
 */
export interface MachineQueries {
  /** How a canonical path reads on screen: 'Users/kyle' is C:\Users\kyle. */
  readonly display: (path: string) => string;
  /** The folder the active terminal tab stands in, with its stored casing. */
  readonly cwd: () => string;
  /** A file (with its text) or a folder at the path, or null when nothing is there. */
  readonly item: (
    path: string,
  ) => { readonly kind: 'file' | 'folder'; readonly content: string | null } | null;
  /**
   * A variable's value: in the active tab (`session`), saved for this user or for every
   * user, or as a terminal opened now would see it (`newTerminal`). Null when unset.
   */
  readonly env: (name: string, scope: EnvScope | 'newTerminal') => string | null;
  /**
   * What a folder holds, in the order Get-ChildItem prints it. Hidden items are included
   * and marked (a plain `dir` skips them), because grading looks at what is really on the
   * drive.
   * Empty for a path that isn't a folder; ask `item` to tell an empty folder from a
   * missing one.
   */
  readonly list: (path: string) => readonly ListedItem[];
  /** Every open terminal tab, in the order they were opened. */
  readonly tabs: () => readonly TabState[];
}

export function machineQueries(machine: Machine): MachineQueries {
  return {
    display,
    cwd: () => machine.active().cwd,
    item: (path) => {
      const found = resolveExisting(machine.drive, path);
      if (found === null) return null;
      return machine.drive.isDir(found)
        ? { kind: 'folder', content: null }
        : { kind: 'file', content: machine.drive.readFile(found) };
    },
    env: (name, scope) => {
      switch (scope) {
        case 'session':
          return machine.active().env.get(name);
        case 'user':
          return machine.saved.user.get(name);
        case 'machine':
          return machine.saved.machine.get(name);
        case 'newTerminal':
          return machine.newTerminalEnv().get(name);
      }
    },
    list: (path) => {
      const folder = resolveExisting(machine.drive, path);
      if (folder === null || !machine.drive.isDir(folder)) return [];
      return machine.drive
        .listDir(folder)
        .map((entry): ListedItem => ({
          name: entry.name,
          kind: entry.kind === 'dir' ? 'folder' : 'file',
          hidden: machine.drive.isHidden(joinPath(folder, entry.name)),
        }))
        .sort(foldersFirstByName);
    },
    tabs: () => {
      const open = machine.sessions();
      // active() throws when no tab is open, so only ask it when one is.
      const activeId = open.length > 0 ? machine.active().id : null;
      return open.map((session) => ({
        tab: session.id,
        cwd: session.cwd,
        active: session.id === activeId,
      }));
    },
  };
}

/**
 * Get-ChildItem sorts names by English language rules, not by character code: '_notes'
 * and '~$plan.docx' come before 'api', where a character compare would put '~' last.
 * Naming the language pins the order, so it is the same on every computer whatever its
 * own language is. Env: sorts the same way (envTable.ts).
 */
const NAME_ORDER = new Intl.Collator('en', { sensitivity: 'base' });

/**
 * Folders first, then files, each by name ignoring case, as Get-ChildItem lists them.
 * Names that only differ by an accent ('resume', 'résumé') are equal to the collator, so
 * a character compare settles them, unaccented first as PowerShell prints them. Two names
 * in one folder never match ignoring case (the drive is like NTFS), so that settles every
 * tie.
 */
function foldersFirstByName(a: ListedItem, b: ListedItem): number {
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
  return NAME_ORDER.compare(a.name, b.name) || (a.name < b.name ? -1 : 1);
}
