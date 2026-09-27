import { describe, expect, it } from 'vitest';
import { repo } from '../fixtures';
import { testDeps } from '../testDeps';
import { toText, type CommandResult } from './output';
import { resolveOrExplain, snapshotSides, workingSides } from './revisions';

const explain = (result: string | CommandResult) =>
  typeof result === 'string' ? result : toText(result);

describe('resolveOrExplain', () => {
  it('returns the commit id for a good revision', () => {
    const repository = repo().commit('one', { 'a.ts': '1' }).build(testDeps()).requireRepo();
    expect(resolveOrExplain(repository, 'HEAD')).toBe(repository.headCommitId());
  });

  it("explains an unborn branch in git's words", () => {
    const repository = repo().build(testDeps()).requireRepo();
    expect(explain(resolveOrExplain(repository, 'HEAD'))).toBe(
      "fatal: your current branch 'main' does not have any commits yet",
    );
  });

  it('explains an unknown revision with the -- hint', () => {
    const repository = repo().commit('one', { 'a.ts': '1' }).build(testDeps()).requireRepo();
    expect(explain(resolveOrExplain(repository, 'HEAD~4'))).toBe(
      [
        "fatal: ambiguous argument 'HEAD~4': unknown revision or path not in the working tree.",
        "Use '--' to separate paths from revisions, like this:",
        "'git <command> [<revision>...] -- [<file>...]'",
      ].join('\n'),
    );
  });

  it('says when a short id matches several commits', () => {
    const repository = repo().commit('one', { 'a.ts': '1' }).build(testDeps()).requireRepo();
    // Swap in two ids that share a prefix, since real SHA-1 ids rarely collide in tests.
    Object.defineProperty(repository, 'allCommitIds', { value: () => ['beef1111', 'beef2222'] });
    expect(explain(resolveOrExplain(repository, 'beef'))).toContain(
      'error: short object ID beef is ambiguous',
    );
  });
});

describe('sides', () => {
  it('reads snapshot contents and skips missing working files', () => {
    const ws = repo().commit('one', { 'a.ts': '1', 'b.ts': '2' }).delete('b.ts').build(testDeps());
    const repository = ws.requireRepo();
    expect(
      [...snapshotSides(repository, repository.headFiles()).values()].map((side) => side.content),
    ).toEqual(['1', '2']);
    expect([...workingSides(ws, ['a.ts', 'b.ts']).keys()]).toEqual(['a.ts']);
  });
});
