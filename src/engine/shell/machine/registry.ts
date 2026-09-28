import type { Machine, Session } from '../../machine/machine';
import type { Workspace } from '../../workspace';
import type { ShellResult } from '../shell';
import { ALIASES } from './aliases';
import type { Bound, CmdletSpec } from './bind';
import { GET_CHILD_ITEM } from './cmdlets/childItem';
import { CD_ROOT, CD_UP, GET_LOCATION, SET_LOCATION } from './cmdlets/location';

/** What a cmdlet can see and change: the sandbox, its laptop, and the tab it runs in. */
export interface CommandContext {
  readonly ws: Workspace;
  readonly machine: Machine;
  readonly session: Session;
}

export interface Cmdlet {
  readonly spec: CmdletSpec;
  run(context: CommandContext, bound: Bound): ShellResult;
}

const CMDLETS: readonly Cmdlet[] = [CD_ROOT, CD_UP, GET_CHILD_ITEM, GET_LOCATION, SET_LOCATION];

/** A cmdlet by its name or one of its aliases, ignoring case as PowerShell does. */
export function findCmdlet(name: string): Cmdlet | null {
  const lower = name.toLowerCase();
  const target = (ALIASES[lower] ?? name).toLowerCase();
  return CMDLETS.find((cmdlet) => cmdlet.spec.name.toLowerCase() === target) ?? null;
}
