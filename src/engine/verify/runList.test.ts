import { describe, expect, it } from 'vitest';
import { isGreenRun, parseRunList } from './runList';

/*
 * The three shapes `gh run list` prints. The JSON one is what the Act 5 Field Mission
 * asks for; the other two are what a player or an agent gets when --json is left off.
 */

const JSON_PASTE = [
  'PS C:\\code\\sandcastles> gh run list --workflow gitleaks.yml --branch main --limit 1 --json status,conclusion,headBranch',
  '[',
  '  {',
  '    "conclusion": "success",',
  '    "headBranch": "main",',
  '    "status": "completed"',
  '  }',
  ']',
].join('\r\n');

const PIPED = [
  'completed\tfailure\tci: scan for secrets (#4)\tSecret scan\tmain\tpush\t11223344\t31s\t2026-10-13T18:02:11Z',
  'completed\tsuccess\tdocs: explain setup\tSecret scan\tmain\tpush\t11223300\t29s\t2026-10-12T09:15:40Z',
].join('\n');

const TABLE = [
  'STATUS  TITLE                       WORKFLOW     BRANCH  EVENT  ID        ELAPSED  AGE',
  '✓       ci: scan for secrets (#4)  Secret scan  main    push   11223344  31s      about 2 minutes ago',
].join('\n');

describe('parseRunList', () => {
  it('reads the JSON gh prints with --json, prompt and all', () => {
    expect(parseRunList(JSON_PASTE)).toEqual([
      { status: 'completed', conclusion: 'success', branch: 'main' },
    ]);
  });

  it('reads the tab-separated rows gh prints when piped, newest first', () => {
    const runs = parseRunList(PIPED);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toEqual({ status: 'completed', conclusion: 'failure', branch: 'main' });
  });

  it("reads a terminal's table by its status symbol, skipping the header", () => {
    expect(parseRunList(TABLE)).toEqual([
      { status: 'completed', conclusion: 'success', branch: null },
    ]);
    expect(parseRunList('*  ci: scan  Secret scan  main  push  1  5s  now')[0]?.status).toBe(
      'in_progress',
    );
    expect(parseRunList('X  ci: scan  Secret scan  main  push  1  5s  now')[0]?.conclusion).toBe(
      'failure',
    );
  });

  it('treats brackets that are not JSON as a table, and keeps only real rows', () => {
    expect(parseRunList('✓  ci: scan [skip ci]  Secret scan  main')).toHaveLength(1);
    expect(parseRunList('[{"status": 1}, 7, null]')).toEqual([
      { status: '', conclusion: '', branch: null },
    ]);
    expect(parseRunList('{"status": "completed"}')).toEqual([]);
  });

  it('finds no runs in an empty paste or in other output', () => {
    expect(parseRunList('')).toEqual([]);
    expect(parseRunList('[]')).toEqual([]);
    expect(parseRunList('no runs found')).toEqual([]);
  });
});

describe('isGreenRun', () => {
  it('is true only for a completed run that succeeded', () => {
    expect(isGreenRun({ status: 'completed', conclusion: 'success', branch: null })).toBe(true);
    expect(isGreenRun({ status: 'completed', conclusion: 'failure', branch: null })).toBe(false);
    expect(isGreenRun({ status: 'in_progress', conclusion: '', branch: null })).toBe(false);
  });
});
