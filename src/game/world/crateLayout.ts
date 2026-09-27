import type { Workspace } from '../../engine/workspace';

/** Where a crate sits: on the Workbench, on the Loading Dock, or behind the blocklist sign. */
export type CrateArea = 'bench' | 'dock' | 'blocklist';

/**
 * How a crate looks (DESIGN.md section 4): modified crates glow amber, untracked crates
 * have no label, ignored crates are greyed out, and a deleted file is a ghost outline.
 */
export type CrateLook =
  | 'clean'
  | 'modified'
  | 'untracked'
  | 'ignored'
  | 'deleted'
  | 'staged-new'
  | 'staged-change'
  | 'staged-delete';

export interface CrateSpec {
  /** Stable identity across updates, so the same crate animates instead of popping. */
  readonly key: string;
  readonly path: string;
  readonly area: CrateArea;
  readonly look: CrateLook;
  /** Position in its area's grid, in reading order. */
  readonly slot: number;
}

const byPath = (a: string, b: string) => (a < b ? -1 : 1);

/**
 * Turns the sandbox's files and git status into the crates the Git World shows. Pure:
 * the same workspace state always gives the same crates, which is what lets the world
 * redraw after any command without knowing which command ran.
 */
export function describeCrates(ws: Workspace): CrateSpec[] {
  const bench: { path: string; look: CrateLook }[] = [];
  const blocklist: string[] = [];
  const dock: { path: string; look: CrateLook }[] = [];

  if (ws.repo === null) {
    // Before git init nothing is tracked yet: every file is an unlabeled crate.
    ws.fs.allFiles().forEach((path) => bench.push({ path, look: 'untracked' }));
  } else {
    const status = ws.status();
    const modified = new Set(
      status.unstaged.filter((change) => change.kind === 'modified').map((change) => change.path),
    );
    const ignored = new Set(status.ignored);
    const untracked = new Set(status.untracked);
    for (const path of ws.fs.allFiles()) {
      if (ignored.has(path)) blocklist.push(path);
      else if (untracked.has(path)) bench.push({ path, look: 'untracked' });
      else bench.push({ path, look: modified.has(path) ? 'modified' : 'clean' });
    }
    status.unstaged
      .filter((change) => change.kind === 'deleted')
      .forEach((change) => bench.push({ path: change.path, look: 'deleted' }));
    for (const change of status.staged) {
      const look: CrateLook =
        change.kind === 'deleted'
          ? 'staged-delete'
          : change.kind === 'modified'
            ? 'staged-change'
            : 'staged-new';
      dock.push({ path: change.path, look });
    }
  }

  bench.sort((a, b) => byPath(a.path, b.path));
  blocklist.sort(byPath);
  dock.sort((a, b) => byPath(a.path, b.path));
  return [
    ...bench.map(({ path, look }, slot) => ({
      key: `bench:${path}`,
      path,
      area: 'bench' as const,
      look,
      slot,
    })),
    ...blocklist.map((path, slot) => ({
      key: `blocklist:${path}`,
      path,
      area: 'blocklist' as const,
      look: 'ignored' as const,
      slot,
    })),
    ...dock.map(({ path, look }, slot) => ({
      key: `dock:${path}`,
      path,
      area: 'dock' as const,
      look,
      slot,
    })),
  ];
}

/** Grid position for a slot: `columns` across, then rows, then stacked layers. */
export function gridCell(
  slot: number,
  columns: number,
  rows: number,
): { column: number; row: number; layer: number } {
  const perLayer = columns * rows;
  const layer = Math.floor(slot / perLayer);
  const inLayer = slot % perLayer;
  return { column: inLayer % columns, row: Math.floor(inLayer / columns), layer };
}
