import { describe, expect, it } from 'vitest';
import { testDeps } from '../../engine/git/testDeps';
import { snapshotMachine } from '../../engine/machine/snapshot';
import { drive } from '../../engine/shell/driver';
import { replay, type SandboxLog } from '../../game/agent/replay';
import {
  answerCheck,
  beginAgentStep,
  completeAgentStep,
  offeredPlans,
  openFixRound,
  stepPasses,
  type AgentStepState,
  type Verdict,
} from '../../game/missions/agentRunner';
import { finishBriefing, startRun } from '../../game/missions/runner';
import type { Mission, MissionStep } from '../../game/missions/schema';
import { act1Missions } from './index';
import {
  beginStep,
  canonicalStart,
  playCard,
  queriesOf,
  trueChecks,
  type CardPlayed,
  type GatePolicy,
} from './play.test-helpers';

/*
 * Mission 1.1 played card by card, the way the game plays it (docs/act1-directed.md
 * section 5.11). From each step's start, every start card is played under both gate
 * policies, then every card a fix round offers, two rounds deep. Each end state must
 * have exactly one true check option, and every option must be true somewhere, so no
 * answer is a made-up distractor. Kyle can also press Stop between any two actions, so
 * those paths are played too, and their predictions and checks must still have one answer.
 */

const mission: Mission = requireMission(act1Missions[0]);

// A function, not an if: TypeScript keeps its narrowing inside the functions below.
function requireMission(found: Mission | undefined): Mission {
  if (found === undefined) throw new Error('Act 1 has no mission');
  return found;
}

const POLICIES: readonly GatePolicy[] = ['allow-all', 'deny-harmful'];

/** One card's result: the step passed or not, and the check option that is true. */
interface Expected {
  readonly passed: boolean;
  readonly check: string;
}

/** What each start card does from the step's start, as the spec describes. */
const START_RESULTS: Readonly<Record<string, Readonly<Record<string, Expected>>>> = {
  'stand-in-the-api': {
    guess: { passed: false, check: 'home' },
    'step-by-step': { passed: true, check: 'api' },
    'full-path': { passed: true, check: 'api' },
  },
  'notes-in-the-api': {
    'bare-name': { passed: false, check: 'home' },
    'full-path': { passed: true, check: 'api' },
    'go-then-make': { passed: true, check: 'api' },
  },
  'web-notes': {
    'by-name': { passed: false, check: 'inside' },
    'one-up': { passed: true, check: 'next-door' },
    full: { passed: true, check: 'next-door' },
  },
  'two-terminals': {
    'open-one': { passed: false, check: 'api-and-home' },
    'move-here': { passed: false, check: 'moved' },
    'open-and-go': { passed: true, check: 'api-and-web' },
  },
};

/** What a fix does after a start card failed: `<start card> > <fix card>`. */
const FIX_RESULTS: Readonly<Record<string, Readonly<Record<string, Expected>>>> = {
  'stand-in-the-api': { 'guess > fix-full-path': { passed: true, check: 'api' } },
  'notes-in-the-api': {
    'bare-name > tidy-and-redo': { passed: true, check: 'api' },
    'bare-name > just-redo': { passed: false, check: 'both' },
  },
  'web-notes': {
    'by-name > tidy-web': { passed: true, check: 'next-door' },
    'by-name > one-up': { passed: false, check: 'both' },
  },
  'two-terminals': {
    'open-one > go-in-new': { passed: true, check: 'api-and-web' },
    'open-one > back-and-open': { passed: true, check: 'api-and-web' },
    'move-here > back-and-open': { passed: true, check: 'api-and-web' },
    'move-here > go-in-new': { passed: false, check: 'moved' },
  },
};

/**
 * Every line that pauses for approval, and whether a dry run finds it harmful. Pinned, so
 * a guard or a setup that drifts changes the answer Kyle is graded on and fails here.
 */
const GATES: Readonly<Record<string, boolean>> = {
  'notes-in-the-api > Remove-Item C:\\Users\\kyle\\notes': false,
  'web-notes > Remove-Item web -Recurse': false,
};

/** Text a line prints when the engine can't run it yet: never acceptable in content. */
const UNSUPPORTED = /doesn't run .* yet|expressions yet|not recognized/i;

function taskOf(step: MissionStep) {
  if (step.agent === undefined) throw new Error(`Step "${step.id}" is not directed.`);
  return step.agent;
}

/** One way through a step: the cards picked in order, and where they left things. */
interface Path {
  readonly cards: readonly string[];
  readonly policy: GatePolicy;
  readonly played: CardPlayed;
}

const passes = (step: MissionStep, log: SandboxLog) => stepPasses(step, queriesOf(log));

/** Every path through a step, from its start: start cards, then fixes two rounds deep. */
function explore(step: MissionStep, start: SandboxLog): Path[] {
  const paths: Path[] = [];
  const walk = (
    cards: readonly string[],
    from: { log: SandboxLog; state: AgentStepState },
    policy: GatePolicy,
  ) => {
    for (const plan of offeredPlans(from.state, step)) {
      const played = playCard(mission, step, from, plan.id, policy);
      const path = { cards: [...cards, plan.id], policy, played };
      paths.push(path);
      if (cards.length >= 2 || played.state.stage.at !== 'check') continue;
      if (passes(step, played.log)) continue;
      const checked = answerCheck(
        played.state,
        step,
        trueOf(step, played.log),
        queriesOf(played.log),
      );
      walk(path.cards, { log: played.log, state: openFixRound(checked) }, policy);
    }
  };
  for (const policy of POLICIES) walk([], { log: start, state: beginAgentStep(step) }, policy);
  return paths;
}

/**
 * Every way Kyle can press Stop: after each action of each card the first two rounds
 * offer, then every card the fix round offers next. Those cards run on a laptop another
 * card only partly changed, so their predictions and checks must still have one answer.
 */
function exploreStops(step: MissionStep, start: SandboxLog, paths: readonly Path[]): Path[] {
  const stops: Path[] = [];
  const from = (path: Path | null) =>
    path === null
      ? { log: start, state: beginAgentStep(step) }
      : {
          log: path.played.log,
          state: openFixRound(
            answerCheck(
              path.played.state,
              step,
              trueOf(step, path.played.log),
              queriesOf(path.played.log),
            ),
          ),
        };
  for (const policy of POLICIES) {
    const roots = paths.filter(
      (path) =>
        path.policy === policy &&
        path.cards.length === 1 &&
        path.played.state.stage.at === 'check' &&
        !passes(step, path.played.log),
    );
    for (const root of [null, ...roots]) {
      const begin = from(root);
      for (const plan of offeredPlans(begin.state, step)) {
        const whole = playCard(mission, step, begin, plan.id, policy);
        for (let stopAt = 0; stopAt < whole.driven; stopAt++) {
          const stopped = playCard(mission, step, begin, plan.id, policy, stopAt);
          const cards = [...(root?.cards ?? []), `${plan.id} (Stop after ${String(stopAt)})`];
          stops.push({ cards, policy, played: stopped });
          for (const next of offeredPlans(stopped.state, step)) {
            const played = playCard(mission, step, stopped, next.id, policy);
            stops.push({ cards: [...cards, next.id], policy, played });
          }
        }
      }
    }
  }
  return stops;
}

function trueOf(step: MissionStep, log: SandboxLog): string {
  const [only] = trueChecks(step, log);
  if (only === undefined) throw new Error(`No check option is true for "${step.id}".`);
  return only;
}

function verdictOf(path: Path, step: MissionStep): Verdict | null {
  const { state, log } = path.played;
  if (state.stage.at !== 'check') return null;
  const answered = answerCheck(state, step, trueOf(step, log), queriesOf(log));
  return answered.stage.at === 'result' ? answered.stage.verdict : null;
}

mission.steps.forEach((step, index) => {
  describe(`step ${String(index + 1)}, ${step.id}`, () => {
    const task = taskOf(step);
    const start = beginStep(canonicalStart(mission, index), step);
    const paths = explore(step, start);
    const checked = paths.filter((path) => path.played.state.stage.at === 'check');
    const stops = exploreStops(step, start, paths);

    it('is not already passing when Kyle arrives', () => {
      expect(passes(step, start)).toBe(false);
    });

    it('takes every start card to the result the spec describes', () => {
      const expected = START_RESULTS[step.id] ?? {};
      expect(Object.keys(expected).sort()).toEqual(task.plans.map((plan) => plan.id).sort());
      for (const path of checked.filter(({ cards }) => cards.length === 1)) {
        const [card = ''] = path.cards;
        const want = expected[card];
        expect(passes(step, path.played.log), card).toBe(want?.passed);
        expect(trueChecks(step, path.played.log), card).toEqual([want?.check]);
        // Kyle answers what is true: a Good catch when Otto's work failed, else Confirmed.
        expect(verdictOf(path, step), card).toBe(want?.passed ? 'confirmed' : 'caught');
      }
    });

    it('fixes the failed cards the way the spec describes', () => {
      for (const [route, want] of Object.entries(FIX_RESULTS[step.id] ?? {})) {
        const path = checked.find((found) => found.cards.join(' > ') === route);
        if (path === undefined) throw new Error(`No path ${route}`);
        expect(passes(step, path.played.log), route).toBe(want.passed);
        expect(trueChecks(step, path.played.log), route).toEqual([want.check]);
      }
    });

    it('has a start card that passes, and a card with a slip', () => {
      expect(task.plans.some((plan) => START_RESULTS[step.id]?.[plan.id]?.passed)).toBe(true);
      expect([...task.plans, ...task.fixes].some((plan) => plan.slip !== undefined)).toBe(true);
    });

    it('has exactly one true check option at every end, and each option is true somewhere', () => {
      const seen = new Set<string>();
      for (const path of checked) {
        const truths = trueChecks(step, path.played.log);
        expect(truths, path.cards.join(' > ')).toHaveLength(1);
        truths.forEach((id) => seen.add(id));
      }
      expect([...seen].sort()).toEqual(task.check.options.map((option) => option.id).sort());
    });

    it('has exactly one true check option after every Stop', () => {
      for (const path of stops.filter(({ played }) => played.state.stage.at === 'check')) {
        expect(trueChecks(step, path.played.log), path.cards.join(' > ')).toHaveLength(1);
      }
    });

    it('runs every line the first two rounds, failing only where the content says', () => {
      for (const path of paths.filter(({ cards }) => cards.length <= 2)) {
        for (const ran of path.played.lines) {
          const where = `${path.cards.join(' > ')}: ${ran.line}\n${ran.output}`;
          expect(ran.output, where).not.toMatch(UNSUPPORTED);
          expect(ran.exitCode !== 0, where).toBe(ran.fails);
        }
      }
    });

    it('has a passing card for every end that misses', () => {
      for (const path of checked.filter(({ cards }) => cards.length === 1)) {
        if (passes(step, path.played.log)) continue;
        const fixed = checked.some(
          (other) =>
            other.cards.length === 2 &&
            other.cards[0] === path.cards[0] &&
            passes(step, other.played.log),
        );
        expect(fixed, path.cards.join(' > ')).toBe(true);
      }
    });

    it('pauses only where the pinned table says, with the harm it pins', () => {
      const seen = new Set<string>();
      for (const path of paths) {
        for (const gate of path.played.gates) {
          const key = `${step.id} > ${gate.line}`;
          expect(GATES[key], gate.line).toBe(gate.harmful);
          seen.add(key);
        }
      }
      const pinned = Object.keys(GATES).filter((key) => key.startsWith(`${step.id} > `));
      expect([...seen].sort()).toEqual(pinned.sort());
    });

    it('gives every prediction exactly one true outcome', () => {
      const predicting = task.plans.filter((plan) =>
        plan.script.some((action) => 'predict' in action && action.predict !== undefined),
      );
      for (const plan of predicting) {
        const path = paths.find(({ cards }) => cards.join() === plan.id);
        expect(path?.played.predicts.length, plan.id).toBeGreaterThan(0);
      }
      for (const path of [...paths, ...stops]) {
        for (const predicted of path.played.predicts) {
          expect(predicted.trueOptions, path.cards.join(' > ')).toHaveLength(1);
        }
      }
    });

    it('has looks that only look: no events, and the laptop unchanged', () => {
      for (const path of checked) {
        for (const look of task.looks) {
          const { shell } = replay(path.played.log, testDeps());
          const machine = shell.ws.machine;
          if (machine === null) throw new Error('Act 1 plays on a laptop.');
          const before = snapshotMachine(machine);
          const looked = drive(shell, { do: 'run', line: look.line });
          expect(looked.events, look.line).toEqual([]);
          expect(snapshotMachine(machine), look.line).toEqual(before);
        }
      }
    });
  });
});

describe('the reference path', () => {
  it('completes the mission one step at a time, in order', () => {
    let run = finishBriefing(startRun(mission));
    let log = canonicalStart(mission, 0);
    for (const step of mission.steps) {
      log = beginStep(log, step);
      const played = playCard(
        mission,
        step,
        { log, state: beginAgentStep(step) },
        taskOf(step).hintPlan,
        'allow-all',
      );
      log = played.log;
      const result = answerCheck(played.state, step, trueOf(step, log), queriesOf(log));
      expect(result.stage).toMatchObject({ at: 'result', verdict: 'confirmed', passed: true });
      run = completeAgentStep(run, mission, queriesOf(log));
    }
    expect(run.phase).toBe('drills');
    expect(run.steps.every((progress) => progress.completed)).toBe(true);
  });
});
