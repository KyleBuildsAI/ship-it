import { describe, expect, it } from 'vitest';
import { EnvTable, expandPercent } from './envTable';

describe('EnvTable', () => {
  it('finds a variable whatever case you ask with', () => {
    const env = new EnvTable({ Path: 'C:\\Windows' });

    expect(env.get('PATH')).toBe('C:\\Windows');
    expect(env.get('path')).toBe('C:\\Windows');
    expect(env.has('pAtH')).toBe(true);
  });

  it('keeps the spelling a name was first given', () => {
    const env = new EnvTable({ Path: 'a' });
    env.set('PATH', 'b');

    expect(env.entries()).toEqual([{ name: 'Path', value: 'b' }]);
  });

  it('deletes a variable set to an empty value, as Windows does', () => {
    const env = new EnvTable({ PORT: '3000' });
    env.set('PORT', '');

    expect(env.get('PORT')).toBeNull();
    expect(env.has('PORT')).toBe(false);
  });

  it('removes a variable and says whether it was there', () => {
    const env = new EnvTable({ PORT: '3000' });

    expect(env.delete('port')).toBe(true);
    expect(env.delete('port')).toBe(false);
  });

  it('lists variables alphabetically, ignoring case', () => {
    const env = new EnvTable({ zeta: '1', Alpha: '2', beta: '3' });

    expect(env.entries().map((entry) => entry.name)).toEqual(['Alpha', 'beta', 'zeta']);
  });

  it('saves a %reference from a fresh install as expandable, and anything else as plain', () => {
    const env = new EnvTable({ Path: '%USERPROFILE%\\bin', OS: 'Windows_NT' });

    expect(env.expands('path')).toBe(true);
    expect(env.expands('OS')).toBe(false);
  });

  it('stores plain text unless told to expand, even over a value that expanded', () => {
    const env = new EnvTable({ Path: '%USERPROFILE%\\bin' });
    env.set('Path', '%USERPROFILE%\\bin;C:\\tools');

    expect(env.expands('Path')).toBe(false);
    env.set('Path', '%USERPROFILE%\\bin', { expand: true });
    expect(env.expands('Path')).toBe(true);
    env.delete('Path');
    expect(env.expands('Path')).toBe(false);
  });

  it('copies into an independent table', () => {
    const env = new EnvTable({ PORT: '3000' });
    const copy = env.clone();
    copy.set('PORT', '4000');

    expect(env.get('PORT')).toBe('3000');
    expect(copy.get('Port')).toBe('4000');
    expect(new EnvTable({ Path: '%A%' }).clone().expands('Path')).toBe(true);
  });
});

describe('expandPercent', () => {
  const lookup = (name: string) =>
    name.toUpperCase() === 'USERPROFILE' ? 'C:\\Users\\kyle' : null;

  it('expands %NAME% references', () => {
    expect(expandPercent('%USERPROFILE%\\AppData', lookup)).toBe('C:\\Users\\kyle\\AppData');
  });

  it('leaves unknown names as written', () => {
    expect(expandPercent('%NOPE%\\bin;%USERPROFILE%', lookup)).toBe('%NOPE%\\bin;C:\\Users\\kyle');
  });
});
