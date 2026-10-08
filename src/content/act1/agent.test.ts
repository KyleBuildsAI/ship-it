import { describe, expect, it } from 'vitest';
import type { SandboxLog } from '../../game/agent/replay';
import {
  answerCheck,
  beginAgentStep,
  offeredPlans,
  openFixRound,
  stepPasses,
  type AgentStepState,
  type Verdict,
} from '../../game/missions/agentRunner';
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
 * answer is a made-up distractor.
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
  });
});
