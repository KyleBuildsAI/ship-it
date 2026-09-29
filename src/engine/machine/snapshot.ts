import { baseName, isWithin, joinPath, parentDir } from '../fs/paths';
import type { EngineEvent } from '../workspace';
import type { EnvTable } from './envTable';
import type { EnvScope } from './events';
import type { Machine } from './machine';

/**
 * One thing that changed on the laptop, as the approval card and the world show it. Paths
 * are canonical ('Users/kyle/notes'). A change names files and variables but never carries
 * what's in them, so no effects list or ghost can leak a secret.
 */
export type MachineChange =
  | {
      readonly kind: 'moved';
      readonly from: string;
      readonly to: string;
      readonly item: 'file' | 'folder';
      /** A copy leaves the original where it was. */
      readonly copy: boolean;
    }
  | { readonly kind: 'created'; readonly path: string; readonly item: 'file' | 'folder' }
  | {
      readonly kind: 'deleted';
      readonly path: string;
      readonly item: 'file' | 'folder';
      /** How many files and folders were inside it, at any depth. They went with it. */
      readonly inside: number;
    }
  | {
      readonly kind: 'modified';
      readonly path: string;
      /** 'appended' kept everything the file had; 'replaced' lost some of it. */
      readonly how: 'appended' | 'replaced';
    }
  | {
      readonly kind: 'env';
      readonly scope: EnvScope;
      /** The terminal tab, for session variables; null for saved ones. */
      readonly tab: number | null;
      readonly name: string;
      readonly change: 'set' | 'removed' | 'changed';
    }
  | { readonly kind: 'location'; readonly tab: number; readonly from: string; readonly to: string }
  | { readonly kind: 'terminal'; readonly tab: number; readonly change: 'opened' | 'closed' };

type SnapshotItem =
  { readonly item: 'folder' } | { readonly item: 'file'; readonly content: string };

/** Files and folders by canonical path, in the order a recursive listing walks them. */
type SnapshotItems = ReadonlyMap<string, SnapshotItem>;

/** A variable's value, and whether it expands %NAME% references when a terminal opens. */
interface SnapshotVariable {
  readonly name: string;
  readonly value: string;
  readonly expands: boolean;
}

/** Variables by upper-case name, because Windows ignores case in variable names. */
type SnapshotEnv = ReadonlyMap<string, SnapshotVariable>;

interface SnapshotTab {
  /** A restarted tab keeps its number but gets a new process: the pid tells them apart. */
  readonly pid: number;
  readonly cwd: string;
  readonly env: SnapshotEnv;
}

/**
 * A frozen copy of everything on the laptop an action can change: every file and folder on
 * C:, the saved variables, and each open tab's folder and variables. It holds file contents
 * and variable values, so it stays inside the engine. Only diffSnapshots' changes, which
 * carry names, go out to the world and the UI.
 */
export interface MachineSnapshot {
  readonly items: SnapshotItems;
  readonly saved: { readonly machine: SnapshotEnv; readonly user: SnapshotEnv };
  /** Open tabs by number. */
  readonly tabs: ReadonlyMap<number, SnapshotTab>;
}

/**
 * What Copy-Item, Move-Item and Rename-Item announce. It's declared here because those
 * cmdlets arrive later, in chain 2, where MachineEvent gains this same shape.
 */
export interface ItemMovedEvent {
  readonly type: 'itemMoved';
  readonly from: string;
  readonly to: string;
  readonly kind: 'file' | 'folder';
  readonly copy: boolean;
}

export function snapshotMachine(machine: Machine): MachineSnapshot {
  const items = new Map<string, SnapshotItem>();
  // A folder goes in before what's inside it, which is what lets deletes collapse later.
  const walk = (folder: string): void => {
    for (const entry of machine.drive.listDir(folder)) {
      const path = joinPath(folder, entry.name);
      if (entry.kind === 'file') {
        items.set(path, { item: 'file', content: machine.drive.readFile(path) });
        continue;
      }
      items.set(path, { item: 'folder' });
      walk(path);
    }
  };
  walk('');
  const tabs = new Map<number, SnapshotTab>();
  for (const tab of machine.sessions()) {
    tabs.set(tab.id, { pid: tab.pid, cwd: tab.cwd, env: copyEnv(tab.env) });
  }
  const saved = { machine: copyEnv(machine.saved.machine), user: copyEnv(machine.saved.user) };
  return { items, saved, tabs };
}

function copyEnv(table: EnvTable): SnapshotEnv {
  const copy = new Map<string, SnapshotVariable>();
  for (const { name, value } of table.entries()) {
    copy.set(name.toUpperCase(), { name, value, expands: table.expands(name) });
  }
  return copy;
}

/**
 * What changed between two snapshots, in the order the kinds are declared in MachineChange.
 * A deleted folder is one change that counts what was inside it. Comparing states, rather
 * than replaying events, means a folder made and removed again is no change at all.
 *
 * Events are optional, and only their itemMoved events are read: they say which item went
 * where, which two states alone can't. Without them, a moved item shows as a delete plus a
 * create.
 */
export function diffSnapshots(
  before: MachineSnapshot,
  after: MachineSnapshot,
  events: readonly (EngineEvent | ItemMovedEvent)[] = [],
): MachineChange[] {
  return [
    ...diffItems(before.items, after.items, followMoves(before.items, events)),
    ...diffEnv(before.saved.machine, after.saved.machine, 'machine', null),
    ...diffEnv(before.saved.user, after.saved.user, 'user', null),
    ...diffTabs(before.tabs, after.tabs),
  ];
}

/** An item from the before snapshot, at the path the moves have taken it to. */
interface Placed {
  /** Its path in the before snapshot. */
  readonly origin: string;
  /** Made by a copy, so the original didn't leave. */
  readonly copy: boolean;
}

/**
 * Follows every item in the before snapshot through the moves, in the order they happened,
 * and returns each one by the path it's at now. A moved folder takes everything in it
 * along, including what earlier moves put there, so `mv notes.txt api` then `mv api server`
 * leaves notes.txt at server/notes.txt, still from notes.txt. Whatever stood at a move's
 * destination is written over. Whatever a copy made stays a copy wherever it goes next.
 *
 * Only moves are followed. Anything deleted or made along the way shows up when the result
 * is compared with the after snapshot.
 */
function followMoves(
  before: SnapshotItems,
  events: readonly (EngineEvent | ItemMovedEvent)[],
): ReadonlyMap<string, Placed> {
  const where = new Map<string, Placed>();
  for (const path of before.keys()) where.set(path, { origin: path, copy: false });
  for (const event of events) {
    if (event.type !== 'itemMoved' || event.from === event.to) continue;
    const carried = [...where].filter(([path]) => isWithin(path, event.from));
    for (const path of [...where.keys()]) {
      const left = !event.copy && isWithin(path, event.from);
      if (left || isWithin(path, event.to)) where.delete(path);
    }
    for (const [path, placed] of carried) {
      const copy = placed.copy || event.copy;
      where.set(reroot(path, event.from, event.to), { origin: placed.origin, copy });
    }
  }
  return where;
}

/** The same place under another folder: 'b/x', moved from under 'b' to under 'a', is 'a/x'. */
function reroot(path: string, from: string, to: string): string {
  return to + path.slice(from.length);
}

function diffItems(
  before: SnapshotItems,
  after: SnapshotItems,
  where: ReadonlyMap<string, Placed>,
): MachineChange[] {
  // An item is followed only if it's still where the moves left it, as the same kind of
  // item. Otherwise it was deleted or replaced along the way.
  const followed = new Map<string, Placed>();
  // The items from before that are still somewhere. A copy doesn't keep its original.
  const kept = new Set<string>();
  for (const [path, placed] of where) {
    if (after.get(path)?.item !== before.get(placed.origin)?.item) continue;
    followed.set(path, placed);
    if (!placed.copy) kept.add(placed.origin);
  }
  const moved: MachineChange[] = [];
  const created: MachineChange[] = [];
  const modified: MachineChange[] = [];
  const made = new Set<string>();
  // Paths whose item from before was lost, with one of the same kind standing there now.
  const takenOver = new Set<string>();
  for (const [path, now] of after) {
    const placed = followed.get(path);
    const was = before.get(path);
    // The item that was here is gone, but not moved away, and another took its place in the
    // same folder: a file written over by a copy or Move-Item -Force, or written again. It
    // counts as the old file changed, so the content it lost still shows.
    const tookOver = was?.item === now.item && !kept.has(path) && !made.has(parentDir(path));
    if (placed === undefined && !tookOver) {
      // New, even where a moved item used to be: that one is somewhere else now.
      created.push({ kind: 'created', path, item: now.item });
      made.add(path);
      continue;
    }
    if (tookOver) takenOver.add(path);
    if (placed !== undefined && placed.origin !== path && !cameWithFolder(path, placed, followed))
      moved.push({
        kind: 'moved',
        from: placed.origin,
        to: path,
        item: now.item,
        copy: placed.copy,
      });
    // A file that took over is compared with the one it replaced; any other, with where it
    // came from, so an edit after a move still shows.
    const baseline = tookOver || placed === undefined ? was : before.get(placed.origin);
    if (now.item !== 'file' || baseline?.item !== 'file' || baseline.content === now.content)
      continue;
    const how = now.content.startsWith(baseline.content) ? 'appended' : 'replaced';
    modified.push({ kind: 'modified', path, how });
  }
  const deleted = new Map([...before].filter(([path]) => !kept.has(path) && !takenOver.has(path)));
  return [...moved, ...created, ...collapseDeletes(deleted), ...modified];
}

/**
 * Whether an item only came along when its folder moved, so the folder's own move covers
 * it: its folder came from its old folder, the same way (moved or copied), and it kept its
 * name.
 */
function cameWithFolder(
  path: string,
  placed: Placed,
  followed: ReadonlyMap<string, Placed>,
): boolean {
  const folder = followed.get(parentDir(path));
  return (
    folder?.origin === parentDir(placed.origin) &&
    folder.copy === placed.copy &&
    baseName(path) === baseName(placed.origin)
  );
}

/**
 * One change per deleted file or folder, not one per item inside it: "Deletes api and 23
 * items inside". Because the walk lists a folder right before its contents, everything
 * inside a deleted folder arrives straight after it.
 */
function collapseDeletes(deleted: SnapshotItems): MachineChange[] {
  const tops: { path: string; item: 'file' | 'folder'; inside: number }[] = [];
  for (const [path, was] of deleted) {
    const holder = tops.at(-1);
    if (holder !== undefined && isWithin(path, holder.path)) holder.inside += 1;
    else tops.push({ path, item: was.item, inside: 0 });
  }
  return tops.map((top) => ({ kind: 'deleted', ...top }));
}

function diffEnv(
  before: SnapshotEnv,
  after: SnapshotEnv,
  scope: EnvScope,
  tab: number | null,
): MachineChange[] {
  const envChange = (name: string, change: 'set' | 'removed' | 'changed'): MachineChange => ({
    kind: 'env',
    scope,
    tab,
    name,
    change,
  });
  const changes: MachineChange[] = [];
  for (const [key, was] of before) {
    if (!after.has(key)) changes.push(envChange(was.name, 'removed'));
  }
  for (const [key, now] of after) {
    const was = before.get(key);
    if (was === undefined) changes.push(envChange(now.name, 'set'));
    // Saving the same Path as plain text stops %USERPROFILE% expanding, so that's a change too.
    else if (was.value !== now.value || was.expands !== now.expands) {
      changes.push(envChange(now.name, 'changed'));
    }
  }
  return changes;
}

/**
 * A tab that stayed open reports its own variables and where it moved. A tab that closed,
 * opened, or restarted (same number, new process) reports only that: its old notes and
 * folder went with the old process.
 */
function diffTabs(
  before: ReadonlyMap<number, SnapshotTab>,
  after: ReadonlyMap<number, SnapshotTab>,
): MachineChange[] {
  const env: MachineChange[] = [];
  const locations: MachineChange[] = [];
  const terminals: MachineChange[] = [];
  for (const [tab, was] of before) {
    const now = after.get(tab);
    if (now?.pid !== was.pid) {
      terminals.push({ kind: 'terminal', tab, change: 'closed' });
      continue;
    }
    env.push(...diffEnv(was.env, now.env, 'session', tab));
    if (now.cwd !== was.cwd) locations.push({ kind: 'location', tab, from: was.cwd, to: now.cwd });
  }
  for (const [tab, now] of after) {
    if (before.get(tab)?.pid !== now.pid) {
      terminals.push({ kind: 'terminal', tab, change: 'opened' });
    }
  }
  return [...env, ...locations, ...terminals];
}
