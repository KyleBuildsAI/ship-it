import { describe, expect, it } from 'vitest';
import { IgnoreRules } from './ignore';

const ignored = (rules: string, path: string) => new IgnoreRules(rules).isIgnored(path);

describe('IgnoreRules', () => {
  it('ignores nothing without rules, and skips comments and blank lines', () => {
    expect(ignored('', 'app.ts')).toBe(false);
    expect(ignored('# secrets\n\n   \n', 'app.ts')).toBe(false);
  });

  it('matches a plain name at any depth', () => {
    expect(ignored('.env', '.env')).toBe(true);
    expect(ignored('.env', 'server/.env')).toBe(true);
    expect(ignored('.env', '.env.example')).toBe(false);
  });

  it('matches * and ? within a single folder', () => {
    expect(ignored('*.log', 'debug.log')).toBe(true);
    expect(ignored('*.log', 'logs/today.log')).toBe(true);
    expect(ignored('*.log', 'debug.log.txt')).toBe(false);
    expect(ignored('file?.txt', 'file1.txt')).toBe(true);
    expect(ignored('file?.txt', 'file10.txt')).toBe(false);
  });

  it('ignores everything inside an ignored folder', () => {
    expect(ignored('node_modules', 'node_modules/react/index.js')).toBe(true);
    expect(ignored('node_modules/', 'web/node_modules/x.js')).toBe(true);
  });

  it('applies a trailing slash to folders only', () => {
    expect(ignored('build/', 'build/app.js')).toBe(true);
    expect(ignored('build/', 'build')).toBe(false);
  });

  it('anchors patterns with a leading or middle slash to the root', () => {
    expect(ignored('/dist', 'dist/main.js')).toBe(true);
    expect(ignored('/dist', 'packages/dist/main.js')).toBe(false);
    expect(ignored('docs/*.md', 'docs/a.md')).toBe(true);
    expect(ignored('docs/*.md', 'site/docs/a.md')).toBe(false);
    expect(ignored('docs/*.md', 'docs/deep/a.md')).toBe(false);
  });

  it('crosses folders with **', () => {
    expect(ignored('**/temp', 'a/b/temp/x.txt')).toBe(true);
    expect(ignored('logs/**', 'logs/2026/sep.log')).toBe(true);
    expect(ignored('src/**/*.snap', 'src/a/b/c.snap')).toBe(true);
    expect(ignored('src/**/*.snap', 'src/c.snap')).toBe(true);
  });

  it('supports character classes, including negated ones', () => {
    expect(ignored('*.[oa]', 'lib.a')).toBe(true);
    expect(ignored('*.[oa]', 'lib.c')).toBe(false);
    expect(ignored('*.[!oa]', 'lib.c')).toBe(true);
    expect(ignored('[', '[')).toBe(true);
  });

  it('re-includes files with a later ! rule', () => {
    const rules = '.env*\n!.env.example';
    expect(ignored(rules, '.env')).toBe(true);
    expect(ignored(rules, '.env.local')).toBe(true);
    expect(ignored(rules, '.env.example')).toBe(false);
  });

  it('cannot re-include a file inside an ignored folder', () => {
    expect(ignored('secrets/\n!secrets/keep.txt', 'secrets/keep.txt')).toBe(true);
  });

  it('escapes regex characters in names', () => {
    expect(ignored('a+b.txt', 'a+b.txt')).toBe(true);
    expect(ignored('a+b.txt', 'aab.txt')).toBe(false);
  });

  it('ignores a pattern that is only a slash', () => {
    expect(ignored('/', 'anything')).toBe(false);
  });

  it('accepts Windows line endings', () => {
    expect(ignored('dist/\r\n*.log\r\n', 'debug.log')).toBe(true);
  });
});
