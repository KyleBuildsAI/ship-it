import { describe, expect, it } from 'vitest';
import { validateAct, validateCatalog } from '../game/missions/validateAct';
import { ACTS } from '.';

describe('the shipped catalog', () => {
  it('has no id used by two Acts', () => {
    expect(validateCatalog(ACTS)).toEqual([]);
  });

  it.each(ACTS.map((entry) => [entry.act.act, entry] as const))(
    'Act %i is ready to ship on its own',
    (_number, entry) => {
      const lessons = 'lessons' in entry ? entry.lessons : [];
      expect(validateAct(entry.act, entry.missions, lessons)).toEqual([]);
    },
  );
});
