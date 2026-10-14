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
import { answerKey, gradeJudgment, type JudgmentAnswer } from '../../game/missions/judgment';
import { finishBriefing, startRun } from '../../game/missions/runner';
import {
  isJudgmentDrill,
  type JudgmentDrill,
  type Mission,
  type MissionStep,
} from '../../game/missions/schema';
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
 * A directed mission played card by card, the way the game plays it (docs/act1-directed.md
 * section 5.11). From each step's start, every start card is played under both gate
 * policies, then every card a fix round offers, two rounds deep. Each end state must
 * have exactly one true check option, and every option must be true somewhere, so no
 * answer is a made-up distractor. Kyle can also press Stop between any two actions, so
 * those paths are played too, and their predictions and checks must still have one answer.
 *
 * Each mission's test file passes its own tables: what the spec says each card does.
 */

const POLICIES: readonly GatePolicy[] = ['allow-all', 'deny-harmful'];

/** One card's result: the step passed or not, and the check option that is true. */
export interface Expected {
  readonly passed: boolean;
  readonly check: string;
}

/**
 * Where a start card ends: at the check, or back with Kyle for new directions, which is
 * where denying a harmful line with no plan B leaves Otto.
 */
export type Ending = Expected | 'direct';

/** A card that ends the same way under both gate policies, or one ending per policy. */
export type CardResult = Ending | Readonly<Record<GatePolicy, Ending>>;

export interface DirectedSpec {
  /** What each start card does from the step's start: `step > card`. */
  readonly start: Readonly<Record<string, Readonly<Record<string, CardResult>>>>;
  /**
   * What a fix does after a start card failed: `step > '<start card> > <fix card>'`. A fix
   * whose line fails unplanned ends at 'direct': Otto stops instead of claiming success.
   */
  readonly fixes: Readonly<Record<string, Readonly<Record<string, Ending>>>>;
  /**
   * Start cards that, allowed, leave a step no fix can pass: only Rewind can help (D8).
   * `step > card`. Every other allowed start card that misses must have a passing fix,
   * and these must have none, so the docs' "only Rewind can help" stays true.
   */
  readonly rewindOnly?: readonly string[];
  /**
   * Every line that pauses for approval in the first two rounds, and whether a dry run
   * finds it harmful: `<step> > <cards played> > <line>`. Pinned, so a guard or a setup
   * that drifts changes the answer Kyle is graded on and fails here. The cards are part
   * of the key because one line can be safe or harmful depending on what ran before it:
   * a lossy edit is harmful with no backup and safe beside one.
   */
  readonly gates: Readonly<Record<string, boolean>>;
}

/** Text a line prints when the engine can't run it yet: never acceptable in content. */
const UNSUPPORTED = /doesn't run .* yet|expressions yet|not recognized/i;

function taskOf(step: MissionStep) {
  if (step.agent === undefined) throw new Error(`Step "${step.id}" is not directed.`);
  return step.agent;
}

function endingFor(result: CardResult | undefined, policy: GatePolicy): Ending | undefined {
  if (result === undefined || result === 'direct' || 'passed' in result) return result;
  return result[policy];
}

/** One way through a step: the cards picked in order, and where they left things. */
interface Path {
  readonly cards: readonly string[];
  readonly policy: GatePolicy;
  readonly played: CardPlayed;
  /**
   * Kyle allowed a line the dry run called harmful, here or on an earlier card. Rewind is
   * offered first (D8), and lines Otto runs afterwards may fail because what they touch is
   * gone. Some wrecks a fix can still mend, like a lossy edit beside a backup; the spec's
   * `rewindOnly` pins the ones no card can.
   */
  readonly wrecked: boolean;
}

const passes = (step: MissionStep, log: SandboxLog) => stepPasses(step, queriesOf(log));

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

/** The fix round Kyle meets after answering a failed check truthfully. */
function fixRoundAfter(step: MissionStep, played: CardPlayed) {
  const checked = answerCheck(played.state, step, trueOf(step, played.log), queriesOf(played.log));
  return { log: played.log, state: openFixRound(checked) };
}

export function describeDirectedMission(mission: Mission, spec: DirectedSpec): void {
  /** Every path through a step, from its start: start cards, then fixes two rounds deep. */
  function explore(step: MissionStep, start: SandboxLog): Path[] {
    const paths: Path[] = [];
    const walk = (
      before: Path | null,
      from: { log: SandboxLog; state: AgentStepState },
      policy: GatePolicy,
    ) => {
      const cards = before?.cards ?? [];
      for (const plan of offeredPlans(from.state, step)) {
        const played = playCard(mission, step, from, plan.id, policy);
        const wrecked =
          (before?.wrecked ?? false) ||
          (policy === 'allow-all' && played.gates.some((gate) => gate.harmful));
        const path = { cards: [...cards, plan.id], policy, played, wrecked };
        paths.push(path);
        if (cards.length >= 2 || played.state.stage.at !== 'check') continue;
        if (passes(step, played.log)) continue;
        walk(path, fixRoundAfter(step, played), policy);
      }
    };
    for (const policy of POLICIES) walk(null, { log: start, state: beginAgentStep(step) }, policy);
    return paths;
  }

  /**
   * Every way Kyle can press Stop: after each action of each card the first two rounds
   * offer, then every card the fix round offers next. Those cards run on a laptop another
   * card only partly changed, so their predictions and checks must still have one answer.
   */
  function exploreStops(step: MissionStep, start: SandboxLog, paths: readonly Path[]): Path[] {
    const stops: Path[] = [];
    for (const policy of POLICIES) {
      const roots = paths.filter(
        (path) =>
          path.policy === policy &&
          path.cards.length === 1 &&
          path.played.state.stage.at === 'check' &&
          !passes(step, path.played.log),
      );
      for (const root of [null, ...roots]) {
        const begin =
          root === null
            ? { log: start, state: beginAgentStep(step) }
            : fixRoundAfter(step, root.played);
        for (const plan of offeredPlans(begin.state, step)) {
          const whole = playCard(mission, step, begin, plan.id, policy);
          for (let stopAt = 0; stopAt < whole.driven; stopAt++) {
            const stopped = playCard(mission, step, begin, plan.id, policy, stopAt);
            const cards = [...(root?.cards ?? []), `${plan.id} (Stop after ${String(stopAt)})`];
            const wrecked = root?.wrecked ?? false;
            stops.push({ cards, policy, played: stopped, wrecked });
            for (const next of offeredPlans(stopped.state, step)) {
              const played = playCard(mission, step, stopped, next.id, policy);
              stops.push({ cards: [...cards, next.id], policy, played, wrecked });
            }
          }
        }
      }
    }
    return stops;
  }

  mission.steps.forEach((step, index) => {
    describe(`${mission.id}, step ${String(index + 1)}, ${step.id}`, () => {
      const task = taskOf(step);
      const start = beginStep(canonicalStart(mission, index), step);
      const paths = explore(step, start);
      const checked = paths.filter((path) => path.played.state.stage.at === 'check');
      const stops = exploreStops(step, start, paths);
      const expected = spec.start[step.id] ?? {};

      it('is not already passing when Kyle arrives', () => {
        expect(passes(step, start)).toBe(false);
      });

      it('takes every start card to the result the spec describes', () => {
        expect(Object.keys(expected).sort()).toEqual(task.plans.map((plan) => plan.id).sort());
        for (const path of paths.filter(({ cards }) => cards.length === 1)) {
          const [card = ''] = path.cards;
          const where = `${card} (${path.policy})`;
          const want = endingFor(expected[card], path.policy);
          if (want === 'direct') {
            expect(path.played.state.stage.at, where).toBe('direct');
            continue;
          }
          expect(path.played.state.stage.at, where).toBe('check');
          expect(passes(step, path.played.log), where).toBe(want?.passed);
          expect(trueChecks(step, path.played.log), where).toEqual([want?.check]);
          // Kyle answers what is true: a Good catch when Otto's work failed, else Confirmed.
          expect(verdictOf(path, step), where).toBe(want?.passed ? 'confirmed' : 'caught');
        }
      });

      it('fixes the failed cards the way the spec describes', () => {
        for (const [route, want] of Object.entries(spec.fixes[step.id] ?? {})) {
          const found = paths.filter((path) => path.cards.join(' > ') === route);
          if (found.length === 0) throw new Error(`No path ${route}`);
          for (const path of found) {
            if (want === 'direct') {
              expect(path.played.state.stage.at, route).toBe('direct');
              continue;
            }
            expect(path.played.state.stage.at, route).toBe('check');
            expect(passes(step, path.played.log), route).toBe(want.passed);
            expect(trueChecks(step, path.played.log), route).toEqual([want.check]);
          }
        }
      });

      it('has a start card that passes, and a card with a slip', () => {
        const passing = task.plans.some((plan) =>
          POLICIES.some((policy) => {
            const ending = endingFor(expected[plan.id], policy);
            return ending !== undefined && ending !== 'direct' && ending.passed;
          }),
        );
        expect(passing).toBe(true);
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
        const byCards = new Map(
          paths.map((path) => [`${path.policy}: ${path.cards.join()}`, path]),
        );
        for (const path of paths.filter(({ cards }) => cards.length <= 2)) {
          const before = byCards.get(`${path.policy}: ${path.cards.slice(0, -1).join()}`);
          // On a wrecked laptop, a card's lines can fail because their folder is gone.
          const strict = before?.wrecked !== true;
          for (const ran of path.played.lines) {
            const where = `${path.cards.join(' > ')}: ${ran.line}\n${ran.output}`;
            expect(ran.output, where).not.toMatch(UNSUPPORTED);
            if (strict) expect(ran.exitCode !== 0, where).toBe(ran.fails);
          }
        }
      });

      it('has a passing fix for every end that misses, except where only Rewind can help', () => {
        const rewindOnly = (spec.rewindOnly ?? [])
          .filter((key) => key.startsWith(`${step.id} > `))
          .map((key) => key.slice(step.id.length + 3));
        for (const path of checked.filter(({ cards }) => cards.length === 1)) {
          if (passes(step, path.played.log)) continue;
          const [card = ''] = path.cards;
          const fixed = checked.some(
            (other) =>
              other.policy === path.policy &&
              other.cards.length === 2 &&
              other.cards[0] === card &&
              passes(step, other.played.log),
          );
          // Only an allowed harmful line can leave a step past mending.
          const hopeless = path.wrecked && rewindOnly.includes(card);
          expect(fixed, `${card} (${path.policy})`).toBe(!hopeless);
        }
        for (const card of rewindOnly) {
          const wrecked = checked.some((path) => path.wrecked && path.cards.join() === card);
          expect(wrecked, `${card} is pinned as only Rewind can help`).toBe(true);
        }
      });

      it('pauses only where the pinned table says, with the harm it pins', () => {
        const seen: Record<string, boolean> = {};
        for (const path of paths.filter(({ cards }) => cards.length <= 2)) {
          for (const gate of path.played.gates) {
            const key = `${step.id} > ${path.cards.join(' > ')} > ${gate.line}`;
            // Both policies reach a gate the same way, so they must agree on its harm.
            if (key in seen) expect(gate.harmful, key).toBe(seen[key]);
            seen[key] = gate.harmful;
          }
        }
        const pinned = Object.entries(spec.gates).filter(([key]) =>
          key.startsWith(`${step.id} > `),
        );
        // One comparison, so a drift shows every gate that changed at once.
        expect(seen).toEqual(Object.fromEntries(pinned));
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

  describe(`${mission.id}, the reference path`, () => {
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
}

/** Every right answer to a drill, and one wrong one that the grader must miss. */
export type DrillKeys = Readonly<
  Record<string, { readonly key: readonly string[]; readonly wrong: string }>
>;

function answerFor(drill: JudgmentDrill, id: string): JudgmentAnswer {
  return drill.kind === 'approve'
    ? { kind: 'approve', allow: id === 'allow' }
    : { kind: 'pick', optionId: id };
}

/**
 * A mission's judgment drills. No drill says which answer is right: the grader works the
 * key out by running the drill. This pins the key each author meant, so a drill whose
 * engine behaviour drifts fails here instead of quietly grading Kyle wrong.
 */
export function describeJudgmentDrills(mission: Mission, keys: DrillKeys): void {
  const drills: readonly JudgmentDrill[] = mission.drills.filter(isJudgmentDrill);

  describe(`${mission.id}'s judgment drills`, () => {
    it('pins a key for every drill', () => {
      expect(drills.map((drill) => drill.id).sort()).toEqual(Object.keys(keys).sort());
    });

    it('has at least one approve drill to allow and one to deny', () => {
      const approves = drills.filter((drill) => drill.kind === 'approve');
      const answers = approves.map((drill) => answerKey(drill, testDeps())[0]);
      expect(answers).toContain('allow');
      expect(answers).toContain('deny');
    });

    for (const drill of drills) {
      const pinned = keys[drill.id];
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
}
