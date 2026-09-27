import { describe, expect, it } from 'vitest';
import plain from './fixtures/log-oneline.txt?raw';
import decorate from './fixtures/log-oneline-decorate.txt?raw';
import decorateColor from './fixtures/log-oneline-decorate-color.txt?raw';
import detached from './fixtures/log-oneline-detached.txt?raw';
import freshError from './fixtures/log-oneline-fresh-error.txt?raw';
import graph from './fixtures/log-oneline-graph.txt?raw';
import graphColor from './fixtures/log-oneline-graph-color.txt?raw';
import lastThree from './fixtures/log-oneline-n3.txt?raw';
import { parseLogOneline, parseOnelineLine } from './logOneline';

// The history capture.ps1 builds, newest first, with the labels `--decorate` adds.
const HISTORY = [
  { hash: '501437f', refs: ['HEAD -> main'], subject: 'docs(changelog): start a changelog' },
  { hash: '828673f', refs: ['tag: v1.1', 'origin/main'], subject: "Merge branch 'feature'" },
  { hash: '1c0066c', refs: [], subject: 'test: cover detached HEAD' },
  {
    hash: '959c681',
    refs: ['origin/feature', 'feature'],
    subject: 'docs: explain paste verification',
  },
  { hash: 'bfeb7e2', refs: [], subject: 'feat!: drop legacy format' },
  { hash: '2f0b042', refs: ['tag: v1.0'], subject: 'update stuff' },
  { hash: '84f90e1', refs: [], subject: 'fix(parser): handle quoted paths' },
  { hash: '3f82ce7', refs: [], subject: 'feat: add status parser' },
  { hash: '044d4cd', refs: [], subject: 'Initial commit' },
];

describe('parseOnelineLine', () => {
  it('reads a commit with and without decorations', () => {
    expect(parseOnelineLine('abc1234 feat: x')).toEqual({
      hash: 'abc1234',
      refs: [],
      subject: 'feat: x',
    });
    expect(parseOnelineLine('abc1234 (HEAD, tag: v2) fix: y')).toEqual({
      hash: 'abc1234',
      refs: ['HEAD', 'tag: v2'],
      subject: 'fix: y',
    });
  });

  it('reads a commit with an empty message, and one with only decorations', () => {
    expect(parseOnelineLine('abc1234')).toEqual({ hash: 'abc1234', refs: [], subject: '' });
    expect(parseOnelineLine('abc1234 (main)')).toEqual({
      hash: 'abc1234',
      refs: ['main'],
      subject: '',
    });
  });

  it('accepts long and SHA-256 hashes', () => {
    expect(parseOnelineLine(`${'a'.repeat(12)} x`)).toMatchObject({
      hash: 'aaaaaaaaaaaa',
    });
    expect(parseOnelineLine(`${'b'.repeat(64)} x`)).toMatchObject({ subject: 'x' });
  });

  it('marks lines that only draw the graph', () => {
    expect(parseOnelineLine('|\\')).toBe('graph');
    expect(parseOnelineLine('|/')).toBe('graph');
    expect(parseOnelineLine('| *')).toBe('graph');
    expect(parseOnelineLine('| | |')).toBe('graph');
  });

  it('reads commits inside a graph, including octopus merges', () => {
    expect(parseOnelineLine('| * abc1234 feat: x')).toMatchObject({ hash: 'abc1234' });
    expect(parseOnelineLine('*-.   abc1234 Merge branches')).toMatchObject({
      subject: 'Merge branches',
    });
  });

  it('rejects lines that are not commits', () => {
    expect(parseOnelineLine('')).toBeNull();
    expect(parseOnelineLine('fatal: not a git repository')).toBeNull();
    expect(parseOnelineLine('On branch main')).toBeNull();
    expect(parseOnelineLine(' M app.ts')).toBeNull();
    expect(parseOnelineLine('| abc1234 no star means no commit')).toBeNull();
    expect(parseOnelineLine('ABC1234 uppercase is not git')).toBeNull();
    expect(parseOnelineLine('abc feat: too short')).toBeNull();
  });
});

describe('parseLogOneline on real git output', () => {
  it('reads decorated output: branches, remotes, tags, and HEAD', () => {
    expect(parseLogOneline(decorate)).toEqual(HISTORY);
  });

  it('reads undecorated output, as printed when piped or with --no-decorate', () => {
    expect(parseLogOneline(plain)).toEqual(HISTORY.map((commit) => ({ ...commit, refs: [] })));
  });

  it('reads --graph output with a merge, skipping the graph-only lines', () => {
    const fromGraph = parseLogOneline(graph);
    // --graph lists the merged branch's commits before the main-line commit.
    expect(fromGraph.map((commit) => commit.hash)).toEqual([
      '501437f',
      '828673f',
      '959c681',
      'bfeb7e2',
      '1c0066c',
      '2f0b042',
      '84f90e1',
      '3f82ce7',
      '044d4cd',
    ]);
    expect([...fromGraph].sort((a, b) => a.hash.localeCompare(b.hash))).toEqual(
      [...HISTORY].sort((a, b) => a.hash.localeCompare(b.hash)),
    );
  });

  it('reads colored output exactly like plain output', () => {
    expect(parseLogOneline(decorateColor)).toEqual(parseLogOneline(decorate));
    expect(parseLogOneline(graphColor)).toEqual(parseLogOneline(graph));
  });

  it('reads a -n limited log and a detached HEAD', () => {
    expect(parseLogOneline(lastThree)).toEqual(HISTORY.slice(0, 3));
    expect(parseLogOneline(detached).slice(0, 2)).toEqual([
      {
        hash: '828673f',
        refs: ['tag: v1.1', 'origin/main', 'origin/HEAD', 'main'],
        subject: "Merge branch 'feature'",
      },
      { hash: '1c0066c', refs: ['HEAD'], subject: 'test: cover detached HEAD' },
    ]);
  });

  it("returns no commits for git's error in a repository with no commits yet", () => {
    expect(parseLogOneline(freshError)).toEqual([]);
  });
});

describe('parseLogOneline robustness', () => {
  it('handles a PowerShell prompt, CRLF, trailing spaces, and the pager marker', () => {
    const pasted =
      'PS C:\\Users\\kyle\\repo> git log --oneline -10\r\n' +
      decorate.replace(/\n/g, '   \r\n') +
      '(END)\r\n';
    expect(parseLogOneline(pasted)).toEqual(HISTORY);
  });
});
