import { describe, expect, it } from 'vitest';
import { directedMission, sampleMission } from '../../game/missions/sample.test-mission';
import { isReadOnly } from './readOnly';

const typedDrill = sampleMission.drills[0];
const judgmentDrill = directedMission.drills[0];

/** A review of one typed drill, then one judgment drill, `done` of them finished. */
function review(done: number, active: number | null = null) {
  if (typedDrill === undefined || judgmentDrill === undefined) throw new Error('No sample drills');
  return {
    kind: 'review' as const,
    drills: [typedDrill, judgmentDrill],
    active: active === null ? null : { index: active },
    results: Array.from({ length: done }),
  };
}

describe('isReadOnly', () => {
  it('lets the player type in free play and in typed missions', () => {
    expect(isReadOnly(null)).toBe(false);
    expect(isReadOnly({ kind: 'mission', mission: sampleMission })).toBe(false);
  });

  it('gives Otto the terminal for a directed mission, start to finish', () => {
    expect(isReadOnly({ kind: 'mission', mission: directedMission })).toBe(true);
  });

  it('follows the drill on screen, or next up, in a placement test or review', () => {
    expect(isReadOnly(review(0))).toBe(false);
    expect(isReadOnly(review(0, 0))).toBe(false);
    // After the typed drill: the judgment drill is next, and its scene plays first.
    expect(isReadOnly(review(1))).toBe(true);
    expect(isReadOnly(review(1, 1))).toBe(true);
    expect(isReadOnly(review(2))).toBe(false);
  });

  it("leaves Act 2's boss and Field Mission typed", () => {
    expect(isReadOnly({ kind: 'boss' })).toBe(false);
    expect(isReadOnly({ kind: 'field' })).toBe(false);
  });
});
