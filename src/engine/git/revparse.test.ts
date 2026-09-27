import { describe, expect, it } from 'vitest';
import { Repository } from './repository';
import { resolveRevision, RevisionError, type RevisionContext } from './revparse';
import { testDeps } from './testDeps';

function threeCommits() {
  const repo = new Repository(testDeps());
  const ids = ['one', 'two', 'three'].map((message) => {
    repo.stage('app.ts', message);
    return repo.commitIndex(message).id;
  });
  return { repo, ids: ids as [string, string, string] };
}

function errorKind(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    if (error instanceof RevisionError) return error.kind;
    throw error;
  }
  return undefined;
}

describe('resolveRevision', () => {
  it('resolves HEAD, @, and branch names', () => {
    const { repo, ids } = threeCommits();
    expect(repo.resolve('HEAD')).toBe(ids[2]);
    expect(repo.resolve('@')).toBe(ids[2]);
    expect(repo.resolve('main')).toBe(ids[2]);
  });

  it('walks back through parents with ~ and ^', () => {
    const { repo, ids } = threeCommits();
    expect(repo.resolve('HEAD~')).toBe(ids[1]);
    expect(repo.resolve('HEAD~2')).toBe(ids[0]);
    expect(repo.resolve('HEAD^')).toBe(ids[1]);
    expect(repo.resolve('HEAD^^')).toBe(ids[0]);
    expect(repo.resolve('main~1^')).toBe(ids[0]);
    expect(repo.resolve('HEAD^0')).toBe(ids[2]);
  });

  it('accepts full ids and unique short ids of 4+ characters', () => {
    const { repo, ids } = threeCommits();
    expect(repo.resolve(ids[0])).toBe(ids[0]);
    expect(repo.resolve(ids[1].slice(0, 7))).toBe(ids[1]);
    expect(repo.resolve(ids[1].slice(0, 7).toUpperCase())).toBe(ids[1]);
  });

  it('reads the reflog with HEAD@{n}', () => {
    const { repo, ids } = threeCommits();
    expect(repo.resolve('HEAD@{0}')).toBe(ids[2]);
    expect(repo.resolve('HEAD@{2}')).toBe(ids[0]);
    expect(repo.resolve('@@{1}~1')).toBe(ids[0]);
  });

  it('explains why a revision cannot be resolved', () => {
    const { repo, ids } = threeCommits();
    expect(errorKind(() => repo.resolve('nope'))).toBe('unknown');
    expect(errorKind(() => repo.resolve('abc'))).toBe('unknown');
    expect(errorKind(() => repo.resolve('HEAD~3'))).toBe('no-such-parent');
    expect(errorKind(() => repo.resolve('HEAD^2'))).toBe('no-such-parent');
    expect(errorKind(() => repo.resolve('HEAD@{9}'))).toBe('unknown');
    expect(errorKind(() => repo.resolve(ids[0].slice(0, 3)))).toBe('unknown');
  });

  it('reports an unborn branch for HEAD before the first commit', () => {
    const repo = new Repository(testDeps());
    expect(errorKind(() => repo.resolve('HEAD'))).toBe('unborn');
  });

  it('refuses a short id that matches more than one commit', () => {
    const context: RevisionContext = {
      headCommitId: () => null,
      branchTip: () => undefined,
      getCommit: () => undefined,
      allCommitIds: () => ['aaaa1111', 'aaaa2222'],
      reflog: () => [],
    };
    expect(errorKind(() => resolveRevision(context, 'aaaa'))).toBe('ambiguous');
    expect(resolveRevision(context, 'aaaa1')).toBe('aaaa1111');
  });
});
