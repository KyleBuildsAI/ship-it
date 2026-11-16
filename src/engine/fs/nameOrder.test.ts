import { describe, expect, it } from 'vitest';
import { compareNames } from './nameOrder';

describe('compareNames', () => {
  it('puts names in the order real pwsh 7.6.6 printed them, not by character code', () => {
    const names = ['api', '_notes', 'Zeta', '~$plan.docx', '[x]', 'b.txt'];
    expect([...names].sort(compareNames)).toEqual([
      '_notes',
      '[x]',
      '~$plan.docx',
      'api',
      'b.txt',
      'Zeta',
    ]);
  });

  it('ignores case, so a capital letter does not jump the queue', () => {
    expect(compareNames('Zeta', 'api')).toBeGreaterThan(0);
    expect(compareNames('api', 'Zeta')).toBeLessThan(0);
  });

  it('settles names English rules call equal with a character compare, unaccented first', () => {
    expect(compareNames('resume', 'résumé')).toBeLessThan(0);
    expect(compareNames('résumé', 'resume')).toBeGreaterThan(0);
    expect(compareNames('résumé', 'résumé')).toBe(0);
  });
});
