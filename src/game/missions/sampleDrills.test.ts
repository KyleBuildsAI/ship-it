import { describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { playContent, replay, startLog } from '../agent/replay';
import type { BaseAction } from './agentSchema';
import { answerKey } from './judgment';
import { sampleJudgmentDrillsInput } from './sample.test-mission';
import { createSandbox } from './sandbox';
import { JudgmentDrillSchema, type JudgmentDrill } from './schema';

/*
 * Other tests hand the sample judgment drills around without loading them, so this file
 * proves each one loads and that the grader (judgment.ts) works out the key its comment
 * promises, by running the drill the way docs/act1-directed.md section 2.1 says.
 */

const drills = sampleJudgmentDrillsInput.map((input) => JudgmentDrillSchema.parse(input));

/**
 * Plays a run of Otto's lines from the drill's setup, checking that each fails exactly
 * when it is marked `fails`. The grader never reads that mark, so a wrong one would only
 * mislead the reveal, and nothing else would notice.
 */
function expectFailsMarks(drill: JudgmentDrill, actions: readonly BaseAction[]) {
  const { shell, transcript } = replay(startLog(drill.setup), testDeps());
  for (const action of actions) {
    const [line] = playContent(shell, transcript, action);
    if (action.do !== 'run' || line === undefined) continue;
    expect(line.step.exitCode !== 0, `${drill.id}: ${action.line}`).toBe(action.fails === true);
  }
}

describe('the sample judgment drills', () => {
  it('each load, with one terminal open', () => {
    for (const drill of drills) {
      const ws = createSandbox(drill.setup, testDeps());
      expect(ws.machine?.sessions(), drill.id).toHaveLength(1);
    }
  });

  it("mark every line of Otto's that fails, and no other", () => {
    for (const drill of drills) {
      expectFailsMarks(drill, drill.history);
      if (drill.kind === 'fix') {
        for (const option of drill.options)
          expectFailsMarks(drill, [...drill.history, ...option.script]);
      }
      if (drill.kind === 'approve') expectFailsMarks(drill, [...drill.history, drill.action]);
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
