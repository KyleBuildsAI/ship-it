import { describe, expect, it } from 'vitest';
import { documentedRequest, isFromFile, parseSelectString } from './selectString';

// What PowerShell prints for: Select-String -Path README.md -Pattern 'GET /|...|[1-5][0-9][0-9]'
const README_MATCHES = [
  "PS C:\\Code\\SandCastles> Select-String -Path README.md -Pattern 'GET /|[1-5][0-9][0-9]'",
  '',
  'README.md:14:GET /health',
  'README.md:16:Returns 200 OK with this body:',
  '',
].join('\r\n');

describe('parseSelectString', () => {
  it('reads each match as file, line number and text, skipping the copied prompt', () => {
    expect(parseSelectString(README_MATCHES)).toEqual([
      { path: 'README.md', lineNumber: 14, text: 'GET /health' },
      { path: 'README.md', lineNumber: 16, text: 'Returns 200 OK with this body:' },
    ]);
  });

  it('keeps a full Windows path whole, drive letter colon and all', () => {
    expect(parseSelectString('C:\\Code\\SandCastles\\README.md:3:POST /castles')).toEqual([
      { path: 'C:\\Code\\SandCastles\\README.md', lineNumber: 3, text: 'POST /castles' },
    ]);
  });

  it('keeps colons inside the matched line', () => {
    expect(parseSelectString('README.md:20:  "status": "ok"')[0]?.text).toBe('  "status": "ok"');
  });

  it('finds nothing in a paste that is not Select-String output', () => {
    expect(parseSelectString('')).toEqual([]);
    expect(parseSelectString('nothing to commit, working tree clean')).toEqual([]);
  });
});

describe('isFromFile', () => {
  it('compares the file name only, ignoring folder and case', () => {
    const [match] = parseSelectString('C:\\Code\\SandCastles\\readme.md:3:GET /');
    if (match === undefined) throw new Error('expected a match');
    expect(isFromFile(match, 'README.md')).toBe(true);
    expect(isFromFile({ ...match, path: 'docs/README.md' }, 'README.md')).toBe(true);
    expect(isFromFile({ ...match, path: 'notes.md' }, 'README.md')).toBe(false);
  });
});

describe('documentedRequest', () => {
  it('finds the method and path, and the status code', () => {
    expect(documentedRequest(['## API', 'GET /health', 'Status: 200 OK'])).toEqual({
      request: 'GET /health',
      statusCode: '200',
    });
    expect(documentedRequest(['`DELETE /api/castles/:id` returns 204'])).toEqual({
      request: 'DELETE /api/castles/:id',
      statusCode: '204',
    });
    expect(documentedRequest(['It returns 404.']).statusCode).toBe('404');
  });

  it('ignores numbers that are not status codes', () => {
    const lines = ['Runs on port 3000 since 2024', 'Version 1.204.3'];
    expect(documentedRequest(lines).statusCode).toBeNull();
  });

  it('needs a method in capitals followed by a path', () => {
    expect(documentedRequest(['get the castles', 'GET castles']).request).toBeNull();
  });
});
