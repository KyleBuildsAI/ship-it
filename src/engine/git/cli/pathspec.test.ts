import { describe, expect, it } from 'vitest';
import { matchPathspec } from './pathspec';

const FILES = ['README.md', 'src/app.ts', 'src/lib/util.ts', 'src/lib/util.test.ts', 'docs/a.md'];
const at = (cwd: string) => ({ cwd, displayRoot: '/project' });

describe('matchPathspec', () => {
  it('matches a single file', () => {
    expect(matchPathspec(at(''), 'README.md', FILES)).toEqual(['README.md']);
    expect(matchPathspec(at('src'), 'app.ts', FILES)).toEqual(['src/app.ts']);
  });

  it('matches everything under a folder, with . meaning the current folder', () => {
    expect(matchPathspec(at(''), 'src', FILES)).toEqual([
      'src/app.ts',
      'src/lib/util.test.ts',
      'src/lib/util.ts',
    ]);
    expect(matchPathspec(at('src/lib'), '.', FILES)).toEqual([
      'src/lib/util.test.ts',
      'src/lib/util.ts',
    ]);
    expect(matchPathspec(at(''), '.', FILES)).toHaveLength(FILES.length);
  });

  it('lets * cross folders, as git pathspecs do', () => {
    expect(matchPathspec(at(''), '*.ts', FILES)).toEqual([
      'src/app.ts',
      'src/lib/util.test.ts',
      'src/lib/util.ts',
    ]);
    expect(matchPathspec(at(''), '*.test.ts', FILES)).toEqual(['src/lib/util.test.ts']);
    expect(matchPathspec(at(''), 'docs/?.md', FILES)).toEqual(['docs/a.md']);
    expect(matchPathspec(at(''), '[R]EADME.md', FILES)).toEqual(['README.md']);
  });

  it('returns an empty list when nothing matches, and null outside the project', () => {
    expect(matchPathspec(at(''), 'missing.ts', FILES)).toEqual([]);
    expect(matchPathspec(at(''), '../outside', FILES)).toBeNull();
  });

  it('accepts Windows-style separators and ignores duplicate candidates', () => {
    expect(matchPathspec(at(''), 'src\\app.ts', ['src/app.ts', 'src/app.ts'])).toEqual([
      'src/app.ts',
    ]);
  });
});
