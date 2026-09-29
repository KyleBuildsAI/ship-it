import { joinPath } from '../../../engine/fs/paths';
import type { ListedItem, MachineQueries, TabState } from '../../../engine/machine/queries';

/**
 * Caps on what the Folder Terraces draw (docs/act1-directed.md section 9.2). Past these
 * the island gets cluttered and slow, so what doesn't fit becomes its folder's "+N".
 */
export const MAX_TILES = 40;
export const MAX_CARDS = 24;
export const MAX_LANTERNS = 6;

/** A folder, drawn as a hex tile on the terrace for its depth. */
export interface TerraceTile {
  /** Canonical and spelled as stored: 'Users/kyle'. '' is the C:\ pad. */
  readonly path: string;
  /** The label: 'kyle', or 'C:\' for the pad. */
  readonly name: string;
  /** Which terrace: 0 is the C:\ pad, 1 is Users, 2 is kyle. */
  readonly depth: number;
  /**
   * Its place among the drawn folders in its parent, from 0, in dir's order, the way a
   * card's slot counts along its tile. So only its siblings can move it: another tab's cd
   * elsewhere never does, but a new folder made before it does. The world keys tiles by
   * path and slides any whose place changed.
   */
  readonly slot: number;
  /** The folder it sits in, always drawn too. Null for the pad. */
  readonly parent: string | null;
  /** It has the Hidden attribute, like AppData, so it's only drawn when something points at it. */
  readonly hidden: boolean;
  /** An event named it lately, so the world pulses it. */
  readonly recent: boolean;
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
  readonly recent: boolean;
}

/** A terminal tab, drawn as a lantern labelled "PS n" standing on its folder. */
export interface Lantern {
  readonly tab: number;
  readonly label: string;
  /** The folder the tab stands in. */
  readonly folder: string;
  /**
   * The tile it stands on: its folder's, or, when the caps left that out or another tab
   * removed the folder, the nearest drawn folder above it.
   */
  readonly tile: string;
  /** The tab Otto types in next, drawn brighter. */
  readonly active: boolean;
}

export interface TerraceSpec {
  /** Every tile comes after the folder it sits in. */
  readonly tiles: readonly TerraceTile[];
  /** Grouped by tile, in the tiles' order. */
  readonly cards: readonly TerraceCard[];
  /** In tab order. The active tab always has one. */
  readonly lanterns: readonly Lantern[];
  /** Open tabs past the lantern cap. */
  readonly moreTerminals: number;
  /** The signpost: the active tab's folder one name at a time, 'C:\' first. Empty with no tab. */
  readonly breadcrumb: readonly string[];
}

export interface TerraceOptions {
  /** The step's focus: folders (or files) the terraces must show, with what each folder holds. */
  readonly focus?: readonly string[];
  /** Paths events named lately, most important first: drawn wherever they are, and pulsed. */
  readonly recent?: readonly string[];
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

/** The tabs that get a lantern: the active one first, then the rest in tab order, to the cap. */
function withLanterns(tabs: readonly TabState[]): TabState[] {
  const byImportance = [...tabs.filter((tab) => tab.active), ...tabs.filter((tab) => !tab.active)];
  return byImportance.slice(0, MAX_LANTERNS);
}

/** Each lantern on its folder's tile, or on the nearest drawn folder above it. In tab order. */
function standLanterns(list: Lister, lit: readonly TabState[], drawn: (path: string) => boolean) {
  return lit
    .map((tab): Lantern => {
      const standing = walk(list, tab.cwd).parts.filter(
        (part) => part.kind === 'folder' && drawn(part.path),
      );
      const tile = standing.at(-1)?.path ?? ''; // nothing drawn below it: the C:\ pad
      return {
        tab: tab.tab,
        label: `PS ${String(tab.tab)}`,
        folder: tab.cwd,
        tile,
        active: tab.active,
      };
    })
    .sort((a, b) => a.tab - b.tab);
}

/**
 * What the Folder Terraces show of the laptop (docs/act1-directed.md section 4). Pure:
 * the same laptop and options always give the same terraces, so the world can redraw
 * after any action without knowing which one ran.
 *
 * Chosen most important first, until the caps run out:
 * 1. the C:\ pad, and the route to every lantern's folder (the active tab's first) and home
 * 2. the step's focus paths, then the recent ones, each with its route
 * 3. what a plain dir shows in each lantern's folder, in home, and in each focus folder
 *
 * Hidden items (AppData) are left out of listings, as `dir` leaves them out, but drawn
 * when a tab, the focus or an event points at them.
 */
export function describeTerraces(q: MachineQueries, options: TerraceOptions = {}): TerraceSpec {
  const { focus = [], recent = [] } = options;
  const list = rememberListings(q);
  const tabs = q.tabs();
  const lit = withLanterns(tabs);
  const wanted = [...lit.map((tab) => tab.cwd), q.home(), ...focus];
  const drawn = choose(list, [...wanted, ...recent], wanted);
  const isRecent = (path: string) => recent.some((named) => keyOf(named) === keyOf(path));

  const tiles: TerraceTile[] = [];
  const cards: TerraceCard[] = [];
  // Walk the drawn folders as a tree, in dir's order, so every run places them alike.
  const place = (tile: Omit<TerraceTile, 'more' | 'recent'>) => {
    const inside = list(tile.path).map((item) => partIn(tile.path, item));
    const more = inside.filter((part) => !part.hidden && !drawn(part.path)).length;
    tiles.push({ ...tile, more, recent: isRecent(tile.path) });
    const shown = inside.filter((part) => drawn(part.path));
    shown
      .filter((part) => part.kind === 'file')
      .forEach(({ path, name, hidden }, slot) => {
        cards.push({ path, name, folder: tile.path, slot, hidden, recent: isRecent(path) });
      });
    shown
      .filter((part) => part.kind === 'folder')
      .forEach(({ path, name, hidden }, slot) => {
        place({ path, name, depth: tile.depth + 1, slot, parent: tile.path, hidden });
      });
  };
  place({ path: '', name: q.display(''), depth: 0, slot: 0, parent: null, hidden: false });

  const active = tabs.find((tab) => tab.active);
  // Spelled as the tab stores it, so the signpost matches the prompt, even for a folder
  // another tab has removed (the prompt keeps showing it).
  const breadcrumb =
    active === undefined
      ? []
      : [q.display(''), ...active.cwd.split('/').filter((name) => name !== '')];
  const lanterns = standLanterns(list, lit, drawn);
  return { tiles, cards, lanterns, moreTerminals: tabs.length - lit.length, breadcrumb };
}
