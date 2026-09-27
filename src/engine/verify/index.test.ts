import { describe, expect, it } from 'vitest';
import {
  buildOutputToIgnore,
  conventionalRatio,
  detectPasteKind,
  isCleanStatus,
  parseLogOneline,
  parseStatusLong,
  parseStatusShort,
  trackedSecretPaths,
} from './index';

// What a Field Mission does with a paste, start to finish, through the public entry point.
describe('paste verification, end to end', () => {
  it('grades the Act 2 "Clean the dirty tree" mission from a messy status paste', () => {
    const paste = [
      'PS C:\\Users\\kyle\\SandCastles> git status',
      'On branch main',
      "Your branch is ahead of 'origin/main' by 3 commits.",
      '  (use "git push" to publish your local commits)',
      '',
      'Changes to be committed:',
      '  (use "git restore --staged <file>..." to unstage)',
      '        new file:   .env',
      '',
      'Untracked files:',
      '  (use "git add <file>..." to include in what will be committed)',
      '        dist/',
      '',
      'PS C:\\Users\\kyle\\SandCastles> ',
    ].join('\r\n');

    expect(detectPasteKind(paste)).toBe('status-long');
    const status = parseStatusLong(paste);
    expect(isCleanStatus(status)).toBe(false);
    expect(trackedSecretPaths(status)).toEqual(['.env']);
    expect(buildOutputToIgnore(status)).toEqual(['dist/']);
    expect(status.upstream).toMatchObject({ state: 'ahead', ahead: 3 });
  });

  it('passes the same mission once the tree is clean, in either status format', () => {
    expect(
      isCleanStatus(parseStatusLong('On branch main\nnothing to commit, working tree clean')),
    ).toBe(true);
    const short = 'PS C:\\repo> git status -s\r\n';
    expect(detectPasteKind(short)).toBe('status-short');
    expect(isCleanStatus(parseStatusShort(short))).toBe(true);
  });

  it('scores commit hygiene from a pasted log', () => {
    const paste = [
      'PS C:\\repo> git log --oneline -3',
      'b2c3d4e (HEAD -> main) feat: add queue',
      'c3d4e5f wip',
      'd4e5f6a fix(api): retry once',
      '',
    ].join('\r\n');
    expect(detectPasteKind(paste)).toBe('log-oneline');
    expect(conventionalRatio(parseLogOneline(paste))).toBeCloseTo(2 / 3);
  });
});
