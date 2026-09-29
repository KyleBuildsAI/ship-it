import { describe, expect, it } from 'vitest';
import { windows } from '../../../engine/fixtures';
import { testDeps } from '../../../engine/git/testDeps';
import { machineQueries } from '../../../engine/machine/queries';
import { recordMachineEvents } from '../../../engine/machine/testDeps';
import {
  describeTerraces,
  MAX_CARDS,
  MAX_LANTERNS,
  MAX_TILES,
  type TerraceSpec,
} from './terraceLayout';

const HOME = 'Users/kyle';
const API = 'Users/kyle/quillwork/api';
const WEB = 'Users/kyle/quillwork/web';

/** Mission 1.1's laptop in miniature: the API and the web app side by side, one tab at home. */
function laptop() {
  const ws = windows({ mount: API })
    .files({
      [`${API}/package.json`]: '{}\n',
      [`${API}/server.js`]: 'listen()\n',
      [`${API}/src/routes/notes.js`]: 'route()\n',
      [`${WEB}/index.html`]: '<main></main>\n',
    })
    .session()
    .build(testDeps());
  const machine = ws.machine;
  if (machine === null) throw new Error('Not a laptop');
  return { machine, q: machineQueries(machine) };
}

/** The tiles as an indented tree with each "+N" badge, so a test reads like the island. */
const tree = (spec: TerraceSpec) =>
  spec.tiles.map(
    (tile) =>
      `${'  '.repeat(tile.depth)}${tile.name}${tile.more > 0 ? ` +${String(tile.more)}` : ''}`,
  );
const cardPaths = (spec: TerraceSpec) => spec.cards.map((card) => card.path);
const tilePaths = (spec: TerraceSpec) => spec.tiles.map((tile) => tile.path);
const badge = (spec: TerraceSpec, path: string) =>
  spec.tiles.find((tile) => tile.path === path)?.more;

describe('describeTerraces', () => {
  it("draws a fresh terminal's route from C:\\, and what dir shows at home", () => {
    const { q } = laptop();
    expect(tree(describeTerraces(q))).toEqual([
      'C:\\ +2', // Program Files and Windows
      '  Users',
      '    kyle',
      '      Desktop',
      '      Documents',
      '      Downloads',
      '      quillwork +2', // api and web: nothing points there yet
    ]);
  });

  it('shows the focus with the folders on its way, and what the focus folder holds', () => {
    const { q } = laptop();
    const spec = describeTerraces(q, { focus: [API] });
    expect(tree(spec).slice(-3)).toEqual([
      '      quillwork +1', // web
      '        api',
      '          src +1', // routes: the API is open, but src isn't
    ]);
    expect(cardPaths(spec)).toEqual([`${API}/package.json`, `${API}/server.js`]);
  });

  it("shows a focus folder that isn't made yet by the folder it will go in", () => {
    const { machine, q } = laptop();
    expect(tree(describeTerraces(q, { focus: [`${WEB}/notes`] })).at(-1)).toBe('        web +1');
    machine.drive.makeDir(`${WEB}/notes`);
    // web itself isn't the focus, so its index.html stays a "+1".
    expect(tree(describeTerraces(q, { focus: [`${WEB}/notes`] })).slice(-2)).toEqual([
      '        web +1',
      '          notes',
    ]);
  });

  it('finds focus paths in any case, and shows a focus file as a card', () => {
    const { q } = laptop();
    const spec = describeTerraces(q, { focus: ['users/KYLE/Quillwork/API/Package.json'] });
    expect(cardPaths(spec)).toEqual([`${API}/package.json`]);
    expect(tree(spec).at(-1)).toBe('        api +2'); // the file alone, not the whole folder
    // A file has nothing inside it, so a path through one draws no card for it.
    const through = describeTerraces(q, { focus: [`${API}/package.json/notes`] });
    expect(cardPaths(through)).toEqual([]);
  });

  it("draws every tab's folder with what's in it, in tree order, numbered among siblings", () => {
    const { machine, q } = laptop();
    machine.drive.makeDir(`${HOME}/Documents/keys`);
    machine.setLocation(1, API, 'absolute');
    const second = machine.openSession().id;
    machine.setLocation(second, WEB, 'absolute');
    const spec = describeTerraces(q);
    expect(tree(spec).slice(-4)).toEqual([
      '      quillwork',
      '        api',
      '          src +1',
      '        web',
    ]);
    const slots = (items: readonly { name: string; slot: number }[]) =>
      items.map((item) => `${item.name}:${String(item.slot)}`);
    const terrace = (depth: number) => slots(spec.tiles.filter((tile) => tile.depth === depth));
    expect(terrace(3)).toEqual(['Desktop:0', 'Documents:1', 'Downloads:2', 'quillwork:3']);
    expect(terrace(4)).toEqual(['api:0', 'web:1']);
    // A card's slot counts along its own tile.
    expect(slots(spec.cards)).toEqual(['package.json:0', 'server.js:1', 'index.html:0']);
    expect(spec.cards.map((card) => card.folder)).toEqual([API, API, WEB]);
    // Tab 2 opening Documents draws keys ahead of api on their terrace. They aren't
    // siblings, so tab 1's folder keeps its place.
    machine.setLocation(second, `${HOME}/Documents`, 'absolute');
    const after = describeTerraces(q).tiles.filter((tile) => tile.depth === 4);
    expect(slots(after)).toEqual(['keys:0', 'api:0']);
  });

  it('opens the C:\\ pad for a tab standing there, and keeps home with no tab open', () => {
    const { machine, q } = laptop();
    machine.setLocation(1, '', 'absolute');
    expect(tree(describeTerraces(q)).slice(0, 3)).toEqual([
      'C:\\',
      '  Program Files +2',
      '  Users',
    ]);
    machine.closeSession(1);
    expect(tree(describeTerraces(q)).at(-1)).toBe('      quillwork +2');
  });

  it(`caps at ${String(MAX_TILES)} tiles and ${String(MAX_CARDS)} cards, then counts the rest`, () => {
    const { machine, q } = laptop();
    const crowded = `${HOME}/crowded`;
    const two = (index: number) => String(index).padStart(2, '0');
    for (let index = 0; index < 50; index++) machine.drive.makeDir(`${crowded}/f${two(index)}`);
    for (let index = 0; index < 30; index++)
      machine.drive.writeFile(`${crowded}/n${two(index)}.txt`, '');
    machine.setLocation(1, crowded, 'absolute');
    const spec = describeTerraces(q, { focus: [API] });
    expect(spec.tiles).toHaveLength(MAX_TILES);
    expect(spec.cards).toHaveLength(MAX_CARDS);
    // Routes come before listings, so the focus keeps its tile in a crowd.
    expect(tilePaths(spec)).toContain(API);
    // Pad, Users, kyle, crowded, quillwork and api leave 34 tiles for the 50 folders, and
    // the tab's folder opens first, so its files take all 24 cards: 16 + 6 left over.
    expect(badge(spec, crowded)).toBe(22);
    expect(badge(spec, HOME)).toBe(3); // Desktop, Documents and Downloads
    expect(badge(spec, API)).toBe(3); // src, package.json and server.js
  });

  it('cuts a route longer than the cap, and the last tile it reaches says so', () => {
    const { machine, q } = laptop();
    const deep = `${HOME}/${Array.from({ length: 45 }, () => 'd').join('/')}`;
    machine.drive.makeDir(deep);
    machine.setLocation(1, deep, 'absolute');
    const spec = describeTerraces(q);
    expect(spec.tiles).toHaveLength(MAX_TILES);
    expect(spec.tiles.at(-1)?.more).toBe(1);
    // The active tab's route goes first, so a new tab in web gets its tile.
    machine.setLocation(machine.openSession().id, WEB, 'absolute');
    expect(tilePaths(describeTerraces(q))).toContain(WEB);
  });

  it('leaves hidden items out as dir does, and draws them marked when a tab stands there', () => {
    const { machine, q } = laptop();
    machine.drive.writeFile(`${HOME}/secret.txt`, '');
    machine.drive.hide(`${HOME}/secret.txt`);
    const plain = describeTerraces(q);
    expect(tilePaths(plain)).not.toContain(`${HOME}/AppData`);
    expect(cardPaths(plain)).toEqual([]);
    expect(badge(plain, HOME)).toBe(0); // neither is counted as left out

    machine.setLocation(1, `${HOME}/AppData/Local`, 'absolute');
    const hiddenOf = (path: string) =>
      describeTerraces(q).tiles.find((tile) => tile.path === path)?.hidden;
    expect(hiddenOf(`${HOME}/AppData`)).toBe(true);
    expect(hiddenOf(`${HOME}/AppData/Local`)).toBe(false);
    const named = describeTerraces(q, { focus: [`${HOME}/secret.txt`] });
    expect(named.cards).toMatchObject([{ path: `${HOME}/secret.txt`, hidden: true }]);
  });

  it('is deterministic: the same laptop and options always give the same terraces', () => {
    const first = laptop();
    const second = laptop();
    const focus = [API, `${WEB}/index.html`];
    expect(describeTerraces(first.q, { focus })).toEqual(describeTerraces(second.q, { focus }));
    expect(describeTerraces(first.q, { focus })).toEqual(describeTerraces(first.q, { focus }));
    // Under the caps, the order paths are given in changes nothing drawn.
    const reversed = [...focus].reverse();
    expect(describeTerraces(first.q, { focus: reversed })).toEqual(
      describeTerraces(first.q, { focus }),
    );
  });

  it('only looks: drawing the terraces changes nothing and announces nothing', () => {
    const { machine, q } = laptop();
    const events = recordMachineEvents(machine);
    describeTerraces(q, { focus: [`${WEB}/notes`] });
    expect(events).toEqual([]);
    expect(machine.drive.exists(`${WEB}/notes`)).toBe(false);
  });
});

describe('describeTerraces: lanterns and the signpost', () => {
  it('stands a lantern on each tab folder, the active one marked, and signposts it', () => {
    const { machine, q } = laptop();
    machine.setLocation(1, API, 'absolute');
    machine.setLocation(machine.openSession().id, WEB, 'absolute');
    const spec = describeTerraces(q);
    expect(spec.lanterns).toEqual([
      { tab: 1, label: 'PS 1', folder: API, tile: API, active: false },
      { tab: 2, label: 'PS 2', folder: WEB, tile: WEB, active: true },
    ]);
    expect(spec.breadcrumb).toEqual(['C:\\', 'Users', 'kyle', 'quillwork', 'web']);
  });

  it('stands a lantern on the nearest folder left when another tab removed its own', () => {
    const { machine, q } = laptop();
    machine.setLocation(1, WEB, 'absolute');
    machine.openSession();
    machine.activate(1);
    // Remove-Item lets tab 2 delete the folder tab 1 stands in, as in real pwsh.
    machine.drive.removeDir(WEB, { recursive: true });
    const spec = describeTerraces(q);
    expect(spec.lanterns[0]).toMatchObject({ folder: WEB, tile: 'Users/kyle/quillwork' });
    // The prompt still shows the folder, so the signpost does too.
    expect(spec.breadcrumb.at(-1)).toBe('web');
  });

  it('stands a lantern on the deepest tile that fits when its route is longer than the cap', () => {
    const { machine, q } = laptop();
    const deep = `${HOME}/${Array.from({ length: 45 }, () => 'd').join('/')}`;
    machine.drive.makeDir(deep);
    machine.setLocation(1, deep, 'absolute');
    const spec = describeTerraces(q);
    expect(spec.lanterns[0]?.tile).toBe(spec.tiles.at(-1)?.path);
  });

  it('stands a tab at C:\\ on the pad, and signposts just C:\\', () => {
    const { machine, q } = laptop();
    machine.setLocation(1, '', 'absolute');
    const spec = describeTerraces(q);
    expect(spec.lanterns[0]?.tile).toBe('');
    expect(spec.breadcrumb).toEqual(['C:\\']);
  });

  it(`keeps the active tab's lantern when more than ${String(MAX_LANTERNS)} tabs are open`, () => {
    const { machine, q } = laptop();
    for (let opened = 1; opened < MAX_LANTERNS + 2; opened++) machine.openSession();
    machine.setLocation(8, WEB, 'absolute');
    machine.activate(7);
    const spec = describeTerraces(q);
    expect(spec.lanterns.map((lantern) => lantern.tab)).toEqual([1, 2, 3, 4, 5, 7]);
    expect(spec.moreTerminals).toBe(2);
    // Tab 8 has no lantern, so nothing draws its folder.
    expect(tilePaths(spec)).not.toContain(WEB);
  });

  it('has no lanterns and no signpost with no tab open', () => {
    const { machine, q } = laptop();
    machine.closeSession(1);
    const spec = describeTerraces(q);
    expect(spec.lanterns).toEqual([]);
    expect(spec.moreTerminals).toBe(0);
    expect(spec.breadcrumb).toEqual([]);
  });
});

describe('describeTerraces: recent changes', () => {
  it('draws recent paths wherever they are, marks them, and skips ones that are gone', () => {
    const { machine, q } = laptop();
    machine.drive.makeDir(`${WEB}/notes`);
    const gone = `${API}/src/routes/old.js`;
    const spec = describeTerraces(q, { recent: [`${WEB}/NOTES`, `${API}/server.js`, gone] });
    expect(spec.tiles.filter((tile) => tile.recent).map((tile) => tile.path)).toEqual([
      `${WEB}/notes`,
    ]);
    expect(spec.cards.filter((card) => card.recent).map((card) => card.path)).toEqual([
      `${API}/server.js`,
    ]);
    // A gone file still draws the folder it was in, where the world shows it leaving.
    expect(tilePaths(spec)).toContain(`${API}/src/routes`);
    expect(cardPaths(spec)).not.toContain(gone);
  });

  it('draws a recent change even in a crowd, because routes come before listings', () => {
    const { machine, q } = laptop();
    const crowded = `${HOME}/crowded`;
    for (let index = 0; index < 50; index++) {
      machine.drive.makeDir(`${crowded}/f${String(index)}`);
      machine.drive.writeFile(`${crowded}/n${String(index)}.txt`, '');
    }
    machine.setLocation(1, crowded, 'absolute');
    const spec = describeTerraces(q, { recent: [`${WEB}/index.html`] });
    expect(spec.tiles).toHaveLength(MAX_TILES);
    expect(tilePaths(spec)).toContain(WEB);
    expect(cardPaths(spec)).toContain(`${WEB}/index.html`);
    expect(spec.cards).toHaveLength(MAX_CARDS);
  });
});
