import type { Machine } from './machine';

/**
 * Setup steps that shape the laptop beyond its files. Missions store them as plain data,
 * like the git steps, so they can be validated and replayed exactly.
 */
export type MachineFixtureStep =
  | { readonly op: 'mkdir'; readonly path: string }
  /** Opens a terminal now. Saved changes made later won't reach it, which is the point. */
  | { readonly op: 'session' };

/** The machine ops, for telling them apart from git's. */
export const MACHINE_OPS: ReadonlySet<string> = new Set(['mkdir', 'session']);

export function isMachineStep(step: { readonly op: string }): step is MachineFixtureStep {
  return MACHINE_OPS.has(step.op);
}

/**
 * Applies one machine step. Used both to build a fresh sandbox and to change a live one
 * (boss twists), so both always end in the same state.
 */
export function applyMachineStep(machine: Machine, step: MachineFixtureStep): void {
  switch (step.op) {
    case 'mkdir':
      machine.drive.makeDir(step.path);
      break;
    case 'session':
      machine.openSession();
      break;
  }
}
