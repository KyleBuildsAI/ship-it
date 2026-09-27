import { describe, expect, it } from 'vitest';
import deleted from './fixtures/status-short-deleted.txt?raw';
import ignored from './fixtures/status-short-ignored.txt?raw';
import shortClean from './fixtures/status-short-clean.txt?raw';
import shortConflict from './fixtures/status-short-merge-conflict.txt?raw';
import shortMixed from './fixtures/status-short-mixed.txt?raw';
import renamed from './fixtures/status-short-renamed.txt?raw';
import subdir from './fixtures/status-short-subdir.txt?raw';
import shortSubmodule from './fixtures/status-short-submodule.txt?raw';
import untrackedUnborn from './fixtures/status-short-untracked-unborn.txt?raw';
import porcelainBranch from './fixtures/status-porcelain-branch-up-to-date.txt?raw';
import porcelainMixed from './fixtures/status-porcelain-mixed.txt?raw';
import porcelainRenamed from './fixtures/status-porcelain-renamed.txt?raw';
import porcelainSubmodule from './fixtures/status-porcelain-submodule.txt?raw';
import sbAhead from './fixtures/status-sb-ahead.txt?raw';
import sbBehind from './fixtures/status-sb-behind.txt?raw';
import sbClean from './fixtures/status-sb-clean.txt?raw';
import sbDetached from './fixtures/status-sb-detached.txt?raw';
import sbDiverged from './fixtures/status-sb-diverged.txt?raw';
import sbDivergedColor from './fixtures/status-sb-diverged-color.txt?raw';
import sbFresh from './fixtures/status-sb-fresh.txt?raw';
import sbGone from './fixtures/status-sb-gone.txt?raw';
import sbConflict from './fixtures/status-sb-merge-conflict.txt?raw';
import sbMixed from './fixtures/status-sb-mixed.txt?raw';
import sbMixedColor from './fixtures/status-sb-mixed-color.txt?raw';
import sbStagedUnborn from './fixtures/status-sb-staged-unborn.txt?raw';
import sbUpToDate from './fixtures/status-sb-up-to-date.txt?raw';
import { parseShortBranch, parseShortEntry, parseStatusShort } from './statusShort';

const MIXED_ENTRIES = [
  { index: ' ', worktree: 'M', path: 'README.md' },
  { index: ' ', worktree: 'D', path: 'old.txt' },
  { index: 'M', worktree: 'M', path: 'src/app.ts' },
  { index: 'A', worktree: ' ', path: 'src/new.ts' },
  { index: '?', worktree: '?', path: 'café.txt' },
  { index: '?', worktree: '?', path: 'dist/' },
  { index: '?', worktree: '?', path: 'draft notes.md' },
];

describe('parseShortBranch', () => {
  it('reads a branch with no upstream', () => {
    expect(parseShortBranch('## main')).toEqual({
      name: 'main',
      detached: false,
      noCommitsYet: false,
    });
  });

  it('reads the upstream and both tracking counts', () => {
    expect(parseShortBranch('## feat/x...origin/feat/x [ahead 2, behind 13]')).toEqual({
      name: 'feat/x',
      detached: false,
      noCommitsYet: false,
      upstream: 'origin/feat/x',
      ahead: 2,
      behind: 13,
    });
  });

  it('understands the wording of older git versions for a first commit', () => {
    expect(parseShortBranch('## Initial commit on main')?.noCommitsYet).toBe(true);
  });

  it('rejects lines that are not headers, or have tracking it does not recognize', () => {
    expect(parseShortBranch(' M app.ts')).toBeNull();
    expect(parseShortBranch('## main...origin/main [sideways 3]')).toBeNull();
  });
});

describe('parseShortEntry', () => {
  it('reads staged, unstaged, and both-sided changes', () => {
    expect(parseShortEntry('M  a.ts')).toEqual({ index: 'M', worktree: ' ', path: 'a.ts' });
    expect(parseShortEntry(' M a.ts')).toEqual({ index: ' ', worktree: 'M', path: 'a.ts' });
    expect(parseShortEntry('AM a.ts')).toEqual({ index: 'A', worktree: 'M', path: 'a.ts' });
    expect(parseShortEntry(' T link')).toEqual({ index: ' ', worktree: 'T', path: 'link' });
  });

  it('reads renames and copies with the old name', () => {
    expect(parseShortEntry('C  a.ts -> b.ts')).toEqual({
      index: 'C',
      worktree: ' ',
      path: 'b.ts',
      originalPath: 'a.ts',
    });
  });

  it('treats an arrow in a non-rename line as part of the file name', () => {
    expect(parseShortEntry('?? "a -> b.txt"')?.path).toBe('a -> b.txt');
  });

  it('reads conflict codes like UU and AA', () => {
    expect(parseShortEntry('UU app.ts')).toEqual({ index: 'U', worktree: 'U', path: 'app.ts' });
    expect(parseShortEntry('AA new.ts')?.index).toBe('A');
  });

  it('reads the submodule codes m and ? in the worktree column, next to a staged change', () => {
    expect(parseShortEntry('Mm lib')).toEqual({ index: 'M', worktree: 'm', path: 'lib' });
    expect(parseShortEntry('A? vendor')).toEqual({ index: 'A', worktree: '?', path: 'vendor' });
  });

  it('rejects lines that only look like entries', () => {
    expect(parseShortEntry('   pick 538baff # feat: x')).toBeNull();
    expect(parseShortEntry('?M app.ts')).toBeNull();
    expect(parseShortEntry('!? app.ts')).toBeNull();
    expect(parseShortEntry(' ! app.ts')).toBeNull();
    expect(parseShortEntry('m  app.ts')).toBeNull();
    expect(parseShortEntry('Mx app.ts')).toBeNull();
    expect(parseShortEntry('XY app.ts')).toBeNull();
    expect(parseShortEntry('abc1234 feat: x')).toBeNull();
    expect(parseShortEntry('M')).toBeNull();
  });
});

describe('parseStatusShort on real git output', () => {
  it('reads `git status --short` with staged, unstaged, untracked, and quoted names', () => {
    expect(parseStatusShort(shortMixed)).toEqual({
      format: 'short',
      branch: null,
      entries: MIXED_ENTRIES,
      clean: false,
      warnings: [],
    });
  });

  it('reads `git status -sb` and `--porcelain` the same way', () => {
    const sb = parseStatusShort(sbMixed);
    expect(sb.branch).toEqual({ name: 'main', detached: false, noCommitsYet: false });
    expect(sb.entries).toEqual(MIXED_ENTRIES);
    expect(parseStatusShort(porcelainMixed).entries).toEqual(MIXED_ENTRIES);
  });

  it('reads colored output once the color codes are stripped', () => {
    expect(parseStatusShort(sbMixedColor)).toEqual(parseStatusShort(sbMixed));
    expect(parseStatusShort(sbDivergedColor)).toEqual(parseStatusShort(sbDiverged));
  });

  it('reads renames, including quoted names with spaces and a rename edited afterwards', () => {
    const expected = [
      { index: 'R', worktree: ' ', path: 'b.txt', originalPath: 'a.txt' },
      { index: 'R', worktree: 'M', path: 'kept.txt', originalPath: 'keep.txt' },
      { index: 'R', worktree: ' ', path: 'new name.txt', originalPath: 'old name.txt' },
    ];
    expect(parseStatusShort(renamed).entries).toEqual(expected);
    expect(parseStatusShort(porcelainRenamed).entries).toEqual(expected);
  });

  it('reads staged and unstaged deletions, and a file untracked with rm --cached', () => {
    expect(parseStatusShort(deleted).entries).toEqual([
      { index: 'D', worktree: ' ', path: '.env' },
      { index: 'D', worktree: ' ', path: 'gone-staged.txt' },
      { index: ' ', worktree: 'D', path: 'gone-unstaged.txt' },
      { index: '?', worktree: '?', path: '.env' },
    ]);
  });

  it('reads ignored files listed with --ignored', () => {
    expect(parseStatusShort(ignored).entries).toEqual([
      { index: '?', worktree: '?', path: 'notes.txt' },
      { index: '!', worktree: '!', path: '.env' },
      { index: '!', worktree: '!', path: 'dist/' },
    ]);
  });

  it('keeps relative paths from a subfolder exactly as git printed them', () => {
    expect(parseStatusShort(subdir).entries.map((entry) => entry.path)).toEqual([
      '../README.md',
      '../old.txt',
      'app.ts',
      'new.ts',
      '../café.txt',
      '../dist/',
      '../draft notes.md',
    ]);
  });

  it('reads submodules with an edited file, a new commit, and a new file inside', () => {
    expect(parseStatusShort(shortSubmodule).entries).toEqual([
      { index: ' ', worktree: 'm', path: 'lib' },
      { index: ' ', worktree: 'M', path: 'tools' },
      { index: ' ', worktree: '?', path: 'vendor' },
    ]);
    // --porcelain keeps its layout stable for scripts, so it just says M for all three.
    expect(parseStatusShort(porcelainSubmodule).entries.map((entry) => entry.worktree)).toEqual([
      'M',
      'M',
      'M',
    ]);
  });

  it('reads a merge conflict', () => {
    expect(parseStatusShort(shortConflict).entries).toEqual([
      { index: 'U', worktree: 'U', path: 'app.ts' },
    ]);
    expect(parseStatusShort(sbConflict).branch?.name).toBe('main');
  });

  it('reads untracked files before the first commit', () => {
    expect(parseStatusShort(untrackedUnborn).entries.map((entry) => entry.path)).toEqual([
      '.env',
      'README.md',
      'notes draft.txt',
      'src/',
    ]);
  });

  it('reads every branch header git printed', () => {
    const header = (text: string) => parseStatusShort(text).branch;
    expect(header(sbFresh)).toEqual({ name: 'main', detached: false, noCommitsYet: true });
    expect(header(sbStagedUnborn)?.noCommitsYet).toBe(true);
    expect(header(sbDetached)).toEqual({ name: 'HEAD', detached: true, noCommitsYet: false });
    expect(header(sbClean)).toEqual({ name: 'main', detached: false, noCommitsYet: false });
    expect(header(sbUpToDate)).toEqual({
      name: 'main',
      detached: false,
      noCommitsYet: false,
      upstream: 'origin/main',
    });
    expect(header(porcelainBranch)).toEqual(header(sbUpToDate));
    expect(header(sbAhead)).toMatchObject({ upstream: 'origin/main', ahead: 2 });
    expect(header(sbAhead)?.behind).toBeUndefined();
    expect(header(sbBehind)).toMatchObject({ upstream: 'origin/main', behind: 1 });
    expect(header(sbBehind)?.ahead).toBeUndefined();
    expect(header(sbDiverged)).toMatchObject({ ahead: 1, behind: 1 });
    expect(header(sbGone)).toEqual({
      name: 'feature/old',
      detached: false,
      noCommitsYet: false,
      upstream: 'origin/feature/old',
      upstreamGone: true,
    });
  });

  it('reads the empty output of a clean `git status --short` as clean only with its command', () => {
    expect(parseStatusShort(`PS C:\\repo> git status --short\n${shortClean}`)).toEqual({
      format: 'short',
      branch: null,
      entries: [],
      clean: true,
      warnings: [],
    });
    // On its own, an empty paste could be anything, including a paste that never happened.
    expect(parseStatusShort(shortClean).clean).toBe(false);
    expect(parseStatusShort('PS C:\\repo> git log --oneline').clean).toBe(false);
  });

  it('counts a branch header or ignored files alone as a clean status', () => {
    expect(parseStatusShort(sbClean).clean).toBe(true);
    expect(parseStatusShort('!! dist/\n!! .env').clean).toBe(true);
    expect(parseStatusShort(`${sbClean}?? notes.txt`).clean).toBe(false);
  });
});

describe('parseStatusShort robustness', () => {
  it('handles a PowerShell prompt, CRLF endings, and trailing spaces', () => {
    const pasted = `PS C:\\Users\\kyle\\repo> git status -sb\r\n${sbMixed.replace(/\n/g, '  \r\n')}PS C:\\Users\\kyle\\repo> `;
    expect(parseStatusShort(pasted)).toEqual(parseStatusShort(sbMixed));
  });

  it('skips a stray blank line in the middle of a paste', () => {
    expect(parseStatusShort('A  a.ts\n\n?? b.ts')).toMatchObject({
      entries: [
        { index: 'A', worktree: ' ', path: 'a.ts' },
        { index: '?', worktree: '?', path: 'b.ts' },
      ],
      warnings: [],
    });
  });

  it('reports lines it does not understand instead of guessing', () => {
    const parsed = parseStatusShort('## main\n M app.ts\nfatal: something odd\n## other');
    expect(parsed.entries).toEqual([{ index: ' ', worktree: 'M', path: 'app.ts' }]);
    expect(parsed.warnings).toEqual(['fatal: something odd', '## other']);
  });
});
