import { describe, expect, it } from 'vitest';
import { git } from '../../engine/git/cli/testRun';
import { repo } from '../../engine/git/fixtures';
import { testDeps } from '../../engine/git/testDeps';
import { describeHistory } from './historyLayout';

const threeCommits = () =>
  repo()
    .commit('feat: one', { 'a.ts': '1' })
    .commit('feat: two', { 'a.ts': '2' })
    .commit('feat: three and a very long subject line', { 'a.ts': '3' })
    .build(testDeps());

describe('describeHistory', () => {
  it('is empty before the first commit', () => {
    const history = describeHistory(repo().build(testDeps()).requireRepo());
    expect(history).toEqual({
      platforms: [],
      banners: [],
      head: { commit: null, detached: false },
      footprints: [],
    });
  });

  it('lays commits along one road with the branch banner and HEAD on the tip', () => {
    const ws = threeCommits();
    const repository = ws.requireRepo();
    const history = describeHistory(repository);
    expect(history.platforms.map((platform) => [platform.depth, platform.lane])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    expect(history.platforms[0]?.parent).toBeNull();
    expect(history.platforms[1]?.parent).toBe(history.platforms[0]?.id);
    expect(history.platforms[2]?.label).toMatch(/^[0-9a-f]{7} feat: three and a very lo…$/);
    expect(history.banners).toEqual([{ branch: 'main', commit: repository.headCommitId() }]);
    expect(history.head).toEqual({ commit: repository.headCommitId(), detached: false });
    expect(history.footprints).toHaveLength(3);
  });

  it('moves commits lost by reset --hard to the side lane, still footprinted', () => {
    const ws = threeCommits();
    const repository = ws.requireRepo();
    const lost = repository.headCommitId();
    git(ws, ['reset', '--hard', 'HEAD~2']);
    const history = describeHistory(repository);
    expect(history.platforms.map((platform) => platform.lane)).toEqual([0, 1, 1]);
    expect(history.footprints[0]).toBe(repository.headCommitId());
    expect(history.footprints).toContain(lost);
  });

  it('reports a detached HEAD', () => {
    const ws = threeCommits();
    const repository = ws.requireRepo();
    repository.detachHead(repository.resolve('HEAD~1'), 'checkout: moving from main to HEAD~1');
    expect(describeHistory(repository).head.detached).toBe(true);
  });
});
