import { describe, expect, it } from 'vitest';
import { diffRows, isChangedRow, silencesACheck } from './diffRows';

describe('the rows of a diff', () => {
  it('are its lines, in order, blank ones included', () => {
    expect(diffRows(' a\n-b\n\n+c')).toEqual([' a', '-b', '', '+c']);
  });
});

describe('a changed row', () => {
  it('is an added or a removed line', () => {
    expect(isChangedRow('+  const name = title.trim();')).toBe(true);
    expect(isChangedRow('-  await db.docs.update(id, { title });')).toBe(true);
    // An added or removed blank line is still a change.
    expect(isChangedRow('+')).toBe(true);
  });

  it('is never context, a hunk header, a file header or an empty line', () => {
    expect(isChangedRow(' export function renameDoc() {')).toBe(false);
    expect(isChangedRow('@@ -1 +1 @@')).toBe(false);
    expect(isChangedRow('+++ b/src/docs/rename.ts')).toBe(false);
    expect(isChangedRow('--- a/src/docs/rename.ts')).toBe(false);
    expect(isChangedRow('')).toBe(false);
  });
});

describe('an added line that silences a check', () => {
  it('is caught whichever way it turns the check off', () => {
    for (const line of [
      "+  it.skip('rejects a stranger', () => {",
      "+  describe.only('rename', () => {",
      '+  "test": "vitest run || true",',
      '+  // eslint-disable-next-line @typescript-eslint/no-explicit-any',
      '+  // @ts-ignore',
      '+  // @ts-expect-error the type is wrong',
    ]) {
      expect(silencesACheck(line), line).toBe(true);
    }
  });

  it('is only an added line: removing a skip turns a check back on', () => {
    expect(silencesACheck("-  it.skip('rejects a stranger', () => {")).toBe(false);
    expect(silencesACheck("   it.skip('rejects a stranger', () => {")).toBe(false);
    expect(silencesACheck('+  const name = title.trim();')).toBe(false);
  });
});
