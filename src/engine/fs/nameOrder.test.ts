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

  it('ranks accents before case, as real pwsh 7.6.10 printed these names', () => {
    // A character compare puts 'R' before 'r' and 'ù' before 'ú'. PowerShell instead puts
    // the unaccented name first whatever its case, and an acute accent before a grave one.
    expect(compareNames('resume', 'Résumé')).toBeLessThan(0);
    expect(compareNames('úa', 'ùa')).toBeLessThan(0);
    const names = ['Üb', 'ub', 'üa', 'ûa', 'ùa', 'úa', 'ua', 'Résumé2', 'resume2', 'Résumé'];
    expect([...names, 'resume', 'ÉCOLE', 'ecole'].sort(compareNames)).toEqual([
      'ecole',
      'ÉCOLE',
      'resume',
      'Résumé',
      'resume2',
      'Résumé2',
      'ua',
      'úa',
      'ùa',
      'ûa',
      'üa',
      'ub',
      'Üb',
    ]);
  });

  it('settles names that differ only by case with a character compare', () => {
    // A Windows folder can't hold both, but the sandbox's own file tree can.
    expect(compareNames('README.md', 'readme.md')).toBeLessThan(0);
    expect(compareNames('readme.md', 'README.md')).toBeGreaterThan(0);
    expect(compareNames('résumé', 'résumé')).toBe(0);
  });
});
