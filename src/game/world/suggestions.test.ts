import { describe, expect, it } from 'vitest';
import { suggestFor } from './suggestions';

describe('suggestFor', () => {
  it('stages new, edited, and deleted files on the Workbench', () => {
    for (const look of ['untracked', 'modified', 'deleted'] as const) {
      expect(suggestFor({ kind: 'crate', path: 'src/app.ts', area: 'bench', look }).command).toBe(
        'git add src/app.ts',
      );
    }
  });

  it('offers to ignore a new secret, build output or log instead of adding it', () => {
    const untracked = (path: string) =>
      suggestFor({ kind: 'crate', path, area: 'bench', look: 'untracked' });
    expect(untracked('node_modules/.package-lock.json').command).toBe(
      'echo "node_modules/" >> .gitignore',
    );
    expect(untracked('dist/app.js').command).toBe('echo "dist/" >> .gitignore');
    expect(untracked('.env').command).toBe('echo ".env" >> .gitignore');
    expect(untracked('npm-debug.log').command).toBe('echo "*.log" >> .gitignore');
    expect(untracked('.env').note).toContain('Ignore this instead');
    // Real work is still staged, and a template like .env.example is real work.
    expect(untracked('src/app.ts').command).toBe('git add src/app.ts');
    expect(untracked('.env.example').command).toBe('git add .env.example');
  });

  it('shows history for a clean file', () => {
    expect(suggestFor({ kind: 'crate', path: 'a.ts', area: 'bench', look: 'clean' }).command).toBe(
      'git log --oneline -- a.ts',
    );
  });

  it('unstages crates on the Loading Dock', () => {
    expect(
      suggestFor({ kind: 'crate', path: 'a.ts', area: 'dock', look: 'staged-new' }).command,
    ).toBe('git restore --staged a.ts');
  });

  it('warns before forcing an ignored file in', () => {
    const suggestion = suggestFor({
      kind: 'crate',
      path: '.env',
      area: 'blocklist',
      look: 'ignored',
    });
    expect(suggestion.command).toBe('git add -f .env');
    expect(suggestion.note).toContain('not a secret');
  });

  it('quotes paths with spaces', () => {
    expect(
      suggestFor({ kind: 'crate', path: 'my notes.md', area: 'bench', look: 'untracked' }).command,
    ).toBe('git add "my notes.md"');
  });

  it('offers a commit with the cursor inside the quotes, and git show for platforms', () => {
    expect(suggestFor({ kind: 'vault' })).toMatchObject({
      command: 'git commit -m ""',
      cursorFromEnd: 1,
    });
    expect(suggestFor({ kind: 'commit', shortId: 'abc1234' }).command).toBe('git show abc1234');
  });
});
