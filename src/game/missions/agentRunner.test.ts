import { describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { dryRun, replay, startLog, withEntry } from '../agent/replay';
import { transcriptQueries } from '../agent/transcript';
import {
  answerCheck,
  answerPredict,
  backToCards,
  beginAgentStep,
  choosePlan,
  completeAgentStep,
  decideGate,
  echoPlan,
  finishScript,
  markHintRung3,
  nextAction,
  offeredPlans,
  openFixRound,
  openGate,
  outcomeHolds,
  rewindStep,
  starXp,
  stars,
  stepPasses,
  stopScript,
  type AgentStepState,
  type Gate,
  type QueuedAction,
} from './agentRunner';
import type { SandboxQueries } from './predicates';
import { finishBriefing, MissionRunError, startRun } from './runner';
import { sandboxQueries } from './sandbox';
import {
  directedMission,
  directedMissionInput,
  notesMission,
  sampleMission,
} from './sample.test-mission';
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

  it('keeps a fix on offer after it was tried, and drops only tried start cards', () => {
    const fixTried: AgentStepState = {
      ...start,
      tried: ['guess', 'fix-full-path'],
      stage: { at: 'direct', round: 'fix' },
    };
    expect(ids(offeredPlans(fixTried, step))).toEqual(['fix-full-path', 'full-path']);
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

  it('stops between lines: back to the cards in a fix round, the card spent', () => {
    const started = choosePlan(beginAgentStep(step), step, 'full-path');
    const next = nextAction(started);
    if (next === null) throw new Error('The strong card has lines.');
    const stopped = stopScript(next.state);
    expect(stopped.stage).toEqual({ at: 'direct', round: 'fix' });
    expect(ids(offeredPlans(stopped, step))).toEqual(['fix-full-path', 'guess']);
    expect(() => stopScript(stopped)).toThrow(MissionRunError);
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

describe('fix rounds and rewind', () => {
  const missed = playCard(beginAgentStep(step), 'guess', 'api', atHome);

  it('opens a fix round after a failed check, with the fixes and the untried cards', () => {
    const fixing = openFixRound(missed);
    expect(fixing.stage).toEqual({ at: 'direct', round: 'fix' });
    expect(ids(offeredPlans(fixing, step))).toEqual(['fix-full-path', 'full-path']);
    expect(() => choosePlan(fixing, step, 'guess')).toThrow(/isn't on offer/);
    const fixed = playCard(fixing, 'fix-full-path', 'api', inTheApi);
    expect(fixed.verdicts).toEqual(['missed', 'confirmed']);
    expect(fixed.tried).toEqual(['guess', 'fix-full-path']);
  });

  it('has nothing to fix or rewind once the step passed', () => {
    const passed = playCard(beginAgentStep(step), 'full-path', 'api', inTheApi);
    expect(() => openFixRound(passed)).toThrow(/nothing to fix/);
    expect(() => rewindStep(passed)).toThrow(/nothing to rewind/);
    expect(() => openFixRound(beginAgentStep(step))).toThrow(MissionRunError);
  });

  it('rewinds to the start cards and remembers it did', () => {
    const rewound = rewindStep(missed);
    expect(rewound.stage).toEqual({ at: 'direct', round: 'start' });
    expect(rewound.rewound).toBe(true);
    expect(ids(offeredPlans(rewound, step))).toEqual(['guess', 'full-path']);
  });

  it('costs nothing to rewind before any card was picked, since nothing has run', () => {
    const start = beginAgentStep(step);
    expect(rewindStep(start)).toEqual(start);
    expect(rewindStep(echoPlan(start, step, 'guess'))).toEqual(start);
    const perfect = playCard(rewindStep(start), 'full-path', 'api', inTheApi);
    expect(stars(perfect).plan).toBe(true);
  });
});

/**
 * The notes step: its weak card runs `mkdir notes` with a prediction, in a terminal the
 * step's `before` just restarted at home.
 */
const notesStep = requireStep(notesMission.steps[0]);
const notesTask = notesStep.agent ?? { before: [], guards: [] };
const notesStart = withEntry(startLog(notesMission.initialRepoState), {
  kind: 'steps',
  steps: notesTask.before,
});
const tryLine = (line: string) => dryRun(notesStart, { do: 'run', line }, notesTask, testDeps());

describe('predictions', () => {
  const picked = choosePlan(beginAgentStep(notesStep), notesStep, 'bare-name');

  it('stops a predicted line at the prompt, then carries on once Kyle has guessed', () => {
    const next = nextAction(picked);
    expect(next?.action).toMatchObject({ do: 'run', line: 'mkdir notes' });
    const waiting = next?.state ?? picked;
    expect(waiting.stage).toMatchObject({ at: 'predict', planId: 'bare-name', queue: [] });
    expect(() => nextAction(waiting)).toThrow(/while Otto is at predict/);

    const guessed = answerPredict(waiting, false);
    expect(guessed.predicts).toEqual([false]);
    expect(guessed.stage).toEqual({
      at: 'running',
      planId: 'bare-name',
      queue: [],
    });
    expect(nextAction(guessed)).toBeNull();
    expect(() => answerPredict(guessed, true)).toThrow(MissionRunError);
  });

  it('grades each option by what the line really does, never by a flag', () => {
    const next = nextAction(picked);
    if (next?.state.stage.at !== 'predict') throw new Error('The weak card predicts.');
    const { action } = next.state.stage;
    const dry = tryLine(action.line);
    const held = action.predict.options
      .filter((option) => outcomeHolds(option.outcome, dry.step, dry.queries))
      .map((option) => option.id);
    expect(held).toEqual(['home']);
  });

  it('reads the exit code and the printed text, ignoring case', () => {
    const failed = tryLine('cd api');
    const { queries } = failed;
    expect(outcomeHolds({ result: 'error' }, failed.step, queries)).toBe(true);
    expect(outcomeHolds({ result: 'ok' }, failed.step, queries)).toBe(false);
    expect(outcomeHolds({ printed: 'CANNOT FIND PATH' }, failed.step, queries)).toBe(true);
    expect(outcomeHolds({ printed: 'Directory:' }, failed.step, queries)).toBe(false);
    const made = tryLine('mkdir notes');
    expect(outcomeHolds({ result: 'ok', printed: 'directory: c:' }, made.step, queries)).toBe(true);
  });
});

const API_DELETE = 'Remove-Item C:\\Users\\kyle\\quillwork\\api';
const HOME_NOTES_DELETE = 'Remove-Item C:\\Users\\kyle\\notes';
const NOTES_LINE = 'mkdir C:\\Users\\kyle\\quillwork\\api\\notes';

/** The notes step in a fix round, after its weak card was tried. */
const notesFixRound: AgentStepState = {
  ...beginAgentStep(notesStep),
  tried: ['bare-name'],
  stage: { at: 'direct', round: 'fix' },
};

/** Takes Otto's next action, failing the test if his queue is empty. */
function take(state: AgentStepState): { action: QueuedAction; state: AgentStepState } {
  const next = nextAction(state);
  if (next === null) throw new Error('Otto had nothing queued.');
  return next;
}

const lineGate = (harmful: boolean): Gate => ({ kind: 'line', line: 'x', changes: [], harmful });

describe('gates', () => {
  const tidy = take(choosePlan(notesFixRound, notesStep, 'tidy-and-redo'));
  const atGate = openGate(tidy.state, tidy.action, lineGate(false));

  it('pauses before the line, and carries on with the script when allowed', () => {
    expect(atGate.stage).toMatchObject({ at: 'gate', again: false, action: tidy.action });
    const allowed = decideGate(atGate, true);
    expect(allowed.gates).toEqual([true]);
    expect(allowed.stage).toMatchObject({ at: 'running', queue: [{ line: NOTES_LINE }] });
  });

  it('asks again when Kyle denies a safe line, then stops for new directions', () => {
    const askedAgain = decideGate(atGate, false);
    expect(askedAgain.stage).toMatchObject({ at: 'gate', again: true });
    expect(decideGate(askedAgain, true).gates).toEqual([false, true]);
    const stopped = decideGate(askedAgain, false);
    expect(stopped.gates).toEqual([false, false]);
    expect(stopped.stage).toEqual({ at: 'direct', round: 'fix' });
  });

  it("runs a denied line's plan B instead, then the rest of the script", () => {
    const harmful = take(choosePlan(notesFixRound, notesStep, 'start-over'));
    expect(harmful.action).toMatchObject({ line: API_DELETE });
    const denied = decideGate(openGate(harmful.state, harmful.action, lineGate(true)), false);
    expect(denied.gates).toEqual([true]);
    const queue = denied.stage.at === 'running' ? denied.stage.queue : [];
    expect(queue.map((action) => (action.do === 'run' ? action.line : action.do))).toEqual([
      HOME_NOTES_DELETE,
      NOTES_LINE,
    ]);
    // Plan B has no plan B of its own: denying its harmful line stops Otto.
    const planB = take(denied);
    const stopped = decideGate(openGate(planB.state, planB.action, lineGate(true)), false);
    expect(stopped.stage).toEqual({ at: 'direct', round: 'fix' });
  });

  it('refuses a decision with no gate open', () => {
    expect(() => decideGate(tidy.state, true)).toThrow(/while Otto is at running/);
    expect(() => openGate(atGate, tidy.action, lineGate(false))).toThrow(MissionRunError);
  });
});

describe('stars', () => {
  const start = beginAgentStep(step);
  const perfect = playCard(start, 'full-path', 'api', inTheApi);

  it('gives all three for a strong first card, confirmed, with nothing to approve', () => {
    expect(stars(perfect)).toEqual({ plan: true, safety: true, check: true });
    expect(starXp(stars(perfect))).toBe(6);
  });

  it('takes the Plan star for a fix, a rewind, or the hint that names the card', () => {
    const missed = playCard(start, 'guess', 'home', atHome);
    const fixed = playCard(openFixRound(missed), 'fix-full-path', 'api', inTheApi);
    expect(stars(fixed)).toEqual({ plan: false, safety: true, check: true });

    const afterRewind = playCard(rewindStep(missed), 'full-path', 'api', inTheApi);
    expect(stars(afterRewind).plan).toBe(false);

    const hinted = playCard(markHintRung3(start), 'full-path', 'api', inTheApi);
    expect(stars(hinted)).toEqual({ plan: false, safety: true, check: true });
    expect(starXp(stars(hinted))).toBe(4);
  });

  it('takes the Check star for a miss or a false alarm, and gives no Plan star mid-step', () => {
    const falseAlarm = playCard(start, 'full-path', 'home', inTheApi);
    expect(stars(falseAlarm)).toEqual({ plan: true, safety: true, check: false });
    expect(stars(playCard(start, 'guess', 'api', atHome)).check).toBe(false);
    expect(stars(start).plan).toBe(false);
  });

  it('takes the Safety star for a wrong gate, and Check for a wrong prediction', () => {
    expect(stars({ ...perfect, gates: [true, false] }).safety).toBe(false);
    expect(stars({ ...perfect, predicts: [false] }).check).toBe(false);
    expect(starXp({ plan: false, safety: false, check: false })).toBe(0);
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
