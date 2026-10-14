import type { Machine, Session } from '../../machine/machine';
import type { Workspace } from '../../workspace';
import type { ShellResult } from '../shell';
import { ALIASES } from './aliases';
import type { Bound, CmdletSpec } from './bind';
import { GET_CHILD_ITEM } from './cmdlets/childItem';
import { ADD_CONTENT, GET_CONTENT, SET_CONTENT, WRITE_OUTPUT } from './cmdlets/content';
import { COPY_ITEM, MOVE_ITEM, RENAME_ITEM } from './cmdlets/copyMove';
import { MKDIR, NEW_ITEM, TEST_PATH } from './cmdlets/items';
import { CD_ROOT, CD_UP, GET_LOCATION, SET_LOCATION } from './cmdlets/location';
import { REMOVE_ITEM } from './cmdlets/remove';
import type { ConfirmRequest } from './confirm';

/** What a cmdlet can see and change: the sandbox, its laptop, and the tab it runs in. */
export interface CommandContext {
  readonly ws: Workspace;
  readonly machine: Machine;
  readonly session: Session;
  /**
   * The files this statement's redirects hold open (2> log.txt), lower-cased. Windows won't
   * let anything else write, move, or delete them until the statement ends.
   */
  readonly held: ReadonlySet<string>;
  /** Asks the player a yes/no question; the next line typed answers it. */
  readonly confirm: (request: ConfirmRequest) => void;
}

/** What a cmdlet prints, and whether PowerShell stopped it. */
export interface CmdletResult extends ShellResult {
  /**
   * The last error line stopped the command: a mandatory parameter left out, or a
   * terminating error like Set-Content meeting a folder. PowerShell prints these on the
   * console, because 2> and 2>&1 only take the errors a command writes as it goes
   * (checked in 7.6.6).
   */
  readonly stopped?: boolean;
}

export interface Cmdlet {
  readonly spec: CmdletSpec;
  run(context: CommandContext, bound: Bound): CmdletResult;
}

const CMDLETS: readonly Cmdlet[] = [
  CD_ROOT,
  CD_UP,
  ADD_CONTENT,
  COPY_ITEM,
  GET_CHILD_ITEM,
  GET_CONTENT,
  GET_LOCATION,
  MKDIR,
  MOVE_ITEM,
  NEW_ITEM,
  REMOVE_ITEM,
  RENAME_ITEM,
  SET_CONTENT,
  SET_LOCATION,
  TEST_PATH,
  WRITE_OUTPUT,
];

/** A cmdlet by its name or one of its aliases, ignoring case as PowerShell does. */
export function findCmdlet(name: string): Cmdlet | null {
  const lower = name.toLowerCase();
  const target = (ALIASES[lower] ?? name).toLowerCase();
  return CMDLETS.find((cmdlet) => cmdlet.spec.name.toLowerCase() === target) ?? null;
}
