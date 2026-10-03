import { baseName, isWithin, parentDir } from '../../engine/fs/paths';
import type { MachineChange } from '../../engine/machine/snapshot';
import type { AgentAction, ApprovalMode, BaseAction } from '../missions/agentSchema';

/**
 * Which of Otto's actions pause for Kyle's approval, and what the approval card says they
 * change (docs/act1-directed.md decisions D5 and D6, section 1.3).
 *
 * Both answers come from a dry run: the action is played on a copy of the laptop first, and
 * the snapshots before and after give its MachineChange list. Nothing here reads the
 * command's text, so `mkdir notes` and `md notes` are judged alike, and no author has to
 * write an effects list that could go stale or give the answer away.
 */

/**
 * How much a change risks. It decides which approval modes pause for it.
 * - 'destructive': something that was there is lost or moved, or a saved variable changes.
 * - 'additive': something new appears and nothing is lost, like a new folder or a copy.
 * - 'terminal': only a terminal's own state, which ends when it closes: the folder it
 *   stands in, its session variables, and opening or closing a tab.
 */
export type ChangeWeight = 'destructive' | 'additive' | 'terminal';

/** Riskiest first: the order the approval card lists effects in. */
const WEIGHTS: readonly ChangeWeight[] = ['destructive', 'additive', 'terminal'];

/**
 * Which weights pause Otto in each approval mode, like a real agent's permission modes.
 * 'terminal' is in neither: moving around and opening tabs never pause, or every step
 * would be a wall of approvals and Kyle would learn to click Allow without reading.
 */
const PAUSES_FOR: Readonly<Record<ApprovalMode, readonly ChangeWeight[]>> = {
  destructive: ['destructive'],
  changes: ['destructive', 'additive'],
};

/** The most effects an approval card lists, so it reads at a glance beside the command. */
export const MAX_EFFECT_LINES = 3;

export function weighChange(change: MachineChange): ChangeWeight {
  switch (change.kind) {
    case 'deleted':
      return 'destructive';
    case 'modified':
      // An append keeps everything the file had. Any other edit loses some of it.
      return change.how === 'appended' ? 'additive' : 'destructive';
    case 'moved':
      // A copy leaves the original where it was, so it only adds.
      return change.copy ? 'additive' : 'destructive';
    case 'created':
      return 'additive';
    case 'env':
      // A saved variable reaches every terminal opened from now on, and nothing on screen
      // shows it changed, so even a new one pauses. A session variable ends with its tab.
      return change.scope === 'session' ? 'terminal' : 'destructive';
    case 'location':
    case 'terminal':
      return 'terminal';
  }
}

/** An action Otto is about to take, and what a dry run of it changed on the laptop. */
export interface PendingAction {
  /** A content action, or Otto's answer to a Confirm question, which pauses the same way. */
  readonly action: AgentAction | BaseAction | { readonly do: 'answer' };
  readonly changes: readonly MachineChange[];
}

/**
 * Whether Otto pauses for Kyle before taking this action. He does when the content marked
 * the line `ask` (a risk the laptop can't show, like reading a secret), or when the dry run
 * changes something the mission's approval mode pauses for.
 */
export function isConsequential(pending: PendingAction, mode: ApprovalMode): boolean {
  if ('ask' in pending.action && pending.action.ask === true) return true;
  const pauses = PAUSES_FOR[mode];
  return pending.changes.some((change) => pauses.includes(weighChange(change)));
}

/**
 * What an action changes, in short plain lines for the approval card: "Deletes
 * C:\Users\kyle\notes and 3 items inside". Paths go through `display`, and a variable
 * shows by name only, never its value. The riskiest lines come first, so when there are
 * more than MAX_EFFECT_LINES, the last line counts the mildest ones instead of listing them.
 * No changes gives no lines.
 */
export function describeChanges(
  changes: readonly MachineChange[],
  display: (path: string) => string,
): string[] {
  // sort is stable, so lines of the same weight keep the order diffSnapshots gave them.
  const lines = listEffects(changes, display)
    .sort((a, b) => WEIGHTS.indexOf(a.weight) - WEIGHTS.indexOf(b.weight))
    .map((effect) => effect.text);
  if (lines.length <= MAX_EFFECT_LINES) return lines;
  const listed = lines.slice(0, MAX_EFFECT_LINES - 1);
  return [...listed, `And ${counted(lines.length - listed.length, 'more change')}`];
}

type DeletedChange = Extract<MachineChange, { kind: 'deleted' }>;

interface Effect {
  readonly weight: ChangeWeight;
  readonly text: string;
}

/**
 * One line per change, with two merges so the card shows the shape of what happens: a new
 * folder that only holds other new items gets no line of its own, and deletes in the same
 * folder share one line, so a wildcard reads as its blast radius.
 */
function listEffects(
  changes: readonly MachineChange[],
  display: (path: string) => string,
): Effect[] {
  const shown = changes.filter((change) => !holdsNewItems(change, changes));
  const effects: Effect[] = [];
  const foldersDone = new Set<string>();
  for (const change of shown) {
    const weight = weighChange(change);
    if (change.kind !== 'deleted') {
      effects.push({ weight, text: describeChange(change, display) });
      continue;
    }
    const folder = parentDir(change.path);
    if (foldersDone.has(folder)) continue;
    foldersDone.add(folder);
    const group = shown.filter(
      (other): other is DeletedChange =>
        other.kind === 'deleted' && parentDir(other.path) === folder,
    );
    const text =
      group.length === 1
        ? describeChange(change, display)
        : describeDeletes(group, folder, display);
    effects.push({ weight, text });
  }
  return effects;
}

/**
 * A new folder made only to hold other new items, like `web` when `mkdir web\notes` makes
 * both. The deeper path already shows it, so it gets no line.
 */
function holdsNewItems(change: MachineChange, changes: readonly MachineChange[]): boolean {
  if (change.kind !== 'created' || change.item !== 'folder') return false;
  return changes.some(
    (other) =>
      other.kind === 'created' && other.path !== change.path && isWithin(other.path, change.path),
  );
}

function describeChange(change: MachineChange, display: (path: string) => string): string {
  switch (change.kind) {
    case 'created':
      return `Makes the ${change.item} ${display(change.path)}`;
    case 'deleted':
      if (change.item === 'file') return `Deletes ${display(change.path)}`;
      if (change.inside === 0) return `Deletes the empty folder ${display(change.path)}`;
      return `Deletes ${display(change.path)} and ${counted(change.inside, 'item')} inside`;
    case 'modified':
      return change.how === 'appended'
        ? `Adds to the end of ${display(change.path)}`
        : `Overwrites ${display(change.path)}`;
    case 'moved':
      return describeMove(change, display);
    case 'env':
      return `${ENV_VERBS[change.change]} the variable ${change.name} ${variableReach(change)}`;
    case 'location':
      return `PS ${String(change.tab)} moves to ${display(change.to)}`;
    case 'terminal':
      return `${change.change === 'opened' ? 'Opens' : 'Closes'} PS ${String(change.tab)}`;
  }
}

/** "Deletes 3 files in C:\…\logs": every item counts, including what was inside folders. */
function describeDeletes(
  group: readonly DeletedChange[],
  folder: string,
  display: (path: string) => string,
): string {
  const total = group.reduce((sum, change) => sum + 1 + change.inside, 0);
  const noun = group.every((change) => change.item === 'file') ? 'file' : 'item';
  return `Deletes ${counted(total, noun)} in ${display(folder)}`;
}

/** Within one folder the new name is enough; anywhere else needs the full path. */
function describeMove(
  change: Extract<MachineChange, { kind: 'moved' }>,
  display: (path: string) => string,
): string {
  const sameFolder = parentDir(change.from) === parentDir(change.to);
  const to = sameFolder ? baseName(change.to) : display(change.to);
  let verb = 'Moves';
  if (change.copy) verb = 'Copies';
  else if (sameFolder) verb = 'Renames';
  return `${verb} ${display(change.from)} to ${to}`;
}

const ENV_VERBS = { set: 'Sets', changed: 'Changes', removed: 'Removes' } as const;

/** Which terminals will see a variable: one tab, or every tab opened from now on. */
function variableReach(change: Extract<MachineChange, { kind: 'env' }>): string {
  switch (change.scope) {
    case 'session':
      return change.tab === null ? 'in this terminal only' : `in PS ${String(change.tab)} only`;
    case 'user':
      return 'for your new terminals';
    case 'machine':
      return "for every user's new terminals";
  }
}

function counted(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
