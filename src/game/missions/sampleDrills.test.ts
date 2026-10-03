import { describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { Shell, type ShellResult } from '../../engine/shell/shell';
import type { BaseAction, Outcome } from './agentSchema';
import { evaluate, type Predicate } from './predicates';
import { sampleJudgmentDrillsInput } from './sample.test-mission';
import { createSandbox, sandboxQueries } from './sandbox';
import { JudgmentDrillSchema, type JudgmentDrill } from './schema';

/*
 * Other tests hand the sample judgment drills around without loading them, so this file
 * proves each one loads and has the answer its comment promises. It works a key out the
 * way docs/act1-directed.md section 2.1 says the engine will: build the setup, play
 * Otto's history, then run the action or script and check the laptop.
 */

const drills = sampleJudgmentDrillsInput.map((input) => JudgmentDrillSchema.parse(input));

/** Runs one of Otto's lines, which must fail exactly when it is marked `fails`. */
function run(shell: Shell, action: BaseAction): ShellResult {
  if (action.do !== 'run') throw new Error(`The samples only run lines, not "${action.do}".`);
  const result = shell.run(action.line);
  expect(result.exitCode !== 0, action.line).toBe(action.fails === true);
  return result;
}

/** A fresh copy of the drill's laptop, just as the clock would start. */
function scene(drill: JudgmentDrill) {
  const ws = createSandbox(drill.setup, testDeps());
  const shell = new Shell(ws, 'C:\\Users\\kyle\\quillwork\\app');
  for (const action of drill.history) run(shell, action);
  const holds = (predicate: Predicate) => evaluate(predicate, sandboxQueries(ws));
  return { shell, holds };
}

function outcomeHolds(outcome: Outcome, result: ShellResult, holds: (p: Predicate) => boolean) {
  const printed = result.lines.map((line) => line.text.toLowerCase()).join('\n');
  return (
    (outcome.result === undefined || (outcome.result === 'error') === (result.exitCode !== 0)) &&
    (outcome.printed === undefined || printed.includes(outcome.printed.toLowerCase())) &&
    (outcome.state === undefined || holds(outcome.state))
  );
}

/** The ids of the right options, or for an approve drill, the right button. */
function rightAnswers(drill: JudgmentDrill): string[] {
  switch (drill.kind) {
    case 'predict': {
      const { shell, holds } = scene(drill);
      if (drill.action.do !== 'run') throw new Error('The samples only predict lines.');
      const result = shell.run(drill.action.line);
      return drill.options
        .filter((option) => outcomeHolds(option.outcome, result, holds))
        .map((option) => option.id);
    }
    case 'diagnose': {
      const { holds } = scene(drill);
      return drill.options
        .filter((option) => option.truth !== undefined && holds(option.truth))
        .map((option) => option.id);
    }
    case 'fix':
      return drill.options
        .filter((option) => {
          const { shell, holds } = scene(drill);
          for (const action of option.script) run(shell, action);
          return holds(drill.goal) && !drill.failIf.some(holds);
        })
        .map((option) => option.id);
    case 'approve': {
      const { shell, holds } = scene(drill);
      run(shell, drill.action);
      return [drill.guards.every(holds) ? 'allow' : 'deny'];
    }
  }
}

describe('the sample judgment drills', () => {
  it('each load, with one terminal open', () => {
    for (const drill of drills) {
      const ws = createSandbox(drill.setup, testDeps());
      expect(ws.machine?.sessions(), drill.id).toHaveLength(1);
    }
  });

  it('each have the answer their comment promises, and one approve drill is a deny', () => {
    const keys = Object.fromEntries(drills.map((drill) => [drill.id, rightAnswers(drill)]));
    expect(keys).toEqual({
      'sample-predict-typo': ['error'],
      'sample-diagnose-home': ['home'],
      'sample-fix-cd': ['full-path', 'step-by-step'],
      'sample-approve-stray': ['allow'],
      'sample-approve-notes': ['deny'],
    });
  });
});
