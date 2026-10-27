import { describe, expect, it } from 'vitest';
import { buildOutputToIgnore, trackedSecretPaths } from './checks';
import lsFiles from './fixtures/ls-files.txt?raw';
import { looksLikePathList, parsePathList } from './pathList';

describe('parsePathList', () => {
  it('reads real `git ls-files` output, decoding the quoted name', () => {
    expect(parsePathList(lsFiles)).toEqual([
      '.env',
      '.env.example',
      'README.md',
      'café/.env.local',
      'dist/app.js',
    ]);
  });

  it('drops the copied prompt, blank lines, and CRLF endings', () => {
    expect(
      parsePathList('PS C:\\repo> git ls-files\r\nsrc/app.ts\r\n\r\n.env\r\nPS C:\\repo> '),
    ).toEqual(['src/app.ts', '.env']);
  });

  it('feeds the checks every tracked file, not only the changed ones', () => {
    const paths = parsePathList(lsFiles);
    // Without decoding, the second one would end in `.env.local"` and slip through.
    expect(trackedSecretPaths(paths)).toEqual(['.env', 'café/.env.local']);
    expect(buildOutputToIgnore(paths)).toEqual(['dist/']);
  });
});

describe('looksLikePathList', () => {
  it('accepts real `git ls-files` output, with or without the copied prompt', () => {
    expect(looksLikePathList(lsFiles)).toBe(true);
    expect(looksLikePathList('PS C:\\repo> git ls-files\r\n.gitignore\r\nsrc/app.ts\r\n')).toBe(
      true,
    );
    // ls-files prints a space in a name bare, and quotes a name with non-ASCII letters.
    const spaced = [
      'docs/Meeting notes.md',
      'My Notes.md',
      '"docs/caf\\303\\251 menu.md"',
      'src/app.ts',
    ];
    expect(looksLikePathList(spaced.join('\n'))).toBe(true);
    expect(looksLikePathList('LICENSE\nMakefile\npackage.json\n')).toBe(true);
    // Real git 2.5x output: a file with no extension in a folder with a space stays bare.
    expect(looksLikePathList('My Folder/LICENSE\nMy Notes.md\n"caf\\303\\251 menu.md"\n')).toBe(
      true,
    );
  });

  it('refuses a quoted line with no escape in it, since git quotes only to escape', () => {
    // ls-files leaves spaces bare, so a quoted name always holds a backslash escape.
    expect(looksLikePathList('"No .env tracked."')).toBe(false);
    expect(looksLikePathList('"README.md"\n"src/app.ts"')).toBe(false);
  });

  it('refuses a list copied from a chat reply, whose markers hide secret names', () => {
    // `- .env.local` isn't named `.env.local`, so the secret check would miss it.
    expect(looksLikePathList('- README.md\n- src/app.ts\n- .env.local')).toBe(false);
    expect(looksLikePathList('* README.md\n* credentials.json')).toBe(false);
    expect(looksLikePathList('• README.md\n• .env.production')).toBe(false);
    expect(looksLikePathList('1. README.md\n2. .env.local')).toBe(false);
  });

  it('needs a file name with a dot, which every real project has, not a word like N/A', () => {
    expect(looksLikePathList('N/A')).toBe(false);
    expect(looksLikePathList('n/a\nyes/no')).toBe(false);
    expect(looksLikePathList('.gitignore')).toBe(true);
  });

  it('refuses a summary instead of the list, however short', () => {
    for (const summary of [
      'all clean',
      'hello',
      'done\nok',
      'No .env',
      'Everything is committed.',
      'Tracked: README.md, src/app.ts',
      '"all clean"',
    ]) {
      expect(looksLikePathList(summary), summary).toBe(false);
    }
  });

  it("refuses git's own errors and other commands' output", () => {
    const notARepo = 'fatal: not a git repository (or any of the parent directories): .git';
    expect(looksLikePathList(notARepo)).toBe(false);
    expect(looksLikePathList('## main...origin/main\n M src/app.ts\n')).toBe(false);
    expect(looksLikePathList('a1b2c3d feat: add tide charts\n')).toBe(false);
    expect(looksLikePathList('On branch main\nnothing to commit, working tree clean\n')).toBe(
      false,
    );
    // An indented list was copied from a chat reply, not from git, and hides what's on it.
    expect(looksLikePathList('  src/app.ts\n  .env\n')).toBe(false);
    expect(looksLikePathList('\n\n')).toBe(false);
  });
});
