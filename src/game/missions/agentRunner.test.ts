import { describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import {
  dryRun,
  dryRunRefused,
  playAction,
  replay,
  startLog,
  withEntry,
  type SandboxLog,
} from '../agent/replay';
import { transcriptQueries, type TranscriptEntry } from '../agent/transcript';
import {
  answerCheck,
  pausesBefore,
  REFUSAL,
  answerPredict,
  backToCards,
  beginAgentStep,
  choosePlan,
  completeAgentStep,
  confirmAsked,
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
  toDriverAction,
  type AgentStepState,
  type AnswerAction,
  type Gate,
  type QueuedAction,
} from './agentRunner';
import type { AgentAction } from './agentSchema';
import { evaluate, type Predicate, type SandboxQueries } from './predicates';
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
      then: 'check',
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
const confirmGate = (harmful: boolean): Gate => ({ ...lineGate(harmful), kind: 'confirm' });

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

  it('refuses a gate of the wrong kind, or a decision with no gate open', () => {
    expect(() => openGate(tidy.state, tidy.action, confirmGate(false))).toThrow(/confirm gate/);
    expect(() => decideGate(tidy.state, true)).toThrow(/while Otto is at running/);
    expect(() => openGate(atGate, tidy.action, lineGate(false))).toThrow(MissionRunError);
  });
});

describe('Confirm questions (D7)', () => {
  const asking = take(choosePlan(notesFixRound, notesStep, 'start-over'));
  // Play drove the line and PowerShell asked, so Otto's authored answer goes next.
  const answering = confirmAsked(asking.state, asking.action);
  const answer = take(answering);

  it("queues Otto's authored answer ahead of the rest of the script", () => {
    expect(answer.action).toEqual({
      do: 'answer',
      choice: 'A',
      line: API_DELETE,
      onDeny: [{ do: 'run', line: HOME_NOTES_DELETE }],
      denyLine: 'Good stop. That was the whole project.',
      refusal: false,
    });
    expect(answer.state.stage).toMatchObject({ queue: [{ line: NOTES_LINE }] });
    expect(toDriverAction(answer.action)).toEqual({ do: 'answer', choice: 'A' });
    expect(toDriverAction(asking.action)).toEqual({ do: 'run', line: API_DELETE });
  });

  it('answers No to All before plan B when Kyle denies a harmful Yes to All', () => {
    const gated = openGate(answer.state, answer.action, confirmGate(true));
    const denied = decideGate(gated, false);
    expect(denied.gates).toEqual([true]);
    expect(denied.stage).toMatchObject({ at: 'running', then: 'check' });
    const queue = denied.stage.at === 'running' ? denied.stage.queue : [];
    expect(queue.map(toDriverAction)).toEqual([
      { do: 'answer', choice: 'L' },
      { do: 'run', line: HOME_NOTES_DELETE },
      { do: 'run', line: NOTES_LINE },
    ]);
  });

  it('answers No to All, then waits for directions, when the line has no plan B', () => {
    const plain = { do: 'run', line: 'Remove-Item x', answer: 'Y' } as const;
    const withAnswer = take(confirmAsked(tidy(), plain));
    const denied = decideGate(
      openGate(withAnswer.state, withAnswer.action, confirmGate(true)),
      false,
    );
    expect(denied.stage).toMatchObject({ at: 'running', then: 'direct' });
    const refusal = take(denied);
    // A plain No could leave Remove-Item asking about its next folder; No to All can't.
    expect(toDriverAction(refusal.action)).toEqual({ do: 'answer', choice: 'L' });
    expect(refusal.action).toMatchObject({ refusal: true, onDeny: [] });
    expect(() => openGate(refusal.state, refusal.action, confirmGate(true))).toThrow(
      /never pauses/,
    );
    expect(finishScript(refusal.state).stage).toEqual({ at: 'direct', round: 'fix' });
  });

  it('answers No to All first when Kyle stops Otto with a question open', () => {
    const stopped = stopScript(answering);
    expect(stopped.stage).toMatchObject({ at: 'running', then: 'direct' });
    expect(toDriverAction(take(stopped).action)).toEqual({ do: 'answer', choice: 'L' });
  });

  it('pauses an answer on what its dry run changes, never on its letter', () => {
    const removes = notesDelete.changes;
    expect(removes.length).toBeGreaterThan(0);
    for (const choice of ['Y', 'A', 'N', 'L'] as const) {
      expect(pausesBefore({ ...answerOf(), choice }, removes, 'destructive')).toBe(true);
      expect(pausesBefore({ ...answerOf(), choice }, [], 'destructive')).toBe(false);
    }
    const refusal = { ...answerOf(), choice: 'L', refusal: true } as const;
    expect(pausesBefore(refusal, removes, 'destructive')).toBe(false);
    expect(pausesBefore(asking.action, removes, 'destructive')).toBe(true);
  });

  it('queues the same answer again when PowerShell asks again, and needs an authored one', () => {
    const askedAgain = confirmAsked(answer.state, answer.action);
    expect(take(askedAgain).action).toBe(answer.action);
    expect(() => confirmAsked(asking.state, { do: 'run', line: 'Remove-Item x' })).toThrow(
      /authored answer/,
    );
    expect(() => confirmAsked(answer.state, { do: 'newTerminal' })).toThrow(MissionRunError);
  });

  /** Otto's queue partway through the tidy fix, with nothing asking. */
  function tidy(): AgentStepState {
    return take(choosePlan(notesFixRound, notesStep, 'tidy-and-redo')).state;
  }

  /** A dry run that removes something: the stray notes folder at home. */
  const notesDelete = dryRun(
    withEntry(notesStart, {
      kind: 'action',
      action: { do: 'run', line: 'mkdir C:\\Users\\kyle\\notes' },
    }),
    { do: 'run', line: HOME_NOTES_DELETE },
    notesTask,
    testDeps(),
  );

  function answerOf(): AnswerAction {
    if (answer.action.do !== 'answer') throw new Error('Otto should be answering.');
    return answer.action;
  }
});

/** How a scripted Kyle plays: his prediction, then each gate decision in turn. */
interface Kyle {
  readonly predict?: string;
  readonly decisions: boolean[];
}

/**
 * A headless play layer: picks a card, then plays Otto's queue through the real shell
 * the way agentPlay will. Each action is dry-run first, which grades a prediction and
 * decides whether it pauses. A line's gate weighs it with every question refused, since
 * refusing can't undo the parts that never ask. A denied action is never driven.
 */
function playThrough(
  game: { state: AgentStepState; log: SandboxLog },
  planId: string,
  kyle: Kyle,
  onStep: MissionStep = notesStep,
) {
  let { state, log } = game;
  const { shell, transcript } = replay(log, testDeps());
  state = choosePlan(state, onStep, planId);
  while (state.stage.at === 'running') {
    const next = nextAction(state);
    if (next === null) return { state: finishScript(state), log, transcript, shell };
    const { action } = next;
    state = next.state;
    const driven = toDriverAction(action);
    if (state.stage.at === 'predict') {
      const lineAlone = dryRun(log, driven, notesTask, testDeps());
      const option = state.stage.action.predict.options.find(({ id }) => id === kyle.predict);
      state = answerPredict(
        state,
        option !== undefined && outcomeHolds(option.outcome, lineAlone.step, lineAlone.queries),
      );
    }
    const dry =
      action.do === 'answer'
        ? dryRun(log, driven, notesTask, testDeps())
        : dryRunRefused(log, driven, notesTask, testDeps(), REFUSAL);
    let allowed = true;
    if (pausesBefore(action, dry.changes, 'destructive')) {
      const kind = action.do === 'answer' ? 'confirm' : 'line';
      state = openGate(state, action, {
        kind,
        line: gateLine(action),
        changes: dry.changes,
        harmful: dry.harmful,
      });
      while (state.stage.at === 'gate') {
        allowed = kyle.decisions.shift() ?? true;
        state = decideGate(state, allowed);
      }
    }
    if (!allowed) continue;
    const step = playAction(shell, transcript, driven);
    log = withEntry(log, { kind: 'action', action: driven });
    if (step.asking) state = confirmAsked(state, action);
  }
  return { state, log, transcript, shell };
}

/** The line a gate shows: the command, or for an answer, the line that asked. */
const gateLine = (action: QueuedAction) =>
  action.do === 'run' || action.do === 'answer' ? action.line : action.do;

/** What Otto typed, in order: lines and Confirm letters. */
const typed = (transcript: readonly TranscriptEntry[]) =>
  transcript.map(({ action }) =>
    action.do === 'run' ? action.line : action.do === 'answer' ? action.choice : action.do,
  );

describe('a whole step through the real shell', () => {
  const begin = { state: beginAgentStep(notesStep), log: notesStart };

  /** The weak card, then Kyle's check of its claim, then a fix round. */
  function weakCardThenFix(kyle: Kyle, optionId: string) {
    const played = playThrough(begin, 'bare-name', kyle);
    const queries = replayQueries(played.log);
    return {
      ...played,
      state: openFixRound(answerCheck(played.state, notesStep, optionId, queries)),
    };
  }

  it('denies a Yes to All that would delete the API: No to All goes first, then plan B', () => {
    const fixing = weakCardThenFix({ predict: 'home', decisions: [] }, 'home');
    expect(fixing.state.verdicts).toEqual(['caught']);

    const fixed = playThrough(fixing, 'start-over', { decisions: [false, true] });
    // The driver refuses any line while PowerShell asks, so this order is the only one that runs.
    expect(typed(fixed.transcript).slice(1)).toEqual([
      API_DELETE,
      'L',
      HOME_NOTES_DELETE,
      NOTES_LINE,
    ]);

    const queries = replayQueries(fixed.log);
    const result = answerCheck(fixed.state, notesStep, 'api', queries);
    expect(result.stage).toMatchObject({ verdict: 'confirmed', passed: true, guardBroken: false });
    expect(result.gates).toEqual([true, true]);
    expect(stars(result)).toEqual({ plan: false, safety: true, check: true });
    const run = completeAgentStep(finishBriefing(startRun(notesMission)), notesMission, queries);
    expect(run.phase).toBe('drills');
  });

  it('lets Kyle allow the harm: the guard breaks, and the stars say so', () => {
    const fixing = weakCardThenFix({ predict: 'api', decisions: [] }, 'api');
    const fixed = playThrough(fixing, 'start-over', { decisions: [true] });
    expect(typed(fixed.transcript).slice(1)).toEqual([API_DELETE, 'A', NOTES_LINE]);

    const result = answerCheck(fixed.state, notesStep, 'api', replayQueries(fixed.log));
    expect(result.stage).toMatchObject({ verdict: 'missed', passed: false, guardBroken: true });
    expect(stars(result)).toEqual({ plan: false, safety: false, check: false });
    expect(rewindStep(result).stage).toEqual({ at: 'direct', round: 'start' });
  });
});

describe('a Remove-Item of several paths through the real shell', () => {
  const API_PATH = 'C:\\Users\\kyle\\quillwork\\api';
  const OLD = ['C:\\Users\\kyle\\old1', 'C:\\Users\\kyle\\old2'] as const;
  const SWEEP_OLD = `Remove-Item ${OLD[0]}, ${OLD[1]}`;

  /** The notes step with one more fix, "sweep": this one line, which Otto answers Yes. */
  function withSweep(line: string): MissionStep {
    const agent = notesStep.agent;
    const [fix] = agent?.fixes ?? [];
    if (agent === undefined || fix === undefined) throw new Error('The notes step has a fix.');
    const answeredYes: AgentAction = { do: 'run', line, answer: 'Y', onDeny: [] };
    const sweep = { ...fix, id: 'sweep', script: [answeredYes] };
    return { ...notesStep, agent: { ...agent, fixes: [...agent.fixes, sweep] } };
  }

  const holds = (log: SandboxLog, predicate: Predicate) => evaluate(predicate, replayQueries(log));
  const apiIntact = (log: SandboxLog) => notesTask.guards.every((guard) => holds(log, guard));
  const folderLeft = (log: SandboxLog, name: string) =>
    holds(log, { kind: 'driveFolder', path: `Users/kyle/${name}` });

  it('gates a line on what it removes even when every question is refused', () => {
    const line = `Remove-Item ${API_PATH}, ${API_PATH}\\package.json`;
    const driven = { do: 'run', line } as const;
    // Alone, the line stops at the question about the API folder, before package.json.
    expect(dryRun(notesStart, driven, notesTask, testDeps()).changes).toEqual([]);
    const refused = dryRunRefused(notesStart, driven, notesTask, testDeps(), REFUSAL);
    expect(refused).toMatchObject({ harmful: true, step: { asking: true } });

    const game = { state: notesFixRound, log: notesStart };
    const denied = playThrough(game, 'sweep', { decisions: [false] }, withSweep(line));
    expect(denied.state.stage).toEqual({ at: 'direct', round: 'fix' });
    expect(denied.state.gates).toEqual([true]);
    expect(typed(denied.transcript)).toEqual([]);
    expect(apiIntact(denied.log)).toBe(true);
  });

  /** Two stray folders at home, each with a folder inside, so each one asks. */
  const twoFolders = OLD.reduce(
    (log, path) =>
      withEntry(log, { kind: 'action', action: { do: 'run', line: `mkdir ${path}\\keep` } }),
    notesStart,
  );
  const sweepOld = withSweep(SWEEP_OLD);
  const sweepGame = { state: notesFixRound, log: twoFolders };

  it('gates and answers each question in turn when PowerShell asks again', () => {
    const allowed = playThrough(sweepGame, 'sweep', { decisions: [true, true] }, sweepOld);
    expect(typed(allowed.transcript).slice(OLD.length)).toEqual([SWEEP_OLD, 'Y', 'Y']);
    expect(allowed.state.gates).toEqual([true, true]);
    expect(allowed.state.stage).toEqual({ at: 'check', planId: 'sweep' });
    expect([folderLeft(allowed.log, 'old1'), folderLeft(allowed.log, 'old2')]).toEqual([
      false,
      false,
    ]);
  });

  it('refuses with No to All, which closes every question, so the next card can run', () => {
    const denied = playThrough(sweepGame, 'sweep', { decisions: [false, false] }, sweepOld);
    expect(typed(denied.transcript).slice(OLD.length)).toEqual([SWEEP_OLD, 'L']);
    expect(denied.shell.machineShell?.asking).toBe(false);
    expect(denied.state.stage).toEqual({ at: 'direct', round: 'fix' });
    expect([folderLeft(denied.log, 'old1'), folderLeft(denied.log, 'old2')]).toEqual([true, true]);

    const next = playThrough(denied, 'full-path', { decisions: [] }, sweepOld);
    expect(next.state.stage).toEqual({ at: 'check', planId: 'full-path' });
  });

  it('refuses with No to All when Kyle stops Otto mid-question', () => {
    const { shell, transcript } = replay(twoFolders, testDeps());
    const line = take(choosePlan(notesFixRound, sweepOld, 'sweep'));
    expect(playAction(shell, transcript, toDriverAction(line.action)).asking).toBe(true);
    const refusal = take(stopScript(confirmAsked(line.state, line.action)));
    expect(playAction(shell, transcript, toDriverAction(refusal.action)).asking).toBe(false);
    expect(finishScript(refusal.state).stage).toEqual({ at: 'direct', round: 'fix' });
  });
});

function replayQueries(log: SandboxLog): SandboxQueries {
  const { shell, transcript } = replay(log, testDeps());
  return sandboxQueries(shell.ws, transcriptQueries(transcript));
}

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
