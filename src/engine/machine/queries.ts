import type { EnvScope } from './events';
import type { Machine } from './machine';
import { display, resolveExisting } from './winPath';

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
  };
}
