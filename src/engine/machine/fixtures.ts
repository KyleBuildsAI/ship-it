import type { EnvScope } from './events';
import type { Machine } from './machine';
import { display, resolveExisting } from './winPath';

/**
 * Setup steps that shape the laptop: folders, terminals, and environment variables.
 * Missions store them as plain data, like the git steps, so they can be validated and
 * replayed exactly. Paths are canonical drive paths ('Users/kyle/notes'); PATH folders
 * are written the Windows way, because PATH itself is Windows text.
 */
export type MachineFixtureStep =
  | { readonly op: 'mkdir'; readonly path: string }
  /** Opens a terminal now. Saved changes made later won't reach it, which is the point. */
  | { readonly op: 'session' }
  | { readonly op: 'cd'; readonly path: string }
  | {
      readonly op: 'env';
      readonly scope: EnvScope;
      readonly name: string;
      /** null removes the variable. */
      readonly value: string | null;
    }
  | {
      readonly op: 'pathAdd';
      readonly scope: EnvScope;
      /** A folder as PATH writes it, like 'C:\tools\node16'. */
      readonly dir: string;
      readonly at: 'start' | 'end';
    }
  | { readonly op: 'restartTerminals' };

/** The machine ops, for telling them apart from git's. */
export const MACHINE_OPS: ReadonlySet<string> = new Set([
  'mkdir',
  'session',
  'cd',
  'env',
  'pathAdd',
  'restartTerminals',
]);

export function isMachineStep(step: { readonly op: string }): step is MachineFixtureStep {
  return MACHINE_OPS.has(step.op);
}

function openTab(machine: Machine, op: string) {
  if (machine.sessions().length === 0) {
    throw new Error(`The "${op}" step needs an open terminal: add a session() step before it.`);
  }
  return machine.active();
}

/**
 * Applies one machine step. Setup code acts as an administrator, so it can set Machine
 * scope too. Used both to build a fresh sandbox and to change a live one (boss twists),
 * so both always end in the same state.
 */
export function applyMachineStep(machine: Machine, step: MachineFixtureStep): void {
  switch (step.op) {
    case 'mkdir':
      machine.drive.makeDir(step.path);
      break;
    case 'session':
      machine.openSession();
      break;
    case 'cd': {
      const tab = openTab(machine, 'cd');
      const found = resolveExisting(machine.drive, step.path);
      if (found === null || !machine.drive.isDir(found)) {
        throw new Error(`The "cd" step names a folder that doesn't exist: ${display(step.path)}`);
      }
      machine.setLocation(tab.id, found, 'absolute');
      break;
    }
    case 'env': {
      const session = step.scope === 'session' ? openTab(machine, 'env').id : undefined;
      // Set up the way an installer would: a value with a %NAME% in it is saved expandable.
      const expand = step.value?.includes('%') ?? false;
      machine.setEnv(step.scope, step.name, step.value, { session, admin: true, expand });
      break;
    }
    case 'pathAdd': {
      const table =
        step.scope === 'session' ? openTab(machine, 'pathAdd').env : machine.saved[step.scope];
      const session = step.scope === 'session' ? machine.active().id : undefined;
      const parts = (table.get('Path') ?? '').split(';').filter((part) => part !== '');
      const joined = step.at === 'start' ? [step.dir, ...parts] : [...parts, step.dir];
      // Adding a folder keeps the Path's kind: a stock User Path stays expandable.
      const expand = table.expands('Path');
      machine.setEnv(step.scope, 'Path', joined.join(';'), { session, admin: true, expand });
      break;
    }
    case 'restartTerminals':
      machine.restartTerminals();
      break;
  }
}
