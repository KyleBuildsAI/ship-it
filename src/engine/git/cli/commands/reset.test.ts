import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '../../../workspace';
import { repo } from '../../fixtures';
import { gitQueries } from '../../queries';
import { testDeps } from '../../testDeps';
import { git, gitText } from '../testRun';

/** Three commits, then an unstaged edit and an untracked file on top. */
const history = () =>
  repo()
    .commit('one', { 'app.ts': '1\n' })
    .commit('two', { 'app.ts': '2\n', 'b.ts': 'b\n' })
    .commit('three', { 'app.ts': '3\n' })
    .modify('app.ts', 'wip\n')
    .untracked('notes.md', 'n')
    .build(testDeps());

describe('git reset <commit>', () => {
  it('--soft moves the branch and keeps the undone changes staged', () => {
    const ws = history();
    expect(gitText(ws, ['reset', '--soft', 'HEAD~1'])).toBe('');
    const q = gitQueries(ws);
    expect(q.headCommit()?.message).toBe('two');
    expect(q.stagedPaths()).toEqual(['app.ts']);
    expect(q.workingFile('app.ts')).toBe('wip\n');
  });

  it('--mixed (the default) unstages everything and lists what is left', () => {
    const ws = history();
    expect(gitText(ws, ['reset', 'HEAD~2'])).toBe('Unstaged changes after reset:\nM\tapp.ts');
    const q = gitQueries(ws);
    expect(q.headCommit()?.message).toBe('one');
    expect(q.stagedPaths()).toEqual([]);
    expect(q.workingFile('b.ts')).toBe('b\n');
    expect(q.untrackedPaths()).toEqual(['b.ts', 'notes.md']);
  });

  it('--hard resets every area but leaves untracked files alone', () => {
    const ws = history();
    const id = gitQueries(ws).log()[1]?.id.slice(0, 7) ?? '';
    expect(gitText(ws, ['reset', '--hard', 'HEAD~1'])).toBe(`HEAD is now at ${id} two`);
    const q = gitQueries(ws);
    expect(q.workingFile('app.ts')).toBe('2\n');
    expect(q.untrackedPaths()).toEqual(['notes.md']);
    expect(q.isClean()).toBe(false);
  });

  it('--hard HEAD throws away uncommitted edits and staged new files', () => {
    const ws = history();
    ws.writeFile('staged-new.ts', 'x');
    git(ws, ['add', 'staged-new.ts']);
    git(ws, ['reset', '--hard']);
    const q = gitQueries(ws);
    expect(q.workingFile('app.ts')).toBe('3\n');
    expect(q.workingFile('staged-new.ts')).toBeNull();
  });

  it('recovers a lost commit through the reflog', () => {
    const ws = history();
    git(ws, ['reset', '--hard', 'HEAD~2']);
    expect(gitQueries(ws).log()).toHaveLength(1);
    git(ws, ['reset', '--hard', 'HEAD@{1}']);
    expect(gitQueries(ws).headCommit()?.message).toBe('three');
  });

  it('announces the branch and HEAD moves', () => {
    const ws = history();
    const events: EngineEvent[] = [];
    ws.events.on((event) => events.push(event));
    git(ws, ['reset', '--soft', 'HEAD~1']);
    expect(events.map((event) => event.type)).toEqual(['branchMoved', 'headMoved']);
    expect(events[1]).toMatchObject({ reason: 'reset --soft' });
  });

  it('is quiet with -q', () => {
    expect(gitText(history(), ['reset', '-q', '--hard', 'HEAD~1'])).toBe('');
    expect(gitText(history(), ['reset', '-q', 'HEAD~1'])).toBe('');
  });
});

describe('git reset <paths>', () => {
  it('unstages files, like restore --staged', () => {
    const ws = history();
    git(ws, ['add', 'app.ts']);
    expect(gitText(ws, ['reset', 'app.ts'])).toBe('Unstaged changes after reset:\nM\tapp.ts');
    expect(gitQueries(ws).stagedPaths()).toEqual([]);
    git(ws, ['add', 'app.ts']);
    git(ws, ['reset', 'HEAD', '--', 'app.ts']);
    expect(gitQueries(ws).stagedPaths()).toEqual([]);
  });

  it('unstages everything before the first commit', () => {
    const ws = repo().untracked('a.ts').untracked('b.ts').stage('a.ts', 'b.ts').build(testDeps());
    git(ws, ['reset']);
    expect(gitQueries(ws).untrackedPaths()).toEqual(['a.ts', 'b.ts']);
    git(ws, ['add', 'a.ts']);
    git(ws, ['reset', 'a.ts']);
    expect(gitQueries(ws).stagedPaths()).toEqual([]);
  });

  it('refuses soft or hard resets of paths, and mixed modes', () => {
    const ws = history();
    expect(gitText(ws, ['reset', '--hard', 'app.ts'])).toBe(
      'fatal: Cannot do hard reset with paths.',
    );
    expect(gitText(ws, ['reset', '--soft', '--', 'app.ts'])).toBe(
      'fatal: Cannot do soft reset with paths.',
    );
    expect(git(ws, ['reset', '--soft', '--hard']).exitCode).toBe(128);
  });

  it('explains unknown words, bad options, and resets before any commit', () => {
    const ws = history();
    expect(gitText(ws, ['reset', 'nothing'])).toContain("ambiguous argument 'nothing'");
    expect(git(ws, ['reset', '../x']).exitCode).toBe(128);
    expect(git(ws, ['reset', '--frob']).exitCode).toBe(128);
    expect(git(ws, ['reset', 'HEAD~9', '--', 'app.ts']).exitCode).toBe(128);
    expect(git(repo().build(testDeps()), ['reset', '--hard']).exitCode).toBe(128);
  });
});
