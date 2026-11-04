import { describe, expect, it } from 'vitest';
import { folder, repo } from '../../engine/git/fixtures';
import { testDeps } from '../../engine/git/testDeps';
import {
  CRATE_FLOORS,
  describeCrates,
  gridCell,
  LABEL_GAP,
  launchKey,
  placeCrates,
} from './crateLayout';

const summary = (specs: ReturnType<typeof describeCrates>) =>
  specs.map((spec) => `${spec.area}:${spec.path}:${spec.look}:${String(spec.slot)}`);

describe('describeCrates', () => {
  it('shows every file as an unlabeled bench crate before git init', () => {
    const ws = folder().write('b.ts', 'b').write('a.ts', 'a').build(testDeps());
    expect(summary(describeCrates(ws))).toEqual([
      'bench:a.ts:untracked:0',
      'bench:b.ts:untracked:1',
    ]);
  });

  it('marks clean, modified, untracked, deleted, and ignored files', () => {
    const ws = repo()
      .commit('init', { 'app.ts': 'a', 'clean.ts': 'c', 'gone.ts': 'g', '.gitignore': 'dist/\n' })
      .modify('app.ts', 'A')
      .delete('gone.ts')
      .untracked('new.ts', 'n')
      .untracked('dist/main.js', 'x')
      .build(testDeps());
    expect(summary(describeCrates(ws))).toEqual([
      'bench:.gitignore:clean:0',
      'bench:app.ts:modified:1',
      'bench:clean.ts:clean:2',
      'bench:gone.ts:deleted:3',
      'bench:new.ts:untracked:4',
      'blocklist:dist/main.js:ignored:0',
    ]);
  });

  it('puts staged changes on the dock, next to any newer edit left on the bench', () => {
    const ws = repo()
      .commit('init', { 'app.ts': 'a', 'old.ts': 'o' })
      .modify('app.ts', 'A')
      .stage('app.ts')
      .modify('app.ts', 'AA')
      .untracked('new.ts', 'n')
      .stage('new.ts')
      .delete('old.ts')
      .stage('old.ts')
      .build(testDeps());
    expect(summary(describeCrates(ws))).toEqual([
      'bench:app.ts:modified:0',
      'bench:new.ts:clean:1',
      'dock:app.ts:staged-change:0',
      'dock:new.ts:staged-new:1',
      'dock:old.ts:staged-delete:2',
    ]);
  });

  it('gives each crate a key that survives unrelated changes', () => {
    const ws = repo().commit('init', { 'a.ts': 'a' }).build(testDeps());
    const before = describeCrates(ws)[0]?.key;
    ws.writeFile('z.ts', 'z');
    expect(describeCrates(ws)[0]?.key).toBe(before);
  });
});

describe('launchKey', () => {
  const ws = repo()
    .commit('init', { 'app.ts': 'a', '.gitignore': '*.log\n' })
    .modify('app.ts', 'A')
    .stage('app.ts')
    .untracked('debug.log', 'x')
    .build(testDeps());
  const crate = (key: string) => describeCrates(ws).find((spec) => spec.key === key);

  it('flies a staged or ignored crate out of its Workbench crate', () => {
    const staged = crate('dock:app.ts');
    const ignored = crate('blocklist:debug.log');
    expect(staged && launchKey(staged)).toBe('bench:app.ts');
    expect(ignored && launchKey(ignored)).toBe('bench:debug.log');
  });

  it('never flies a new Workbench crate out of itself', () => {
    const bench = crate('bench:app.ts');
    expect(bench).toBeDefined();
    expect(bench && launchKey(bench)).toBeNull();
  });
});

describe('gridCell', () => {
  it('fills columns, then rows, then stacks layers', () => {
    expect(gridCell(0, 4, 2)).toEqual({ column: 0, row: 0, layer: 0 });
    expect(gridCell(5, 4, 2)).toEqual({ column: 1, row: 1, layer: 0 });
    expect(gridCell(9, 4, 2)).toEqual({ column: 1, row: 0, layer: 1 });
  });
});

/**
 * A label's width in world units, a little wider than labels.ts draws it: 0.32 tall, a
 * generous 26px a character at its 44px font, and 24px of padding each side, on a 72px
 * tall canvas. Generous, so a layout that passes here passes with the real font.
 */
const labelWidth = (name: string) => (0.32 * (name.length * 26 + 48)) / 72;

/** Each placed crate's label as a span across its floor, with its row and layer. */
function labelSpans(names: readonly string[], floor = CRATE_FLOORS.bench) {
  return placeCrates(names, labelWidth, floor).map(({ crate, place }) => ({
    name: crate,
    ...place,
    from: place.x - labelWidth(crate) / 2,
    to: place.x + labelWidth(crate) / 2,
  }));
}

/** Every pair of labels sharing a row and a layer whose spans overlap or touch. */
function collisions(spans: ReturnType<typeof labelSpans>): string[] {
  return spans.flatMap((a, i) =>
    spans
      .slice(i + 1)
      .filter((b) => a.row === b.row && a.layer === b.layer)
      .filter((b) => a.from < b.to + LABEL_GAP / 2 && b.from < a.to + LABEL_GAP / 2)
      .map((b) => `${a.name} / ${b.name}`),
  );
}

/** Mission 2.4 after Otto commits everything: the audit saw these names run together. */
const IGNORE_LIST_BENCH = [
  '.env',
  'README.md',
  'debug.log',
  'app.js',
  'index.html',
  'package.json',
  'error.log',
  'app.ts',
];

describe('placeCrates', () => {
  it('keeps the Workbench labels of Mission 2.4 apart', () => {
    const spans = labelSpans(IGNORE_LIST_BENCH);
    expect(collisions(spans)).toEqual([]);
    // ...without spilling off either end of the Workbench.
    const { left, width } = CRATE_FLOORS.bench;
    for (const span of spans) {
      expect(span.from).toBeGreaterThanOrEqual(left);
      expect(span.to).toBeLessThanOrEqual(left + width);
    }
  });

  it('keeps long names apart on every floor, wrapping them onto more rows', () => {
    const longNames = [
      '.env.example',
      'package-lock.json',
      'CONTRIBUTING.md',
      'tsconfig.json',
      'docker-compose.yml',
      'checkout.test.ts',
      'vite.config.ts',
      '.gitignore',
      'a.ts',
    ];
    for (const floor of Object.values(CRATE_FLOORS)) {
      const spans = labelSpans(longNames, floor);
      expect(collisions(spans)).toEqual([]);
      expect(new Set(spans.map((span) => span.row)).size).toBeGreaterThan(1);
    }
  });

  it('puts short names a crate apart, as many to a row as the floor holds', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const places = placeCrates(names, labelWidth, CRATE_FLOORS.bench).map(({ place }) => place);
    expect(places.slice(0, 8).map((place) => place.row)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    // The same 0.88 grid the Workbench always had, from the first crate at -3.08.
    expect(places[0]?.x).toBeCloseTo(-3.08);
    expect(places[1]?.x).toBeCloseTo(-3.08 + 0.88);
    expect(places[8]).toMatchObject({ column: 0, row: 1 });
    expect(places[8]?.x).toBeCloseTo(-3.08);
  });

  it('gives each column the width of the longest label in it', () => {
    const floor = { ...CRATE_FLOORS.dock, width: 3 };
    const places = placeCrates(['a', 'package.json', 'b', 'c'], labelWidth, floor).map(
      ({ place }) => place,
    );
    // Two columns fit: the second as wide as package.json's label, which shares it with c.
    expect(places.map((place) => [place.column, place.row])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
    const secondColumn = labelWidth('package.json') + LABEL_GAP;
    expect(places[3]?.x).toBeCloseTo(floor.left + floor.minColumn + secondColumn / 2);
  });

  it('keeps a single row at the back, and spreads more rows to the front', () => {
    const rowsAt = (count: number) => [
      ...new Set(
        placeCrates(Array<string>(count).fill('a'), labelWidth, CRATE_FLOORS.dock).map(
          ({ place }) => place.z,
        ),
      ),
    ];
    const { back, front } = CRATE_FLOORS.dock;
    expect(rowsAt(4)).toEqual([back]);
    // Two rows use the whole depth, so one row's names stay clear of the next row's.
    expect(rowsAt(5)).toEqual([back, front]);
    expect(rowsAt(9)).toEqual([back, (back + front) / 2, front]);
  });

  it('stacks crates on the same columns once every row is full', () => {
    const names = Array.from({ length: 30 }, (_, index) => `file-${String(index)}.ts`);
    const places = placeCrates(names, labelWidth, CRATE_FLOORS.bench).map(({ place }) => place);
    const stacked = places.filter((place) => place.layer > 0);
    expect(stacked.length).toBeGreaterThan(0);
    for (const upper of stacked) {
      const below = places.find(
        (place) => place.layer === 0 && place.row === upper.row && place.column === upper.column,
      );
      expect(below?.x).toBe(upper.x);
    }
  });

  it('gives a name wider than the whole floor a row of its own', () => {
    const huge = 'x'.repeat(80);
    const places = placeCrates(['a', huge, 'b'], labelWidth, CRATE_FLOORS.blocklist);
    expect(places.map(({ place }) => place.row)).toEqual([0, 1, 2]);
  });

  it('places nothing on an empty floor', () => {
    expect(placeCrates([], labelWidth, CRATE_FLOORS.dock)).toEqual([]);
  });
});
