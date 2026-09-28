import { describe, expect, it } from 'vitest';
import { windows } from '../../engine/fixtures';
import { git } from '../../engine/git/cli/testRun';
import { folder, repo } from '../../engine/git/fixtures';
import { gitQueries } from '../../engine/git/queries';
import { testDeps } from '../../engine/git/testDeps';
import { machineQueries } from '../../engine/machine/queries';
import type { Workspace } from '../../engine/workspace';
import { PredicateContextError } from './machinePredicates';
import {
  changedPaths,
  describe as describePredicate,
  evaluate,
  explain,
  type Predicate,
  type SandboxQueries,
} from './predicates';

/** Evaluates a predicate against a sandbox, the way the runner does after each command. */
const holds = (ws: Workspace, predicate: Predicate) => evaluate(predicate, gitQueries(ws));

/** Two commits and a working tree with one edit, one untracked file, and one ignored file. */
const project = () =>
  repo()
    .commit('chore: init', { 'app.ts': 'v1\n', '.gitignore': '*.log\n' })
    .commit('feat: add readme', { 'README.md': '# App\n' })
    .modify('app.ts', 'v2\n')
    .untracked('.env', 'TOKEN=dev-only\n')
    .untracked('debug.log', 'noise\n')
    .build(testDeps());

describe('isRepo and clean', () => {
  it('sees git init happen', () => {
    const ws = folder().write('a.ts', 'a').build(testDeps());
    expect(holds(ws, { kind: 'isRepo' })).toBe(false);
    git(ws, ['init']);
    expect(holds(ws, { kind: 'isRepo' })).toBe(true);
  });

  it('never calls a folder without a repository clean', () => {
    const ws = folder().build(testDeps());
    expect(gitQueries(ws).isClean()).toBe(true);
    expect(holds(ws, { kind: 'clean' })).toBe(false);
  });

  it('is clean when only ignored files are left over', () => {
    const ws = project();
    expect(holds(ws, { kind: 'clean' })).toBe(false);
    git(ws, ['add', 'app.ts']);
    git(ws, ['commit', '-m', 'fix: v2']);
    ws.deleteFile('.env');
    expect(holds(ws, { kind: 'clean' })).toBe(true);
  });
});

describe('staging', () => {
  it('checks every listed path is staged', () => {
    const ws = project();
    git(ws, ['add', 'app.ts']);
    expect(holds(ws, { kind: 'staged', paths: ['app.ts'] })).toBe(true);
    expect(holds(ws, { kind: 'staged', paths: ['app.ts', '.env'] })).toBe(false);
  });

  it('with exact, rejects anything extra on the Loading Dock', () => {
    const ws = project();
    git(ws, ['add', 'app.ts', '.env']);
    expect(holds(ws, { kind: 'staged', paths: ['app.ts'], exact: true })).toBe(false);
    expect(holds(ws, { kind: 'staged', paths: ['.env', 'app.ts'], exact: true })).toBe(true);
    git(ws, ['restore', '--staged', '.env']);
    expect(holds(ws, { kind: 'staged', paths: ['app.ts'], exact: true })).toBe(true);
  });

  it('counts both names of a staged rename', () => {
    const ws = repo().commit('init', { 'b.ts': 'b\n' }).build(testDeps());
    git(ws, ['mv', 'b.ts', 'c.ts']);
    // git status shows one line, "renamed: b.ts -> c.ts", but b.ts's removal is staged too.
    expect(holds(ws, { kind: 'staged', paths: ['b.ts', 'c.ts'], exact: true })).toBe(true);
    expect(holds(ws, { kind: 'staged', paths: ['c.ts'], exact: true })).toBe(false);
    expect(holds(ws, { kind: 'notStaged', paths: ['b.ts'] })).toBe(false);
  });

  it('notStaged fails if any listed path is staged', () => {
    const ws = project();
    expect(holds(ws, { kind: 'notStaged', paths: ['.env', 'app.ts'] })).toBe(true);
    git(ws, ['add', '.env']);
    expect(holds(ws, { kind: 'notStaged', paths: ['.env', 'app.ts'] })).toBe(false);
  });

  it('knows untracked files and unstaged edits', () => {
    const ws = project();
    expect(holds(ws, { kind: 'untracked', paths: ['.env'] })).toBe(true);
    expect(holds(ws, { kind: 'untracked', paths: ['.env', 'app.ts'] })).toBe(false);
    expect(holds(ws, { kind: 'modified', paths: ['app.ts'] })).toBe(true);
    git(ws, ['add', '.']);
    expect(holds(ws, { kind: 'untracked', paths: ['.env'] })).toBe(false);
    expect(holds(ws, { kind: 'modified', paths: ['app.ts'] })).toBe(false);
  });

  it('counts only files a .gitignore rule hides as ignored', () => {
    const ws = project();
    expect(holds(ws, { kind: 'ignored', paths: ['debug.log'] })).toBe(true);
    expect(holds(ws, { kind: 'ignored', paths: ['.env'] })).toBe(false);
    ws.writeFile('.gitignore', '*.log\n.env\n');
    expect(holds(ws, { kind: 'ignored', paths: ['debug.log', '.env'] })).toBe(true);
  });
});

describe('tracked means "in the HEAD commit"', () => {
  it('is false for a file that is only staged', () => {
    const ws = project();
    git(ws, ['add', '.env']);
    expect(holds(ws, { kind: 'tracked', paths: ['.env'] })).toBe(false);
    expect(holds(ws, { kind: 'notTracked', paths: ['.env'] })).toBe(true);
    git(ws, ['commit', '-m', 'oops']);
    expect(holds(ws, { kind: 'tracked', paths: ['.env', 'app.ts'] })).toBe(true);
    expect(holds(ws, { kind: 'notTracked', paths: ['.env'] })).toBe(false);
  });

  it('becomes false again after git rm --cached and a commit', () => {
    const ws = repo().commit('oops', { '.env': 'TOKEN=1\n', 'app.ts': 'a\n' }).build(testDeps());
    git(ws, ['rm', '--cached', '-q', '.env']);
    git(ws, ['commit', '-m', 'fix: stop tracking .env']);
    expect(holds(ws, { kind: 'notTracked', paths: ['.env'] })).toBe(true);
    expect(holds(ws, { kind: 'workingFile', path: '.env' })).toBe(true);
  });
});

describe('history', () => {
  it('counts commits against min, max, and equals', () => {
    const ws = project();
    expect(holds(ws, { kind: 'commitCount', equals: 2 })).toBe(true);
    expect(holds(ws, { kind: 'commitCount', equals: 3 })).toBe(false);
    expect(holds(ws, { kind: 'commitCount', min: 2, max: 2 })).toBe(true);
    expect(holds(ws, { kind: 'commitCount', min: 3 })).toBe(false);
    expect(holds(ws, { kind: 'commitCount', max: 1 })).toBe(false);
    expect(holds(folder().build(testDeps()), { kind: 'commitCount', max: 0 })).toBe(true);
  });

  it('matches the latest message against a pattern', () => {
    const ws = project();
    expect(holds(ws, { kind: 'headMessage', pattern: '^feat: ' })).toBe(true);
    expect(holds(ws, { kind: 'headMessage', pattern: '^FEAT' })).toBe(false);
    expect(holds(ws, { kind: 'headMessage', pattern: '^FEAT', flags: 'i' })).toBe(true);
    expect(holds(repo().build(testDeps()), { kind: 'headMessage', pattern: '.*' })).toBe(false);
  });

  it('checks every message, or only the newest few', () => {
    const conventional = '^(feat|fix|chore): ';
    const ws = repo()
      .commit('initial stuff', { 'a.ts': 'a' })
      .commit('feat: b', { 'b.ts': 'b' })
      .commit('fix: c', { 'c.ts': 'c' })
      .build(testDeps());
    expect(holds(ws, { kind: 'allMessagesMatch', pattern: conventional })).toBe(false);
    expect(holds(ws, { kind: 'allMessagesMatch', pattern: conventional, last: 2 })).toBe(true);
    expect(holds(ws, { kind: 'allMessagesMatch', pattern: conventional, last: 3 })).toBe(false);
    // Asking about the last 4 commits of a 3-commit history can't be true.
    expect(holds(ws, { kind: 'allMessagesMatch', pattern: '.*', last: 4 })).toBe(false);
    expect(holds(repo().build(testDeps()), { kind: 'allMessagesMatch', pattern: '.*' })).toBe(
      false,
    );
  });

  it('finds moves of HEAD in the reflog, including a reset', () => {
    const ws = project();
    expect(holds(ws, { kind: 'reflogContains', pattern: 'commit \\(initial\\)' })).toBe(true);
    expect(holds(ws, { kind: 'reflogContains', pattern: '^reset: ' })).toBe(false);
    expect(holds(ws, { kind: 'reflogContains', pattern: 'ADD README', flags: 'i' })).toBe(true);
    git(ws, ['reset', '--hard', 'HEAD~1']);
    expect(holds(ws, { kind: 'reflogContains', pattern: '^reset: ' })).toBe(true);
  });

  it('follows HEAD through a reset and a reflog recovery', () => {
    const ws = project();
    git(ws, ['reset', '--hard', 'HEAD~1']);
    expect(holds(ws, { kind: 'headMessageIs', message: 'chore: init' })).toBe(true);
    // HEAD@{1} is where HEAD was one move ago: the commit the reset walked away from.
    git(ws, ['reset', '--hard', 'HEAD@{1}']);
    expect(holds(ws, { kind: 'headMessageIs', message: 'feat: add readme' })).toBe(true);
  });

  it('knows which commit HEAD is on by its message', () => {
    const ws = project();
    expect(holds(ws, { kind: 'headMessageIs', message: 'feat: add readme' })).toBe(true);
    expect(holds(ws, { kind: 'headMessageIs', message: 'feat: add readme\n' })).toBe(true);
    expect(holds(ws, { kind: 'headMessageIs', message: 'chore: init' })).toBe(false);
    expect(holds(repo().build(testDeps()), { kind: 'headMessageIs', message: 'x' })).toBe(false);
  });
});

describe('file contents', () => {
  it('reads files as committed in HEAD', () => {
    const ws = project();
    expect(holds(ws, { kind: 'fileAtHead', path: 'app.ts' })).toBe(true);
    expect(holds(ws, { kind: 'fileAtHead', path: 'app.ts', equals: 'v1\n' })).toBe(true);
    // The working copy says v2, but that edit was never committed.
    expect(holds(ws, { kind: 'fileAtHead', path: 'app.ts', equals: 'v2\n' })).toBe(false);
    expect(holds(ws, { kind: 'fileAtHead', path: 'README.md', contains: '# App' })).toBe(true);
    expect(holds(ws, { kind: 'fileAtHead', path: 'README.md', contains: 'Nope' })).toBe(false);
    expect(holds(ws, { kind: 'fileAtHead', path: '.env' })).toBe(false);
  });

  it('reads files on disk, including checking one is gone', () => {
    const ws = project();
    expect(holds(ws, { kind: 'workingFile', path: 'app.ts' })).toBe(true);
    expect(holds(ws, { kind: 'workingFile', path: 'app.ts', equals: 'v2\n' })).toBe(true);
    expect(holds(ws, { kind: 'workingFile', path: '.env', contains: 'TOKEN' })).toBe(true);
    expect(holds(ws, { kind: 'workingFile', path: 'app.ts', exists: false })).toBe(false);
    git(ws, ['rm', '-f', '-q', 'app.ts']);
    expect(holds(ws, { kind: 'workingFile', path: 'app.ts', exists: false })).toBe(true);
    expect(holds(ws, { kind: 'workingFile', path: 'app.ts' })).toBe(false);
  });
});

describe('commitChanged', () => {
  it('compares a commit with its first parent', () => {
    const ws = project();
    git(ws, ['add', 'app.ts', '.env']);
    git(ws, ['commit', '-m', 'feat: v2']);
    expect(holds(ws, { kind: 'commitChanged', paths: ['app.ts'] })).toBe(true);
    expect(holds(ws, { kind: 'commitChanged', paths: ['app.ts'], only: true })).toBe(false);
    expect(holds(ws, { kind: 'commitChanged', paths: ['.env', 'app.ts'], only: true })).toBe(true);
    expect(holds(ws, { kind: 'commitChanged', paths: ['README.md'] })).toBe(false);
    expect(holds(ws, { kind: 'commitChanged', ref: 'HEAD~1', paths: ['README.md'] })).toBe(true);
  });

  it('treats every file in the first commit as changed', () => {
    const ws = project();
    const firstCommit: Predicate = {
      kind: 'commitChanged',
      ref: 'main~1',
      paths: ['.gitignore', 'app.ts'],
      only: true,
    };
    expect(holds(ws, firstCommit)).toBe(true);
  });

  it('counts deletions and renames, and is false for a ref that does not exist', () => {
    const ws = repo().commit('init', { 'a.ts': 'a', 'b.ts': 'b' }).build(testDeps());
    git(ws, ['rm', '-q', 'a.ts']);
    git(ws, ['mv', 'b.ts', 'c.ts']);
    git(ws, ['commit', '-m', 'refactor: shuffle']);
    expect(holds(ws, { kind: 'commitChanged', paths: ['a.ts', 'b.ts', 'c.ts'], only: true })).toBe(
      true,
    );
    expect(holds(ws, { kind: 'commitChanged', ref: 'HEAD~5', paths: ['a.ts'] })).toBe(false);
    expect(holds(folder().build(testDeps()), { kind: 'commitChanged', paths: ['a.ts'] })).toBe(
      false,
    );
  });

  it('exposes the changed-path comparison on its own', () => {
    const history = gitQueries(project()).log();
    const changes = history.map((commit, index) => changedPaths(commit, history[index + 1]));
    expect(changes).toEqual([['README.md'], ['.gitignore', 'app.ts']]);
  });
});

describe('combinators', () => {
  const yes: Predicate = { kind: 'isRepo' };
  const no: Predicate = { kind: 'tracked', paths: ['nope.ts'] };

  it('combines checks with all, any, and not', () => {
    const ws = project();
    expect(holds(ws, { kind: 'all', of: [yes, yes] })).toBe(true);
    expect(holds(ws, { kind: 'all', of: [yes, no] })).toBe(false);
    expect(holds(ws, { kind: 'any', of: [no, yes] })).toBe(true);
    expect(holds(ws, { kind: 'any', of: [no, no] })).toBe(false);
    expect(holds(ws, { kind: 'not', predicate: no })).toBe(true);
    expect(holds(ws, { kind: 'not', predicate: { kind: 'not', predicate: no } })).toBe(false);
  });
});

describe('laptop checks', () => {
  /** A laptop whose mounted project (C:\Users\kyle\quillwork\app) has one commit. */
  function laptop(): SandboxQueries {
    const ws = windows().init().write('Users/kyle/quillwork/app/app.ts', 'v1\n').build(testDeps());
    git(ws, ['add', 'app.ts']);
    git(ws, ['commit', '-m', 'chore: init']);
    if (ws.machine === null) throw new Error('windows() should build a laptop.');
    return { ...gitQueries(ws), machine: machineQueries(ws.machine) };
  }
  const notes: Predicate = { kind: 'driveFolder', path: 'Users/kyle/notes' };
  const home: Predicate = { kind: 'currentDirectory', path: 'Users/kyle' };

  it('grades the laptop and git together, in one tree of checks', () => {
    const q = laptop();
    expect(evaluate({ kind: 'all', of: [home, { kind: 'clean' }] }, q)).toBe(true);
    expect(evaluate({ kind: 'any', of: [notes, { kind: 'tracked', paths: ['app.ts'] }] }, q)).toBe(
      true,
    );
    expect(evaluate({ kind: 'not', predicate: notes }, q)).toBe(true);
  });

  it('stops with a content error when an Act 2 sandbox is asked about a laptop', () => {
    const q = gitQueries(project());
    expect(() => evaluate(notes, q)).toThrow(PredicateContextError);
    expect(() => evaluate({ kind: 'all', of: [{ kind: 'isRepo' }, notes] }, q)).toThrow(
      PredicateContextError,
    );
  });

  it('describes laptop paths as Windows shows them in the checklist', () => {
    const q = laptop();
    expect(explain({ kind: 'all', of: [home, { kind: 'not', predicate: notes }] }, q)).toEqual([
      { label: 'The active terminal is in C:\\Users\\kyle', passed: true },
      { label: 'Not true: Folder C:\\Users\\kyle\\notes exists', passed: true },
    ]);
    // Without a display, describe shows the path as content writes it.
    expect(describePredicate(notes)).toBe('Folder Users/kyle/notes exists');
    expect(describePredicate({ ...notes, label: 'Notes are ready' })).toBe('Notes are ready');
  });
});

describe('describe', () => {
  const cases: [Predicate, string][] = [
    [{ kind: 'isRepo' }, 'This folder is a git repository'],
    [{ kind: 'clean' }, 'Working tree is clean'],
    [{ kind: 'staged', paths: ['app.ts'] }, 'app.ts is staged'],
    [{ kind: 'staged', paths: ['a.ts', 'b.ts'], exact: true }, 'Only a.ts and b.ts are staged'],
    [{ kind: 'notStaged', paths: ['.env'] }, '.env is not staged'],
    [{ kind: 'untracked', paths: ['a', 'b', 'c'] }, 'a, b, and c are untracked'],
    [{ kind: 'tracked', paths: ['app.ts'] }, 'app.ts is tracked'],
    [{ kind: 'notTracked', paths: ['.env'] }, '.env is not tracked'],
    [{ kind: 'ignored', paths: ['dist/app.js'] }, 'dist/app.js is ignored'],
    [{ kind: 'modified', paths: ['app.ts'] }, 'app.ts has unstaged edits'],
    [{ kind: 'modified', paths: ['a', 'b'] }, 'a and b have unstaged edits'],
    [{ kind: 'commitCount', equals: 1 }, 'Exactly 1 commit'],
    [{ kind: 'commitCount', min: 2, max: 4 }, 'Between 2 and 4 commits'],
    [{ kind: 'commitCount', min: 2 }, 'At least 2 commits'],
    [{ kind: 'commitCount', max: 3 }, 'At most 3 commits'],
    [
      { kind: 'headMessage', pattern: '^feat', flags: 'i' },
      'The latest commit message matches /^feat/i',
    ],
    [{ kind: 'allMessagesMatch', pattern: '^f' }, 'Every commit message matches /^f/'],
    [
      { kind: 'allMessagesMatch', pattern: '^f', last: 1 },
      'The latest commit message matches /^f/',
    ],
    [{ kind: 'allMessagesMatch', pattern: '^f', last: 3 }, 'The last 3 commit messages match /^f/'],
    [{ kind: 'fileAtHead', path: 'a.ts' }, 'a.ts is committed'],
    [{ kind: 'fileAtHead', path: 'a.ts', equals: 'x' }, 'Committed a.ts has the expected content'],
    [{ kind: 'fileAtHead', path: 'a.ts', contains: 'x' }, 'Committed a.ts contains "x"'],
    [{ kind: 'workingFile', path: 'a.ts' }, 'a.ts exists'],
    [{ kind: 'workingFile', path: 'a.ts', exists: false }, 'a.ts does not exist'],
    [{ kind: 'workingFile', path: 'a.ts', contains: 'TODO' }, 'a.ts contains "TODO"'],
    [{ kind: 'commitChanged', paths: ['a.ts'] }, 'The latest commit changes a.ts'],
    [
      { kind: 'commitChanged', ref: 'HEAD', paths: ['a', 'b'], only: true },
      'The latest commit changes only a and b',
    ],
    [{ kind: 'commitChanged', ref: 'HEAD~1', paths: ['a'] }, 'Commit HEAD~1 changes a'],
    [{ kind: 'reflogContains', pattern: 'reset' }, 'The reflog has an entry matching /reset/'],
    [{ kind: 'headMessageIs', message: 'feat: login' }, 'HEAD is on the commit "feat: login"'],
    [{ kind: 'all', of: [{ kind: 'clean' }] }, 'All of these are true'],
    [{ kind: 'any', of: [{ kind: 'clean' }] }, 'At least one of these is true'],
    [{ kind: 'not', predicate: { kind: 'clean' } }, 'Not true: Working tree is clean'],
  ];

  it.each(cases)('describes %j', (predicate, text) => {
    expect(describePredicate(predicate)).toBe(text);
  });

  it('uses the label instead when content gives one', () => {
    expect(
      describePredicate({ kind: 'headMessage', pattern: '^(a|b): ', label: 'Uses a type' }),
    ).toBe('Uses a type');
  });
});

describe('explain', () => {
  it('turns a top-level all into one checklist row per objective', () => {
    const ws = project();
    const rows = explain(
      {
        kind: 'all',
        of: [
          { kind: 'isRepo' },
          { kind: 'clean' },
          {
            kind: 'any',
            label: 'app.ts is saved',
            of: [
              { kind: 'staged', paths: ['app.ts'] },
              { kind: 'fileAtHead', path: 'app.ts', equals: 'v1\n' },
            ],
          },
        ],
      },
      gitQueries(ws),
    );
    expect(rows).toEqual([
      { label: 'This folder is a git repository', passed: true },
      { label: 'Working tree is clean', passed: false },
      {
        label: 'app.ts is saved',
        passed: true,
        children: [
          { label: 'app.ts is staged', passed: false },
          { label: 'Committed app.ts has the expected content', passed: true },
        ],
      },
    ]);
  });

  it('keeps a labelled all, or any other predicate, as a single row', () => {
    const q = gitQueries(project());
    expect(explain({ kind: 'all', label: 'Ready', of: [{ kind: 'isRepo' }] }, q)).toEqual([
      {
        label: 'Ready',
        passed: true,
        children: [{ label: 'This folder is a git repository', passed: true }],
      },
    ]);
    expect(explain({ kind: 'not', predicate: { kind: 'clean' } }, q)).toEqual([
      { label: 'Not true: Working tree is clean', passed: true },
    ]);
  });
});
