import { describe, expect, it } from 'vitest';
import { detectPasteKind, type PasteKind } from './detect';
import { parseLogOneline } from './logOneline';
import { parseStatusLong } from './statusLong';
import { parseStatusShort } from './statusShort';

// Every real-git fixture, keyed by file name, e.g. "./fixtures/status-sb-mixed.txt".
const FIXTURES = import.meta.glob<string>('./fixtures/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const fixtureName = (path: string) => path.replace('./fixtures/', '').replace('.txt', '');

/** What each fixture should be detected as, read from its file name. */
function expectedKind(name: string): PasteKind {
  // Git printed an error here, not a log, and a clean `git status -s` printed nothing.
  if (name === 'log-oneline-fresh-error' || name === 'status-short-clean') return 'unknown';
  if (name.startsWith('status-long-')) return 'status-long';
  if (/^status-(?:short|sb|porcelain)-/.test(name)) return 'status-short';
  if (name.startsWith('log-oneline')) return 'log-oneline';
  throw new Error(`Name the fixture ${name} after the command that produced it.`);
}

// The only real outputs expected to carry warnings: git's merge and rebase progress lines.
const EXPECTED_WARNINGS = new Set([
  'status-long-merge-conflict',
  'status-long-merge-resolved',
  'status-long-rebase-conflict',
]);

describe('detectPasteKind on every real-git fixture', () => {
  const entries = Object.entries(FIXTURES).map(([path, text]): [string, string] => [
    fixtureName(path),
    text,
  ]);

  it('found the fixtures', () => {
    expect(entries.length).toBeGreaterThan(40);
  });

  it.each(entries)('detects %s', (name, text) => {
    expect(detectPasteKind(text)).toBe(expectedKind(name));
  });

  it.each(entries)('parses %s with its own parser and no surprises', (name, text) => {
    const kind = expectedKind(name);
    if (kind === 'status-long') {
      expect(parseStatusLong(text).warnings.length > 0).toBe(EXPECTED_WARNINGS.has(name));
    } else if (kind === 'status-short') {
      expect(parseStatusShort(text).warnings).toEqual([]);
    } else if (kind === 'log-oneline') {
      expect(parseLogOneline(text).length).toBeGreaterThan(0);
    }
  });
});

describe('detectPasteKind', () => {
  it('uses the copied command when a clean `git status -s` printed nothing', () => {
    expect(detectPasteKind('PS C:\\repo> git status -s\r\nPS C:\\repo> ')).toBe('status-short');
    expect(detectPasteKind('PS C:\\repo> git status --porcelain')).toBe('status-short');
    expect(detectPasteKind('PS C:\\repo> git status --short --branch')).toBe('status-short');
  });

  it('reads pastes that start at the typed command, without the prompt', () => {
    expect(detectPasteKind('git log --oneline -3\nabc1234 feat: x')).toBe('log-oneline');
    expect(detectPasteKind('git status -sb\n## main\n M app.ts')).toBe('status-short');
    expect(detectPasteKind('git status -s\n')).toBe('status-short');
  });

  it('does not treat an empty paste, or other empty commands, as a status', () => {
    expect(detectPasteKind('')).toBe('unknown');
    expect(detectPasteKind('PS C:\\repo> git status')).toBe('unknown');
    expect(detectPasteKind('PS C:\\repo> git log --oneline')).toBe('unknown');
    expect(detectPasteKind('PS C:\\repo> npm test -s')).toBe('unknown');
  });

  it('detects a long status from a partial copy of one section', () => {
    expect(detectPasteKind('Untracked files:\n\tnotes.txt')).toBe('status-long');
  });

  it('detects a lone branch header as short status', () => {
    expect(detectPasteKind('## main...origin/main')).toBe('status-short');
  });

  it('refuses a paste that mixes formats or has stray lines', () => {
    expect(detectPasteKind(' M app.ts\nabc1234 feat: x')).toBe('unknown');
    expect(detectPasteKind('abc1234 feat: x\nsomething else')).toBe('unknown');
    expect(detectPasteKind('|\\\n|/')).toBe('unknown');
    expect(detectPasteKind('hello world')).toBe('unknown');
  });
});
