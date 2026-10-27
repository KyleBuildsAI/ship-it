import { describe, expect, it } from 'vitest';
import { hangingIndent } from './artifactLines';

describe('where a wrapped artifact line carries on', () => {
  it('hangs code in past its own indent, so the rest never looks like a new line', () => {
    expect(hangingIndent('code', 'const sql =')).toBe(2);
    expect(hangingIndent('code', '  " AND title LIKE \'%" + req.query.q + "%\'";')).toBe(4);
    expect(
      hangingIndent('terminal', '     34    48.21      61.30       2.14    8712   1 node'),
    ).toBe(7);
  });

  it('hangs a diff line past its + or -, which marks the whole line, and its indent', () => {
    expect(hangingIndent('diff', "+  return user.role === 'admin' || Boolean(doc.ownerId);")).toBe(
      5,
    );
    expect(hangingIndent('diff', ' export function canEdit(user: User, doc: Doc) {')).toBe(3);
    expect(
      hangingIndent('diff', '@@ -8,4 +8,8 @@ export async function saveDraft(doc: Doc) {'),
    ).toBe(2);
  });

  it('counts a - only in a diff: in a file it starts a list item', () => {
    expect(hangingIndent('file', '- Redis cache (can be rebuilt from Postgres)')).toBe(2);
  });

  it('wraps prose flush, like a paragraph', () => {
    for (const kind of ['agent-message', 'issue', 'pull-request'] as const) {
      expect(hangingIndent(kind, '  I can fix this quickly with a force push.')).toBe(0);
    }
  });
});
