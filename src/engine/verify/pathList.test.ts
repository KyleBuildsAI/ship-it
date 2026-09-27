import { describe, expect, it } from 'vitest';
import { buildOutputToIgnore, trackedSecretPaths } from './checks';
import lsFiles from './fixtures/ls-files.txt?raw';
import { parsePathList } from './pathList';

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
