import { describe, expect, it } from 'vitest';
import ahead from './fixtures/status-long-ahead.txt?raw';
import aheadClean from './fixtures/status-long-ahead-clean.txt?raw';
import behind from './fixtures/status-long-behind.txt?raw';
import clean from './fixtures/status-long-clean.txt?raw';
import deleted from './fixtures/status-long-deleted.txt?raw';
import detached from './fixtures/status-long-detached.txt?raw';
import detachedFrom from './fixtures/status-long-detached-from.txt?raw';
import diverged from './fixtures/status-long-diverged.txt?raw';
import fresh from './fixtures/status-long-fresh.txt?raw';
import gone from './fixtures/status-long-gone.txt?raw';
import ignored from './fixtures/status-long-ignored.txt?raw';
import mergeConflict from './fixtures/status-long-merge-conflict.txt?raw';
import mergeResolved from './fixtures/status-long-merge-resolved.txt?raw';
import mixed from './fixtures/status-long-mixed.txt?raw';
import mixedColor from './fixtures/status-long-mixed-color.txt?raw';
import rebaseConflict from './fixtures/status-long-rebase-conflict.txt?raw';
import renamed from './fixtures/status-long-renamed.txt?raw';
import stagedUnborn from './fixtures/status-long-staged-unborn.txt?raw';
import subdir from './fixtures/status-long-subdir.txt?raw';
import untrackedUnborn from './fixtures/status-long-untracked-unborn.txt?raw';
import upToDate from './fixtures/status-long-up-to-date.txt?raw';
import { isStatusLongLine, parseStatusLong, type ParsedStatusLong } from './statusLong';

const NOTHING: ParsedStatusLong = {
  format: 'long',
  branch: 'main',
  detachedAt: null,
  noCommitsYet: false,
  upstream: null,
  staged: [],
  unstaged: [],
  untracked: [],
  unmerged: [],
  ignored: [],
  clean: false,
  warnings: [],
};

describe('parseStatusLong on real git output', () => {
  it('reads a clean tree', () => {
    expect(parseStatusLong(clean)).toEqual({ ...NOTHING, clean: true });
  });

  it('reads a brand-new repository as clean, with no commits yet', () => {
    expect(parseStatusLong(fresh)).toEqual({ ...NOTHING, noCommitsYet: true, clean: true });
  });

  it('reads staged, unstaged, and untracked files, decoding quoted names', () => {
    expect(parseStatusLong(mixed)).toEqual({
      ...NOTHING,
      staged: [
        { kind: 'modified', path: 'src/app.ts' },
        { kind: 'added', path: 'src/new.ts' },
      ],
      unstaged: [
        { kind: 'modified', path: 'README.md' },
        { kind: 'deleted', path: 'old.txt' },
        { kind: 'modified', path: 'src/app.ts' },
      ],
      untracked: ['café.txt', 'dist/', 'draft notes.md'],
    });
  });

  it('reads colored output exactly like plain output', () => {
    expect(parseStatusLong(mixedColor)).toEqual(parseStatusLong(mixed));
  });

  it('keeps the ../ paths git prints when run from a subfolder', () => {
    const parsed = parseStatusLong(subdir);
    expect(parsed.unstaged.map((change) => change.path)).toEqual([
      '../README.md',
      '../old.txt',
      'app.ts',
    ]);
    expect(parsed.untracked).toEqual(['../café.txt', '../dist/', '../draft notes.md']);
  });

  it('reads untracked and staged files before the first commit', () => {
    expect(parseStatusLong(untrackedUnborn)).toEqual({
      ...NOTHING,
      noCommitsYet: true,
      untracked: ['.env', 'README.md', 'notes draft.txt', 'src/'],
    });
    const staged = parseStatusLong(stagedUnborn);
    expect(staged.staged).toEqual([{ kind: 'added', path: 'README.md' }]);
    expect(staged.untracked).toEqual(['.env', 'notes draft.txt', 'src/']);
    expect(staged.warnings).toEqual([]);
  });

  it('reads renames, including names with spaces', () => {
    const parsed = parseStatusLong(renamed);
    expect(parsed.staged).toEqual([
      { kind: 'renamed', path: 'b.txt', from: 'a.txt' },
      { kind: 'renamed', path: 'kept.txt', from: 'keep.txt' },
      { kind: 'renamed', path: 'new name.txt', from: 'old name.txt' },
    ]);
    expect(parsed.unstaged).toEqual([{ kind: 'modified', path: 'kept.txt' }]);
  });

  it('reads staged and unstaged deletions and a file untracked with rm --cached', () => {
    const parsed = parseStatusLong(deleted);
    expect(parsed.staged).toEqual([
      { kind: 'deleted', path: '.env' },
      { kind: 'deleted', path: 'gone-staged.txt' },
    ]);
    expect(parsed.unstaged).toEqual([{ kind: 'deleted', path: 'gone-unstaged.txt' }]);
    expect(parsed.untracked).toEqual(['.env']);
    expect(parsed.clean).toBe(false);
  });

  it('reads ignored files listed by --ignored without counting them against clean', () => {
    const parsed = parseStatusLong(ignored);
    expect(parsed.untracked).toEqual(['notes.txt']);
    expect(parsed.ignored).toEqual(['.env', 'dist/']);
  });

  it('reads every upstream state git reports', () => {
    const upstreamOf = (text: string) => parseStatusLong(text).upstream;
    expect(upstreamOf(upToDate)).toEqual({
      name: 'origin/main',
      state: 'up-to-date',
      ahead: 0,
      behind: 0,
    });
    expect(upstreamOf(ahead)).toEqual({ name: 'origin/main', state: 'ahead', ahead: 2, behind: 0 });
    expect(upstreamOf(behind)).toEqual({
      name: 'origin/main',
      state: 'behind',
      ahead: 0,
      behind: 1,
    });
    expect(upstreamOf(diverged)).toEqual({
      name: 'origin/main',
      state: 'diverged',
      ahead: 1,
      behind: 1,
    });
    expect(upstreamOf(gone)).toEqual({
      name: 'origin/feature/old',
      state: 'gone',
      ahead: 0,
      behind: 0,
    });
  });

  it('counts a tree as clean even when commits are waiting to be pushed', () => {
    expect(parseStatusLong(aheadClean).clean).toBe(true);
    expect(parseStatusLong(ahead).clean).toBe(false);
    expect(parseStatusLong(gone).branch).toBe('feature/old');
  });

  it('reads a detached HEAD, both before and after committing on it', () => {
    expect(parseStatusLong(detached)).toEqual({
      ...NOTHING,
      branch: null,
      detachedAt: '340bbf0',
      clean: true,
    });
    expect(parseStatusLong(detachedFrom).detachedAt).toBe('340bbf0');
  });

  it('reads a merge conflict and reports the merge message as a warning', () => {
    const parsed = parseStatusLong(mergeConflict);
    expect(parsed.unmerged).toEqual([{ kind: 'both modified', path: 'app.ts' }]);
    expect(parsed.warnings).toEqual(['You have unmerged paths.']);
    expect(parsed.clean).toBe(false);
  });

  it('reads a merge whose conflicts are fixed but not yet committed', () => {
    const parsed = parseStatusLong(mergeResolved);
    expect(parsed.staged).toEqual([{ kind: 'modified', path: 'app.ts' }]);
    expect(parsed.warnings).toEqual(['All conflicts fixed but you are still merging.']);
  });

  it('survives a rebase in progress, reporting its lines as warnings', () => {
    const parsed = parseStatusLong(rebaseConflict);
    expect(parsed.branch).toBeNull();
    expect(parsed.unmerged).toEqual([{ kind: 'both modified', path: 'app.ts' }]);
    expect(parsed.warnings).toEqual([
      'interactive rebase in progress; onto e4348bf',
      'Last command done (1 command done):',
      '   pick 538baff # feat: move to port 4000',
      'No commands remaining.',
      "You are currently rebasing branch 'other' on 'e4348bf'.",
    ]);
  });
});

describe('parseStatusLong robustness', () => {
  it('handles a PowerShell prompt, CRLF, trailing spaces, and tabs turned into spaces', () => {
    const pasted =
      'PS C:\\Users\\kyle\\repo> git status\r\n' +
      mixed.replace(/\t/g, '        ').replace(/\n/g, ' \r\n') +
      'PS C:\\Users\\kyle\\repo> ';
    expect(parseStatusLong(pasted)).toEqual(parseStatusLong(mixed));
  });

  it('still reads file lines whose indentation was lost in the copy', () => {
    const parsed = parseStatusLong(mixed.replace(/\t/g, ''));
    expect(parsed.staged).toHaveLength(2);
    expect(parsed.untracked).toEqual(['café.txt', 'dist/', 'draft notes.md']);
  });

  it('understands the wording of older git versions', () => {
    const parsed = parseStatusLong(
      [
        'On branch main',
        '',
        'Initial commit',
        "Your branch is up-to-date with 'origin/main'.",
        'nothing to commit, working directory clean',
      ].join('\n'),
    );
    expect(parsed.noCommitsYet).toBe(true);
    expect(parsed.upstream?.state).toBe('up-to-date');
    expect(parsed.clean).toBe(true);
  });

  it('reads a typechange and a single commit ahead', () => {
    const parsed = parseStatusLong(
      [
        'On branch main',
        "Your branch is ahead of 'origin/main' by 1 commit.",
        'Changes not staged for commit:',
        '\ttypechange: link',
        '',
        'no changes added to commit',
      ].join('\n'),
    );
    expect(parsed.upstream?.ahead).toBe(1);
    expect(parsed.unstaged).toEqual([{ kind: 'typechange', path: 'link' }]);
  });

  it('reads every conflict label', () => {
    const labels = [
      'both modified',
      'both added',
      'both deleted',
      'added by us',
      'added by them',
      'deleted by us',
      'deleted by them',
    ];
    const text = ['Unmerged paths:', ...labels.map((label) => `\t${label}:   f.txt`)].join('\n');
    expect(parseStatusLong(text).unmerged.map((entry) => entry.kind)).toEqual(labels);
  });

  it('warns about file lines it cannot read instead of guessing', () => {
    const parsed = parseStatusLong(
      [
        'On branch main',
        'Changes to be committed:',
        '\tcopied:     a.txt -> b.txt',
        '',
        'Unmerged paths:',
        '\tsideways:   c.txt',
        '\tboth modified:',
      ].join('\n'),
    );
    expect(parsed.staged).toEqual([]);
    expect(parsed.warnings).toEqual([
      '\tcopied:     a.txt -> b.txt',
      '\tsideways:   c.txt',
      '\tboth modified:',
    ]);
  });

  it('warns about a diverged-count line that has no diverged line before it', () => {
    const parsed = parseStatusLong(
      'On branch main\nand have 1 and 2 different commits each, respectively.',
    );
    expect(parsed.upstream).toBeNull();
    expect(parsed.warnings).toHaveLength(1);
  });

  it('never calls a paste clean when it hides untracked files or has unknown lines', () => {
    const hidden = parseStatusLong(
      'On branch main\nnothing to commit (use -u to show untracked files)',
    );
    expect(hidden.clean).toBe(false);
    expect(hidden.warnings).toEqual([]);
    expect(parseStatusLong(`${clean}It took 3.1 seconds to enumerate untracked files.`).clean).toBe(
      false,
    );
  });

  it('reads a rename without an arrow as a plain path rather than failing', () => {
    const parsed = parseStatusLong('Changes to be committed:\n\trenamed:    odd.txt');
    expect(parsed.staged).toEqual([{ kind: 'renamed', path: 'odd.txt' }]);
  });

  it('returns nothing but warnings for text that is not git status at all', () => {
    const parsed = parseStatusLong('hello\nworld');
    expect(parsed.branch).toBeNull();
    expect(parsed.clean).toBe(false);
    expect(parsed.warnings).toEqual(['hello', 'world']);
  });
});

describe('isStatusLongLine', () => {
  it('recognizes headings, branch lines, and summaries', () => {
    expect(isStatusLongLine('On branch main')).toBe(true);
    expect(isStatusLongLine('Untracked files:')).toBe(true);
    expect(isStatusLongLine('nothing to commit, working tree clean')).toBe(true);
    expect(
      isStatusLongLine('no changes added to commit (use "git add" and/or "git commit -a")'),
    ).toBe(true);
  });

  it('rejects short-format and log lines', () => {
    expect(isStatusLongLine(' M app.ts')).toBe(false);
    expect(isStatusLongLine('abc1234 feat: x')).toBe(false);
  });
});
