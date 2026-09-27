import { describe, expect, it } from 'vitest';
import { folder } from '../../engine/git/fixtures';
import { testDeps } from '../../engine/git/testDeps';
import { Shell } from '../../engine/shell/shell';
import { completeLine } from './complete';

const shell = () =>
  new Shell(
    folder()
      .write('README.md', '')
      .write('src/app.ts', '')
      .write('src/api.ts', '')
      .write('scripts/build.ps1', '')
      .build(testDeps()),
    'C:\\app',
  );

describe('completeLine', () => {
  it('completes commands, then git subcommands', () => {
    expect(completeLine(shell(), 'gi')).toBe('git');
    expect(completeLine(shell(), 'git sta')).toBe('status');
    // Several matches that share nothing more than what was typed: nothing to add.
    expect(completeLine(shell(), 'git re')).toBeNull();
    expect(completeLine(shell(), 'c')).toBeNull();
    expect(completeLine(shell(), 'zz')).toBeNull();
  });

  it('completes file and folder names, adding a slash to folders', () => {
    expect(completeLine(shell(), 'cat RE')).toBe('README.md');
    expect(completeLine(shell(), 'cd sr')).toBe('src/');
    expect(completeLine(shell(), 'git add src/ap')).toBeNull();
    expect(completeLine(shell(), 'git add src/app')).toBe('src/app.ts');
    expect(completeLine(shell(), 'cat src\\app')).toBe('src/app.ts');
  });

  it('completes relative to the current folder', () => {
    const inside = shell();
    inside.run('cd src');
    expect(completeLine(inside, 'cat app')).toBe('app.ts');
    expect(completeLine(inside, 'cat ../RE')).toBe('../README.md');
  });

  it('gives up for unknown folders or no matches', () => {
    expect(completeLine(shell(), 'cat nope/x')).toBeNull();
    expect(completeLine(shell(), 'cat zzz')).toBeNull();
  });
});
