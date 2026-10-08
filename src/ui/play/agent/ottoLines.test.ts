import { describe, expect, it } from 'vitest';
import {
  beginAgentStep,
  choosePlan,
  decideGate,
  echoPlan,
  finishScript,
  nextAction,
  openGate,
  stopScript,
  type AgentStepState,
} from '../../../game/missions/agentRunner';
import { FIX_ROUND_LINES, type AgentTask } from '../../../game/missions/agentSchema';
import type { MissionStep } from '../../../game/missions/schema';
import { notesMission } from '../../../game/missions/sample.test-mission';
import {
  GOOD_STOP,
  NEEDS_OK,
  ON_IT,
  OTTO_INTRO,
  ottoLine,
  PREDICT_ASK,
  YOUR_CALL,
  DIFFERENT_WAY,
} from './ottoLines';

/** The notes sample's one step, named once so every test below can use it. */
function notesStep(): MissionStep & { agent: AgentTask } {
  const [first] = notesMission.steps;
  if (first?.agent === undefined) throw new Error('the notes sample has a directed step');
  return { ...first, agent: first.agent };
}
const step = notesStep();
const task = step.agent;

/** Otto takes his next action from the running stage, as play does. */
function next(state: AgentStepState): AgentStepState {
  const taken = nextAction(state);
  if (taken === null) return finishScript(state);
  return taken.state;
}

/** The tidy fix's first line, a safe delete, waiting at its gate, with Otto's `say` if given. */
function atTidyGate(say?: string): AgentStepState {
  const running = choosePlan(
    { ...beginAgentStep(step), stage: { at: 'direct', round: 'fix' } },
    step,
    'tidy-and-redo',
  );
  const taken = nextAction(running);
  if (taken === null) throw new Error('the tidy fix has lines');
  const gate = {
    kind: 'line',
    line: 'Remove-Item C:\\Users\\kyle\\notes',
    changes: [{ kind: 'deleted', item: 'folder', path: 'Users/kyle/notes', inside: 0 }],
    harmful: false,
  } as const;
  const action = say === undefined ? taken.action : { ...taken.action, say };
  return openGate(taken.state, action, gate);
}

describe("Otto's lines", () => {
  const start = beginAgentStep(step);

  it('introduces himself on the first step, then hands Kyle the call', () => {
    expect(ottoLine(start, task, null, true)).toBe(OTTO_INTRO);
    expect(ottoLine(start, task, null, false)).toBe(YOUR_CALL);
  });

  it('says a card back, then waits for a prediction', () => {
    expect(ottoLine(echoPlan(start, step, 'full-path'), task, null, false)).toBe(
      'Plan: Make C:\\Users\\kyle\\quillwork\\api\\notes. Go?',
    );
    const predicting = next(choosePlan(start, step, 'bare-name'));
    expect(ottoLine(predicting, task, null, false)).toBe(PREDICT_ASK);
  });

  it("says the content's line while he works, or that he's on it", () => {
    const running = choosePlan(start, step, 'full-path');
    expect(ottoLine(running, task, null, false)).toBe(ON_IT);
    expect(ottoLine(running, task, { kind: 'said', text: 'Making it.' }, false)).toBe('Making it.');
    const denied = { kind: 'denied', harmful: true, line: null } as const;
    expect(ottoLine(running, task, denied, false)).toBe(DIFFERENT_WAY);
    // A deny's own line stays up while Otto works on plan B.
    const answered = { ...denied, line: 'Good stop. That was the whole project.' };
    expect(ottoLine(running, task, answered, false)).toBe(answered.line);
  });

  it('asks at a gate, and names the effect when Kyle denies a safe line', () => {
    const gate = atTidyGate();
    expect(ottoLine(gate, task, null, false)).toBe(NEEDS_OK);
    // Words from an earlier line or a deny are about another action, never this one.
    const earlier = { kind: 'said', text: 'Good stop. That was the whole project.' } as const;
    expect(ottoLine(gate, task, earlier, false)).toBe(NEEDS_OK);
    const denied = { kind: 'denied', harmful: true, line: earlier.text } as const;
    expect(ottoLine(gate, task, denied, false)).toBe(NEEDS_OK);
    const own = 'Clearing the stray notes.';
    expect(ottoLine(atTidyGate(own), task, earlier, false)).toBe(own);
    expect(ottoLine(decideGate(gate, false), task, null, false)).toBe(
      'I need this to finish: deletes the empty folder C:\\Users\\kyle\\notes. Run it?',
    );
  });

  it('opens a fix round with why it opened', () => {
    const stopped = stopScript(choosePlan(start, step, 'full-path'));
    expect(ottoLine(stopped, task, { kind: 'stopped' }, true)).toBe(FIX_ROUND_LINES[0]);
    expect(ottoLine(stopped, task, null, false)).toBe(FIX_ROUND_LINES[0]);
    expect(ottoLine(stopped, task, { kind: 'fixing' }, false)).toBe(FIX_ROUND_LINES[1]);
    const denied = { kind: 'denied', harmful: true, line: null } as const;
    expect(ottoLine(stopped, task, denied, false)).toBe(GOOD_STOP);
    expect(ottoLine(stopped, task, { ...denied, harmful: false }, false)).toBe(FIX_ROUND_LINES[0]);
    expect(ottoLine(stopped, task, { ...denied, line: 'Good stop.' }, false)).toBe('Good stop.');
    // A line's `say` was about running it, not about why he stopped.
    expect(ottoLine(stopped, task, { kind: 'said', text: 'Making it.' }, false)).toBe(
      FIX_ROUND_LINES[0],
    );
  });

  it('claims he is done when Kyle checks', () => {
    const checking = next(next(choosePlan(start, step, 'full-path')));
    expect(checking.stage.at).toBe('check');
    expect(ottoLine(checking, task, null, false)).toBe('Done: notes is in the API.');
  });
});
