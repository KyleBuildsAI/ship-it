import { isWithin, joinPath } from '../fs/paths';
import type { EnvTable } from './envTable';
import type { EnvScope } from './events';
import type { Machine } from './machine';

/**
 * One thing that changed on the laptop, as the approval card and the world show it. Paths
 * are canonical ('Users/kyle/notes'). A change names files and variables but never carries
 * what's in them, so no effects list or ghost can leak a secret.
 */
export type MachineChange =
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
 * than replaying events, means a folder made and removed again is no change at all. A moved
 * item shows as a delete plus a create, because that's all two states can show.
 */
export function diffSnapshots(before: MachineSnapshot, after: MachineSnapshot): MachineChange[] {
  return [
    ...diffItems(before.items, after.items),
    ...diffEnv(before.saved.machine, after.saved.machine, 'machine', null),
    ...diffEnv(before.saved.user, after.saved.user, 'user', null),
    ...diffTabs(before.tabs, after.tabs),
  ];
}

function diffItems(before: SnapshotItems, after: SnapshotItems): MachineChange[] {
  // A path whose item changed kind (a folder became a file) is both deleted and created.
  const created = [...after].filter(([path, now]) => before.get(path)?.item !== now.item);
  const deleted = new Map([...before].filter(([path, was]) => after.get(path)?.item !== was.item));
  const modified: MachineChange[] = [];
  for (const [path, now] of after) {
    const was = before.get(path);
    if (now.item !== 'file' || was?.item !== 'file' || was.content === now.content) continue;
    const how = now.content.startsWith(was.content) ? 'appended' : 'replaced';
    modified.push({ kind: 'modified', path, how });
  }
  return [
    ...created.map(([path, now]): MachineChange => ({ kind: 'created', path, item: now.item })),
    ...collapseDeletes(deleted),
    ...modified,
  ];
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
