import { describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { answerKey } from './judgment';
import { sampleJudgmentDrillsInput } from './sample.test-mission';
import { createSandbox } from './sandbox';
import { JudgmentDrillSchema } from './schema';

/*
 * Other tests hand the sample judgment drills around without loading them, so this file
 * proves each one loads and that the grader (judgment.ts) works out the key its comment
 * promises, by running the drill the way docs/act1-directed.md section 2.1 says.
 */

const drills = sampleJudgmentDrillsInput.map((input) => JudgmentDrillSchema.parse(input));

describe('the sample judgment drills', () => {
  it('each load, with one terminal open', () => {
    for (const drill of drills) {
      const ws = createSandbox(drill.setup, testDeps());
      expect(ws.machine?.sessions(), drill.id).toHaveLength(1);
    }
  });

  it('each have the answer their comment promises, and one approve drill is a deny', () => {
    const keys = Object.fromEntries(
      drills.map((drill) => [drill.id, answerKey(drill, testDeps())]),
    );
    expect(keys).toEqual({
      'sample-predict-typo': ['error'],
      'sample-diagnose-home': ['home'],
      'sample-fix-cd': ['full-path', 'step-by-step'],
      'sample-approve-stray': ['allow'],
      'sample-approve-notes': ['deny'],
    });
  });
});
