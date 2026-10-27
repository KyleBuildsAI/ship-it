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

/**
 * The floor of one crate area, in world units from its anchor in gitWorld.ts: crates
 * go from `left` across `width`, and rows step back from `firstRow` by `rowDepth`.
 */
export interface CrateFloor {
  readonly left: number;
  readonly width: number;
  readonly rows: number;
  readonly firstRow: number;
  readonly rowDepth: number;
  /** The narrowest a column gets: one crate and the gap beside it. */
  readonly minColumn: number;
}

export const CRATE_FLOORS: Readonly<Record<CrateArea, CrateFloor>> = {
  // The Workbench's top is 7 wide and 3 deep: eight short names fit in a row.
  bench: { left: -3.52, width: 7.04, rows: 3, firstRow: -0.9, rowDepth: 0.9, minColumn: 0.88 },
  // The Loading Dock is 4.2 wide; the margin keeps crates off its edges.
  dock: { left: -1.94, width: 3.88, rows: 3, firstRow: -1, rowDepth: 1, minColumn: 0.97 },
  // On the ground beside the Workbench, stopping short of its end.
  blocklist: { left: -0.4, width: 2.6, rows: 4, firstRow: -1.2, rowDepth: 0.85, minColumn: 0.8 },
};

/** Clear space between two neighbouring labels, so two names never read as one. */
export const LABEL_GAP = 0.12;

/** Rounding in a sum of widths must never cost a floor a column it has room for. */
const ROUNDING = 1e-9;

export interface CratePlace {
  readonly column: number;
  readonly row: number;
  readonly layer: number;
  /** The middle of the crate's column, measured from the floor's left edge. */
  readonly x: number;
}

/** How wide each column must be for every label in it, with `columns` across. */
function columnWidths(labels: readonly number[], columns: number, floor: CrateFloor): number[] {
  const widths = Array.from({ length: columns }, () => floor.minColumn);
  labels.forEach((label, slot) => {
    const { column } = gridCell(slot, columns, floor.rows);
    widths[column] = Math.max(widths[column] ?? floor.minColumn, label + LABEL_GAP);
  });
  return widths;
}

const total = (widths: readonly number[]) => widths.reduce((sum, width) => sum + width, 0);

/**
 * Where each crate on a floor goes, so no two names overlap: crates fill rows in reading
 * order, and each column is as wide as the longest label in it. As many columns are used
 * as fit across the floor, so short names share one row and long ones wrap onto the next.
 * Once every row is full, crates stack on the same columns, as before.
 */
export function placeCrates<T>(
  crates: readonly T[],
  labelWidth: (crate: T) => number,
  floor: CrateFloor,
): { crate: T; place: CratePlace }[] {
  const labels = crates.map(labelWidth);
  let columns = Math.max(1, labels.length);
  let widths = columnWidths(labels, columns, floor);
  // A name wider than the whole floor still gets a column: it just has a row to itself.
  while (columns > 1 && total(widths) > floor.width + ROUNDING) {
    columns -= 1;
    widths = columnWidths(labels, columns, floor);
  }
  return crates.map((crate, slot) => {
    const cell = gridCell(slot, columns, floor.rows);
    const before = total(widths.slice(0, cell.column));
    const own = widths[cell.column] ?? floor.minColumn;
    return { crate, place: { ...cell, x: before + own / 2 } };
  });
}
