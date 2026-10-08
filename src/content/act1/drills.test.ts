import { describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { answerKey, gradeJudgment, type JudgmentAnswer } from '../../game/missions/judgment';
import { isJudgmentDrill, type JudgmentDrill } from '../../game/missions/schema';
import { act1Missions } from './index';

/*
 * Mission 1.1's judgment drills. No drill says which answer is right: the grader works the
 * key out by running the drill. This pins the key each author meant, so a drill whose
 * engine behaviour drifts fails here instead of quietly grading Kyle wrong.
 */

const mission = act1Missions[0];
if (mission === undefined) throw new Error('Act 1 has no mission');
const drills: readonly JudgmentDrill[] = mission.drills.filter(isJudgmentDrill);

/** Every right answer, and one wrong one that the grader must miss. */
const KEYS: Readonly<Record<string, { readonly key: readonly string[]; readonly wrong: string }>> =
  {
    'wtl-predict-typo-cd': { key: ['error'], wrong: 'lands' },
    'wtl-predict-fresh-terminal': { key: ['home'], wrong: 'api' },
    'wtl-predict-dotdot': { key: ['api'], wrong: 'quillwork' },
    'wtl-diagnose-no-package': { key: ['home'], wrong: 'deleted' },
    'wtl-diagnose-claim-todo': { key: ['home'], wrong: 'right' },
    'wtl-fix-web-notes': { key: ['one-up', 'full'], wrong: 'by-name' },
    'wtl-approve-stray': { key: ['allow'], wrong: 'deny' },
    'wtl-approve-real-notes': { key: ['deny'], wrong: 'allow' },
  };

function answerFor(drill: JudgmentDrill, id: string): JudgmentAnswer {
  return drill.kind === 'approve'
    ? { kind: 'approve', allow: id === 'allow' }
    : { kind: 'pick', optionId: id };
}

describe("Mission 1.1's judgment drills", () => {
  it('pins a key for every drill', () => {
    expect(drills.map((drill) => drill.id).sort()).toEqual(Object.keys(KEYS).sort());
  });

  it('has at least one approve drill to allow and one to deny', () => {
    const approves = drills.filter((drill) => drill.kind === 'approve');
    const answers = approves.map((drill) => answerKey(drill, testDeps())[0]);
    expect(answers).toContain('allow');
    expect(answers).toContain('deny');
  });

  for (const drill of drills) {
    const pinned = KEYS[drill.id];
    it(`${drill.id}: the grader's key is the one its author meant`, () => {
      if (pinned === undefined) throw new Error(`No key pinned for ${drill.id}`);
      expect(answerKey(drill, testDeps())).toEqual(pinned.key);
      for (const id of pinned.key) {
        expect(gradeJudgment(drill, answerFor(drill, id), testDeps())).toEqual({
          passed: true,
          keyId: id,
        });
      }
      expect(gradeJudgment(drill, answerFor(drill, pinned.wrong), testDeps())).toEqual({
        passed: false,
        keyId: pinned.key[0],
      });
    });
  }

  it('fix drills have a fix that fails, as well as one that works', () => {
    for (const drill of drills) {
      if (drill.kind !== 'fix') continue;
      const key = answerKey(drill, testDeps());
      expect(
        drill.options.some((option) => !key.includes(option.id)),
        drill.id,
      ).toBe(true);
    }
  });
});
