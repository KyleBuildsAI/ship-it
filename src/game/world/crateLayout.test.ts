import { describe, expect, it } from 'vitest';
import { folder, repo } from '../../engine/git/fixtures';
import { testDeps } from '../../engine/git/testDeps';
import { describeCrates, gridCell } from './crateLayout';

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

describe('gridCell', () => {
  it('fills columns, then rows, then stacks layers', () => {
    expect(gridCell(0, 4, 2)).toEqual({ column: 0, row: 0, layer: 0 });
    expect(gridCell(5, 4, 2)).toEqual({ column: 1, row: 1, layer: 0 });
    expect(gridCell(9, 4, 2)).toEqual({ column: 1, row: 0, layer: 1 });
  });
});
