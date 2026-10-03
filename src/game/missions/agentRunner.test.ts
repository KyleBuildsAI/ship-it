import { describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { replay, startLog } from '../agent/replay';
import { transcriptQueries } from '../agent/transcript';
import {
  answerCheck,
  backToCards,
  beginAgentStep,
  choosePlan,
  completeAgentStep,
  echoPlan,
  finishScript,
  nextAction,
  offeredPlans,
  stepPasses,
  type AgentStepState,
} from './agentRunner';
import type { SandboxQueries } from './predicates';
import { finishBriefing, MissionRunError, startRun } from './runner';
import { sandboxQueries } from './sandbox';
import { directedMission, directedMissionInput, sampleMission } from './sample.test-mission';
import { MissionSchema, type MissionStep } from './schema';

/**
 * The sample's one directed step: get Otto's terminal into the API folder. Its weak card
 * runs `cd api` from home, which fails; its strong card uses the full path.
 */
const step = requireStep(directedMission.steps[0]);

function requireStep(found: MissionStep | undefined): MissionStep {
  if (found === undefined) throw new Error('The sample mission lost its step.');
  return found;
}

const API_LINE = 'cd C:\\Users\\kyle\\quillwork\\api';
const PACKAGE = 'C:\\Users\\kyle\\quillwork\\api\\package.json';

/** The sample laptop after Otto ran these lines: the grading's view of it. */
function laptopAfter(...lines: string[]): SandboxQueries {
  const log = startLog(
    directedMission.initialRepoState,
    lines.map((line) => ({ do: 'run', line })),
  );
  const { shell, transcript } = replay(log, testDeps());
  return sandboxQueries(shell.ws, transcriptQueries(transcript));
}

const atHome = laptopAfter();
const inTheApi = laptopAfter(API_LINE);
const apiBroken = laptopAfter(API_LINE, `Remove-Item ${PACKAGE}`);

/** Plays a card's whole script without looking at it, as play does between frames. */
function runToEnd(state: AgentStepState): { state: AgentStepState; lines: string[] } {
  const lines: string[] = [];
  let current = state;
  for (let next = nextAction(current); next !== null; next = nextAction(current)) {
    if (next.action.do === 'run') lines.push(next.action.line);
    current = next.state;
  }
  return { state: finishScript(current), lines };
}

/** Picks a card, runs it, and answers the check: one full pass through the loop. */
function playCard(
  state: AgentStepState,
  planId: string,
  optionId: string,
  queries: SandboxQueries,
): AgentStepState {
  const { state: checking } = runToEnd(choosePlan(state, step, planId));
  return answerCheck(checking, step, optionId, queries);
}

const ids = (plans: readonly { id: string }[]) => plans.map((plan) => plan.id);

describe('beginAgentStep', () => {
  it('starts at the cards with nothing tried, and refuses a typed step', () => {
    expect(beginAgentStep(step)).toEqual({
      stepId: 'stand-in-the-api',
      stage: { at: 'direct', round: 'start' },
      tried: [],
      gates: [],
      predicts: [],
      verdicts: [],
      rewound: false,
      hintRung3: false,
    });
    const typed = requireStep(sampleMission.steps[0]);
    expect(() => beginAgentStep(typed)).toThrow(MissionRunError);
  });
});

describe('picking a card', () => {
  const start = beginAgentStep(step);

  it('offers the start cards, and only for the step it began', () => {
    expect(ids(offeredPlans(start, step))).toEqual(['guess', 'full-path']);
    const other = { ...step, id: 'another-step' };
    expect(() => offeredPlans(start, other)).toThrow(/for step "stand-in-the-api"/);
  });

  it('offers the fixes and the untried start cards in a fix round', () => {
    const fixing: AgentStepState = {
      ...start,
      tried: ['guess'],
      stage: { at: 'direct', round: 'fix' },
    };
    expect(ids(offeredPlans(fixing, step))).toEqual(['fix-full-path', 'full-path']);
  });

  it('runs the picked card, and marks it tried', () => {
    const running = choosePlan(start, step, 'full-path');
    expect(running.tried).toEqual(['full-path']);
    expect(running.stage).toMatchObject({ at: 'running', planId: 'full-path' });
    expect(offeredPlans(running, step)).toEqual([]);
  });

  it('repeats a card back first, and goes back to the cards on "Pick instead"', () => {
    const echoed = echoPlan(start, step, 'guess');
    expect(echoed.stage).toEqual({ at: 'echo', round: 'start', planId: 'guess' });
    expect(ids(offeredPlans(echoed, step))).toEqual(['guess', 'full-path']);
    expect(backToCards(echoed)).toEqual(start);
    expect(choosePlan(echoed, step, 'guess').stage).toMatchObject({ at: 'running' });
    expect(() => choosePlan(echoed, step, 'full-path')).toThrow(/repeated back "guess"/);
  });

  it('refuses a card that is not on offer, or a pick while Otto works', () => {
    expect(() => choosePlan(start, step, 'fix-full-path')).toThrow(/isn't on offer/);
    expect(() => echoPlan(start, step, 'nope')).toThrow(/isn't on offer/);
    const running = choosePlan(start, step, 'guess');
    expect(() => choosePlan(running, step, 'full-path')).toThrow(/while Otto is at running/);
    expect(() => echoPlan(running, step, 'full-path')).toThrow(MissionRunError);
    expect(() => backToCards(start)).toThrow(/while Otto is at direct/);
  });
});

describe('running a script', () => {
  it("hands play each action in order, then Otto's claim goes to the check", () => {
    const running = choosePlan(beginAgentStep(step), step, 'full-path');
    const { state, lines } = runToEnd(running);
    expect(lines).toEqual([API_LINE, 'Get-Location']);
    expect(state.stage).toEqual({ at: 'check', planId: 'full-path' });
    expect(() => nextAction(state)).toThrow(/while Otto is at check/);
  });

  it("won't claim done with actions still queued", () => {
    const running = choosePlan(beginAgentStep(step), step, 'full-path');
    expect(() => finishScript(running)).toThrow(/still has actions queued/);
  });
});

describe('checking the claim (section 1.4)', () => {
  const start = beginAgentStep(step);

  it.each([
    ['confirmed', 'full-path', 'api', inTheApi, true],
    ['caught', 'guess', 'home', atHome, false],
    ['missed', 'guess', 'api', atHome, false],
    ['false-alarm', 'full-path', 'home', inTheApi, true],
  ] as const)(
    'gives %s when the card ran and Kyle picked "%s" / "%s"',
    (verdict, plan, option, q, passed) => {
      const result = playCard(start, plan, option, q);
      expect(result.stage).toEqual({
        at: 'result',
        planId: plan,
        optionId: option,
        verdict,
        passed,
        guardBroken: false,
      });
      expect(result.verdicts).toEqual([verdict]);
    },
  );

  it('fails the step when a guard broke, even with the goal reached', () => {
    expect(stepPasses(step, inTheApi)).toBe(true);
    expect(stepPasses(step, apiBroken)).toBe(false);
    const result = playCard(start, 'full-path', 'api', apiBroken);
    expect(result.stage).toMatchObject({ verdict: 'caught', passed: false, guardBroken: true });
  });

  it('refuses an option the check does not have, or a check before the claim', () => {
    const checking = runToEnd(choosePlan(start, step, 'guess')).state;
    expect(() => answerCheck(checking, step, 'nowhere', atHome)).toThrow(/no check option/);
    expect(() => answerCheck(start, step, 'api', atHome)).toThrow(/while Otto is at direct/);
  });
});

describe('completeAgentStep', () => {
  // Two steps with the same goal: once the first passes, the second is already true too.
  const [firstStep] = directedMissionInput.steps;
  if (firstStep === undefined) throw new Error('The sample mission lost its step.');
  const twoSteps = MissionSchema.parse({
    ...directedMissionInput,
    id: 'two-directed-steps',
    steps: [firstStep, { ...firstStep, id: 'stay-in-the-api' }],
  });
  const inSim = finishBriefing(startRun(twoSteps));

  it('completes exactly one step, even when the next is already true', () => {
    const next = completeAgentStep(inSim, twoSteps, inTheApi);
    expect(next.stepIndex).toBe(1);
    expect(next.phase).toBe('sim');
    expect(next.steps.map((progress) => [progress.completed, progress.attempts])).toEqual([
      [true, 1],
      [false, 0],
    ]);
    const done = completeAgentStep(next, twoSteps, inTheApi);
    expect([done.stepIndex, done.phase]).toEqual([2, 'drills']);
  });

  it("refuses a step that hasn't passed, another mission, or the wrong phase", () => {
    expect(() => completeAgentStep(inSim, twoSteps, atHome)).toThrow(/hasn't passed/);
    expect(() => completeAgentStep(inSim, twoSteps, apiBroken)).toThrow(/hasn't passed/);
    expect(() => completeAgentStep(inSim, directedMission, inTheApi)).toThrow(/This run is for/);
    expect(() => completeAgentStep(startRun(twoSteps), twoSteps, inTheApi)).toThrow(
      /during briefing/,
    );
    const pastTheEnd = { ...inSim, stepIndex: 2 };
    expect(() => completeAgentStep(pastTheEnd, twoSteps, inTheApi)).toThrow(/already done/);
  });
});
