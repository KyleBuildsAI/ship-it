import { describe, expect, it } from 'vitest';
import { baseName, isWithin, joinPath, parentDir, relativePath, resolvePath } from './paths';

describe('resolvePath', () => {
  it('resolves relative paths against the current directory', () => {
    expect(resolvePath('', 'app.ts')).toBe('app.ts');
    expect(resolvePath('src', 'app.ts')).toBe('src/app.ts');
    expect(resolvePath('src', './lib/util.ts')).toBe('src/lib/util.ts');
  });

  it('accepts PowerShell-style backslashes', () => {
    expect(resolvePath('', 'src\\lib\\util.ts')).toBe('src/lib/util.ts');
    expect(resolvePath('src/lib', '..\\app.ts')).toBe('src/app.ts');
  });

  it('treats a leading slash as the project root', () => {
    expect(resolvePath('src/lib', '/README.md')).toBe('README.md');
  });

  it('handles dot segments and duplicate slashes', () => {
    expect(resolvePath('src', '../docs//guide.md')).toBe('docs/guide.md');
    expect(resolvePath('src', '.')).toBe('src');
    expect(resolvePath('src', '..')).toBe('');
  });

  it('refuses to climb above the project root', () => {
    expect(resolvePath('', '..')).toBeNull();
    expect(resolvePath('src', '../../etc/passwd')).toBeNull();
  });
});

describe('path helpers', () => {
  it('splits paths into parent directory and base name', () => {
    expect(parentDir('src/lib/util.ts')).toBe('src/lib');
    expect(parentDir('README.md')).toBe('');
    expect(baseName('src/lib/util.ts')).toBe('util.ts');
    expect(baseName('README.md')).toBe('README.md');
  });

  it('joins onto the root without a leading slash', () => {
    expect(joinPath('', 'a.ts')).toBe('a.ts');
    expect(joinPath('src', 'a.ts')).toBe('src/a.ts');
  });

  it('knows which paths live inside a directory', () => {
    expect(isWithin('src/app.ts', 'src')).toBe(true);
    expect(isWithin('src', 'src')).toBe(true);
    expect(isWithin('srcx/app.ts', 'src')).toBe(false);
    expect(isWithin('anything', '')).toBe(true);
  });
});

describe('relativePath', () => {
  it('prints paths the way git does from a subdirectory', () => {
    expect(relativePath('', 'src/app.ts')).toBe('src/app.ts');
    expect(relativePath('src', 'src/app.ts')).toBe('app.ts');
    expect(relativePath('src', 'README.md')).toBe('../README.md');
    expect(relativePath('src/lib', 'docs/a.md')).toBe('../../docs/a.md');
  });

  it('uses "." for the directory itself', () => {
    expect(relativePath('src', 'src')).toBe('.');
    expect(relativePath('', '')).toBe('.');
  });
});
