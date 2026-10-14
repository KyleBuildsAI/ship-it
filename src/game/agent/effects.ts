import { baseName, isWithin, parentDir } from '../../engine/fs/paths';
import type { GitChange } from '../../engine/git/snapshot';
import type { MachineChange } from '../../engine/machine/snapshot';
import type { AgentAction, ApprovalMode, BaseAction } from '../missions/agentSchema';

/**
 * Which of Otto's actions pause for Kyle's approval, and what the approval card says they
 * change (docs/act1-directed.md decisions D5 and D6, section 1.3).
 *
 * Both answers come from a dry run: the action is played on a copy of the sandbox first, and
 * the snapshots before and after give its changes: the laptop's MachineChange list, and
 * git's GitChange list (what moves between the Workbench, the Loading Dock and the Vault).
 * Nothing here reads the command's text, so `mkdir notes` and `md notes`, or
 * `git restore app.ts` and `git checkout -- app.ts`, are judged alike, and no author has
 * to write an effects list that could go stale or give the answer away.
 */

/** Anything an action can change: on the laptop, or in git's three areas. */
export type SandboxChange = MachineChange | GitChange;

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

export function weighChange(change: SandboxChange): ChangeWeight {
  switch (change.kind) {
    case 'repoCreated':
    case 'sealed':
      return 'additive';
    case 'workbench':
      // A git command that rewrites or removes a Workbench file loses that version of it,
      // like a laptop file being replaced, even when a commit still has an older one.
      return change.how === 'created' ? 'additive' : 'destructive';
    case 'dock':
      // Loading or unloading a crate changes what the next commit holds, but the file
      // itself stays on the Workbench either way: nothing is lost.
      return 'additive';
    case 'dropped':
      // Commits leave the branch's history: the work in them is off the record.
      return 'destructive';
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
  readonly changes: readonly SandboxChange[];
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
  changes: readonly SandboxChange[],
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

/**
 * Several paths loaded onto (or taken off) the Loading Dock by one command, like
 * `git add .`: one line for the lot, the way deletes in one folder share a line.
 */
interface DockGroup {
  readonly kind: 'dockGroup';
  readonly how: 'loaded' | 'unloaded';
  readonly paths: readonly string[];
}

/** A change as the card lists it: one change, or a group of dock moves. */
type Shown = SandboxChange | DockGroup;

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
  changes: readonly SandboxChange[],
  display: (path: string) => string,
): Effect[] {
  const shown = groupDock(changes.filter((change) => !holdsNewItems(change, changes)));
  const effects: Effect[] = [];
  const foldersDone = new Set<string>();
  for (const change of shown) {
    const weight = change.kind === 'dockGroup' ? 'additive' : weighChange(change);
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
 * Dock moves of the same direction become one group when there is more than one. The
 * group takes the place of its first move, so the Vault, dock, Workbench order holds.
 */
function groupDock(changes: readonly SandboxChange[]): Shown[] {
  const pathsFor = (how: DockGroup['how']) =>
    changes.flatMap((change) =>
      change.kind === 'dock' && change.how === how ? [change.path] : [],
    );
  const shown: Shown[] = [];
  const placed = new Set<DockGroup['how']>();
  for (const change of changes) {
    if (change.kind !== 'dock') {
      shown.push(change);
      continue;
    }
    const paths = pathsFor(change.how);
    if (paths.length === 1) shown.push(change);
    else if (!placed.has(change.how)) {
      placed.add(change.how);
      shown.push({ kind: 'dockGroup', how: change.how, paths });
    }
  }
  return shown;
}

/**
 * A new folder made only to hold other new items, like `web` when `mkdir web\notes` makes
 * both. The deeper path already shows it, so it gets no line.
 */
function holdsNewItems(change: SandboxChange, changes: readonly SandboxChange[]): boolean {
  if (change.kind !== 'created' || change.item !== 'folder') return false;
  return changes.some(
    (other) =>
      other.kind === 'created' && other.path !== change.path && isWithin(other.path, change.path),
  );
}

function describeChange(change: Shown, display: (path: string) => string): string {
  switch (change.kind) {
    case 'repoCreated':
    case 'workbench':
    case 'dock':
    case 'dockGroup':
    case 'sealed':
    case 'dropped':
      return describeGitChange(change);
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

/**
 * Git's changes in the Git World's words: crates on the Workbench, the Loading Dock, and
 * commits sealed into (or taken off) the Vault's history. Paths are project paths, which
 * the world already shows as they are.
 */
function describeGitChange(change: Exclude<Shown, MachineChange>): string {
  switch (change.kind) {
    case 'repoCreated':
      return 'Sets up a Loading Dock and a Vault for this project';
    case 'workbench':
      return describeWorkbench(change);
    case 'dock':
      return change.how === 'loaded'
        ? `Moves ${change.path} onto the Loading Dock`
        : `Takes ${change.path} off the Loading Dock`;
    case 'dockGroup':
      return change.how === 'loaded'
        ? `Moves ${counted(change.paths.length, 'file')} onto the Loading Dock`
        : `Takes ${counted(change.paths.length, 'file')} off the Loading Dock`;
    case 'sealed':
      return `Seals ${counted(change.files, 'file')} into a new commit: "${change.message}"`;
    case 'dropped':
      return describeDropped(change);
  }
}

/**
 * The edits are saved on disk, so "unsaved" would be wrong: what they lack is a copy on
 * the Loading Dock or in a commit, which is what git calls unstaged.
 */
function describeWorkbench(change: Extract<GitChange, { kind: 'workbench' }>): string {
  switch (change.how) {
    case 'created':
      return `Puts ${change.path} on the Workbench`;
    case 'changed':
      return change.unsaved
        ? `Throws away the unstaged edits to ${change.path}`
        : `Rewrites ${change.path} on the Workbench`;
    case 'deleted':
      return change.unsaved
        ? `Deletes ${change.path} and its unstaged edits`
        : `Deletes ${change.path} from the Workbench`;
  }
}

/** "Takes 2 commits off main, newest "add login"": the history Kyle would lose. */
function describeDropped(change: Extract<GitChange, { kind: 'dropped' }>): string {
  const where = change.branch ?? 'HEAD';
  const [newest] = change.commits;
  const which = newest === undefined ? '' : `, newest "${newest.message}"`;
  if (change.commits.length === 1)
    return `Takes the commit "${newest?.message ?? ''}" off ${where}`;
  return `Takes ${counted(change.commits.length, 'commit')} off ${where}${which}`;
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
