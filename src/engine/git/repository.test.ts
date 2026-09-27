import { describe, expect, it } from 'vitest';
import { DEFAULT_BRANCH, Repository } from './repository';
import { testDeps } from './testDeps';

function repoWithCommits(...messages: string[]): Repository {
  const repo = new Repository(testDeps());
  messages.forEach((message, index) => {
    repo.stage('app.ts', `version ${String(index)}`);
    repo.commitIndex(message);
  });
  return repo;
}

describe('Repository before the first commit', () => {
  it('starts on an unborn main branch', () => {
    const repo = new Repository(testDeps());
    expect(repo.getHead()).toEqual({ kind: 'branch', name: DEFAULT_BRANCH });
    expect(repo.currentBranch()).toBe('main');
    expect(repo.headCommitId()).toBeNull();
    expect(repo.headCommit()).toBeNull();
    expect(repo.headFiles().size).toBe(0);
    expect(repo.branchNames()).toEqual([]);
    expect(repo.reflog()).toEqual([]);
  });
});

describe('Repository objects and index', () => {
  it('stores blobs under their content id', () => {
    const repo = new Repository(testDeps());
    const id = repo.writeBlob('hello\n');
    expect(id).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
    expect(repo.readBlob(id)).toBe('hello\n');
    expect(() => repo.readBlob('0'.repeat(40))).toThrow(/missing blob/);
  });

  it('stages content into the index and removes it again', () => {
    const repo = new Repository(testDeps());
    const id = repo.stage('app.ts', 'x');
    expect(repo.indexEntries().get('app.ts')).toBe(id);
    expect(repo.removeFromIndex('app.ts')).toBe(true);
    expect(repo.removeFromIndex('app.ts')).toBe(false);
  });

  it('replaces the whole index from a snapshot', () => {
    const repo = new Repository(testDeps());
    repo.stage('old.ts', 'x');
    repo.replaceIndex(new Map([['new.ts', repo.writeBlob('y')]]));
    expect([...repo.indexEntries().keys()]).toEqual(['new.ts']);
  });
});

describe('Repository commits', () => {
  it('commits the index and moves the branch forward', () => {
    const repo = new Repository(testDeps());
    repo.stage('README.md', '# App\n');
    const first = repo.commitIndex('docs: add readme');
    expect(first.parents).toEqual([]);
    expect(repo.branchTip('main')).toBe(first.id);
    expect(repo.headCommit()).toBe(first);
    expect([...first.files.keys()]).toEqual(['README.md']);

    repo.stage('app.ts', 'x');
    const second = repo.commitIndex('feat: add app');
    expect(second.parents).toEqual([first.id]);
    expect([...repo.headFiles().keys()]).toEqual(['README.md', 'app.ts']);
  });

  it('gives identical commits identical ids across runs', () => {
    const a = repoWithCommits('init', 'second');
    const b = repoWithCommits('init', 'second');
    expect(a.headCommitId()).toBe(b.headCommitId());
    expect(a.headCommitId()).toMatch(/^[0-9a-f]{40}$/);
  });

  it('gives different ids when only the message differs', () => {
    expect(repoWithCommits('init').headCommitId()).not.toBe(
      repoWithCommits('init!').headCommitId(),
    );
  });

  it('records every HEAD move in the reflog, newest first', () => {
    const repo = repoWithCommits('init', 'feat: second\n\nlonger body');
    const [latest, first] = repo.reflog();
    expect(latest?.message).toBe('commit: feat: second');
    expect(first?.message).toBe('commit (initial): init');
    expect(first?.from).toBeNull();
    expect(latest?.from).toBe(first?.to);
  });

  it('moves HEAD for resets and logs the reason', () => {
    const repo = repoWithCommits('one', 'two');
    const one = repo.resolve('HEAD~1');
    repo.moveHead(one, 'reset: moving to HEAD~1');
    expect(repo.headCommitId()).toBe(one);
    expect(repo.reflog()[0]?.message).toBe('reset: moving to HEAD~1');
  });

  it('detaches HEAD without moving any branch', () => {
    const repo = repoWithCommits('one', 'two');
    const one = repo.resolve('HEAD~1');
    const two = repo.resolve('HEAD');
    repo.detachHead(one, 'checkout: moving from main to HEAD~1');
    expect(repo.getHead()).toEqual({ kind: 'detached', commit: one });
    expect(repo.currentBranch()).toBeNull();
    expect(repo.headCommitId()).toBe(one);
    expect(repo.branchTip('main')).toBe(two);
    expect(repo.reflog()[0]).toMatchObject({ from: two, to: one });
  });

  it('commits on a detached HEAD without touching the branch', () => {
    const repo = repoWithCommits('one', 'two');
    const two = repo.resolve('HEAD');
    repo.detachHead(repo.resolve('HEAD~1'), 'checkout: moving from main to HEAD~1');
    repo.stage('lost.ts', 'x');
    const floating = repo.commitIndex('experiment');
    expect(repo.getHead()).toEqual({ kind: 'detached', commit: floating.id });
    expect(repo.branchTip('main')).toBe(two);
  });

  it('lists branches and every stored commit', () => {
    const repo = repoWithCommits('one', 'two');
    expect(repo.branchNames()).toEqual(['main']);
    expect([...repo.allCommitIds()]).toHaveLength(2);
  });
});
