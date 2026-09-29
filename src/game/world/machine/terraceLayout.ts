import { joinPath } from '../../../engine/fs/paths';
import type { ListedItem, MachineQueries } from '../../../engine/machine/queries';

/**
 * Caps on what the Folder Terraces draw (docs/act1-directed.md section 9.2). Past these
 * the island gets cluttered and slow, so what doesn't fit becomes its folder's "+N".
 */
export const MAX_TILES = 40;
export const MAX_CARDS = 24;

/** A folder, drawn as a hex tile on the terrace for its depth. */
export interface TerraceTile {
  /** Canonical and spelled as stored: 'Users/kyle'. '' is the C:\ pad. */
  readonly path: string;
  /** The label: 'kyle', or 'C:\' for the pad. */
  readonly name: string;
  /** Which terrace: 0 is the C:\ pad, 1 is Users, 2 is kyle. */
  readonly depth: number;
  /** Its place along its terrace, from 0. Numbered in tree order, so siblings sit together. */
  readonly slot: number;
  /** The folder it sits in, always drawn too. Null for the pad. */
  readonly parent: string | null;
  /** It has the Hidden attribute, like AppData, so it's only drawn when something points at it. */
  readonly hidden: boolean;
  /** How many items a plain dir lists here that aren't drawn: the "+N" badge. */
  readonly more: number;
}

/** A file, drawn as a card lying on its folder's tile. */
export interface TerraceCard {
  readonly path: string;
  readonly name: string;
  /** The tile it lies on. */
  readonly folder: string;
  /** Its place among that tile's cards, from 0, in dir's order. */
  readonly slot: number;
  readonly hidden: boolean;
}

export interface TerraceSpec {
  /** Every tile comes after the folder it sits in. */
  readonly tiles: readonly TerraceTile[];
  /** Grouped by tile, in the tiles' order. */
  readonly cards: readonly TerraceCard[];
}

export interface TerraceOptions {
  /** The step's focus: folders (or files) the terraces must show, with what each folder holds. */
  readonly focus?: readonly string[];
}

/** One part of a path that exists, spelled as stored. */
interface Part {
  readonly path: string;
  readonly name: string;
  readonly kind: 'file' | 'folder';
  readonly hidden: boolean;
}

type Lister = (folder: string) => readonly ListedItem[];

/** Windows paths match in any case, so every lookup goes through the lower-case path. */
const keyOf = (path: string) => path.toLowerCase();

const partIn = (folder: string, item: ListedItem): Part => ({
  path: joinPath(folder, item.name),
  name: item.name,
  kind: item.kind,
  hidden: item.hidden,
});

/** q.list that remembers: one layout asks about the same folders several times. */
function rememberListings(q: MachineQueries): Lister {
  const listings = new Map<string, readonly ListedItem[]>();
  return (folder) => {
    const listing = listings.get(keyOf(folder)) ?? q.list(folder);
    listings.set(keyOf(folder), listing);
    return listing;
  };
}

/**
 * The parts of a path that exist, from the top, spelled as stored: 'users/KYLE/nope' finds
 * Users and kyle. `complete` says whether all of it exists. A file ends the walk.
 */
function walk(list: Lister, path: string): { parts: readonly Part[]; complete: boolean } {
  const segments = path.split('/').filter((segment) => segment !== '');
  const parts: Part[] = [];
  let folder = '';
  for (const segment of segments) {
    const item = list(folder).find((listed) => keyOf(listed.name) === keyOf(segment));
    if (item === undefined) break;
    const part = partIn(folder, item);
    parts.push(part);
    if (part.kind === 'file') break;
    folder = part.path;
  }
  return { parts, complete: parts.length === segments.length };
}

/** Which folders get tiles and which files get cards, chosen most important first. */
function choose(list: Lister, routes: readonly string[], opened: readonly string[]) {
  const tiles = new Set<string>([keyOf('')]); // the C:\ pad: every route starts there
  const cards = new Set<string>();
  const addTile = (part: Part) => {
    if (tiles.size < MAX_TILES) tiles.add(keyOf(part.path));
    return tiles.has(keyOf(part.path));
  };
  const addCard = (part: Part) => {
    if (cards.size < MAX_CARDS) cards.add(keyOf(part.path));
  };

  // The folders on the way to each path, top down, and the path itself if it's a file.
  // For a path that's gone or not made yet, the folders above it that exist.
  for (const path of routes) {
    const { parts, complete } = walk(list, path);
    for (const part of parts) {
      if (part.kind === 'file') {
        if (complete) addCard(part);
      } else if (!addTile(part)) break; // out of tiles: nothing deeper has a tile under it
    }
  }
  // What a plain dir shows in each opened folder that got a tile.
  for (const path of opened) {
    const { parts, complete } = walk(list, path);
    const folder = parts.at(-1);
    const folderPath = folder?.path ?? '';
    if (!complete || folder?.kind === 'file' || !tiles.has(keyOf(folderPath))) continue;
    for (const item of list(folderPath).filter((listed) => !listed.hidden)) {
      const part = partIn(folderPath, item);
      if (part.kind === 'folder') addTile(part);
      else addCard(part);
    }
  }
  return (path: string) => tiles.has(keyOf(path)) || cards.has(keyOf(path));
}

/**
 * What the Folder Terraces show of the laptop (docs/act1-directed.md section 4). Pure:
 * the same laptop and options always give the same terraces, so the world can redraw
 * after any action without knowing which one ran.
 *
 * Chosen most important first, until the caps run out:
 * 1. the C:\ pad, and the route to every tab's folder (the active tab's first) and home
 * 2. the step's focus paths, each with its route
 * 3. what a plain dir shows in each tab's folder, in home, and in each focus folder
 *
 * Hidden items (AppData) are left out of listings, as `dir` leaves them out, but drawn
 * when a tab or the focus points at them.
 */
export function describeTerraces(q: MachineQueries, options: TerraceOptions = {}): TerraceSpec {
  const { focus = [] } = options;
  const list = rememberListings(q);
  const tabs = q.tabs();
  const byImportance = [...tabs.filter((tab) => tab.active), ...tabs.filter((tab) => !tab.active)];
  const wanted = [...byImportance.map((tab) => tab.cwd), q.home(), ...focus];
  const drawn = choose(list, wanted, wanted);

  const tiles: TerraceTile[] = [];
  const cards: TerraceCard[] = [];
  const slotsUsed: number[] = [];
  // Walk the drawn folders as a tree, in dir's order, so every run places them alike.
  const place = (tile: Omit<TerraceTile, 'slot' | 'more'>) => {
    const listing = list(tile.path);
    const slot = slotsUsed[tile.depth] ?? 0;
    slotsUsed[tile.depth] = slot + 1;
    const inside = listing.map((item) => partIn(tile.path, item));
    const more = inside.filter((part) => !part.hidden && !drawn(part.path)).length;
    tiles.push({ ...tile, slot, more });
    const shown = inside.filter((part) => drawn(part.path));
    shown
      .filter((part) => part.kind === 'file')
      .forEach(({ path, name, hidden }, cardSlot) => {
        cards.push({ path, name, folder: tile.path, slot: cardSlot, hidden });
      });
    for (const { path, name, hidden, kind } of shown) {
      if (kind === 'folder')
        place({ path, name, depth: tile.depth + 1, parent: tile.path, hidden });
    }
  };
  place({ path: '', name: q.display(''), depth: 0, parent: null, hidden: false });
  return { tiles, cards };
}
