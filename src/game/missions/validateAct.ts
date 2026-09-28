import type { FixtureStep } from '../../engine/git/fixtures';
import {
  FIX_ROUND_LINES,
  hintPlanProblem,
  OTTO_LINE_WORDS,
  type AgentAction,
  type AgentTask,
} from './agentSchema';
import { isMachinePredicate } from './machinePredicates';
import type { Predicate } from './predicates';
import {
  countWords,
  directedProblems,
  isJudgmentDrill,
  MAX_SCREEN_WORDS,
  type Act,
  type Drill,
  type Mission,
  type MissionStep,
} from './schema';

/**
 * Word limits for a directed step (docs/act1-directed.md section 5.10). A directed step
 * shows a goal, cards, Otto's lines and a check beside the world, so each piece gets a
 * slice of the 60 words, and each screen's pieces together stay within its budget.
 */
export const DIRECTED_WORDS = {
  goal: 20,
  hint: 20,
  card: 12,
  ottoLine: OTTO_LINE_WORDS,
  lesson: 25,
  feedback: 25,
  /** The step's note, the goal and the start cards, shown together when Kyle directs. */
  directScreen: MAX_SCREEN_WORDS,
  /** Otto's opening line, the fixes and the start cards not tried yet. */
  fixRoundScreen: MAX_SCREEN_WORDS,
  /** Otto's claim, the question, its options and the look labels. */
  checkScreen: MAX_SCREEN_WORDS,
  /** A predict question and its options. */
  predict: 40,
  /** Each row of the Result screen's checklist: the step's and the guards' labels. */
  checklistLabel: 8,
} as const;

/** One problem in an Act's content, with where to find it. */
export interface ContentIssue {
  /** A readable location, like `mission three-rooms > drills > stage-one`. */
  readonly where: string;
  readonly problem: string;
}

/** Every value that appears more than once, each reported once. */
function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

/** A predicate and every predicate nested inside it (in all, any, and not), parents first. */
function everyPredicate(predicate: Predicate): Predicate[] {
  if (predicate.kind === 'all' || predicate.kind === 'any') {
    return [predicate, ...predicate.of.flatMap(everyPredicate)];
  }
  if (predicate.kind === 'not') return [predicate, ...everyPredicate(predicate.predicate)];
  return [predicate];
}

/**
 * Every `label` in a predicate, including ones nested inside all, any, and not. Labels
 * replace the generated text in the objective checklist, so the player reads them too.
 */
function labelsIn(predicate: Predicate): string[] {
  return everyPredicate(predicate).flatMap((part) =>
    part.label === undefined ? [] : [part.label],
  );
}

/**
 * Why these checks can't run in this setup, or null when they can. A laptop check asks
 * the machine, and only a setup that starts with windows() has one. Anywhere else,
 * grading stops with a PredicateContextError when it reaches the check, halfway through
 * a mission. Behind an all or any that has already decided, it is never reached, and
 * the answer comes quietly without it. So this is the real guard, not that error.
 */
function laptopProblem(
  predicates: readonly Predicate[],
  setup: readonly FixtureStep[],
  setupName: string,
): string | null {
  if (setup[0]?.op === 'windows') return null;
  const laptopCheck = predicates.flatMap(everyPredicate).find(isMachinePredicate);
  if (laptopCheck === undefined) return null;
  return `"${laptopCheck.kind}" checks the laptop, so ${setupName} must start with windows().`;
}

/** Every check a drill grades by: a typed drill's success, or a judgment drill's key. */
function drillChecks(drill: Drill): Predicate[] {
  if (!isJudgmentDrill(drill)) return [drill.success];
  switch (drill.kind) {
    case 'predict':
      return drill.options.flatMap(({ outcome }) =>
        outcome.state === undefined ? [] : [outcome.state],
      );
    case 'diagnose':
      return drill.options.flatMap(({ truth }) => (truth === undefined ? [] : [truth]));
    case 'fix':
      return [drill.goal, ...drill.failIf];
    case 'approve':
      return [...drill.guards];
  }
}

/** The ids of the boss and Field Mission, for an Act that has them so far. */
function partIds(act: Act): string[] {
  return [act.boss?.id, act.fieldMission?.id].filter((id) => id !== undefined);
}

/**
 * Text the player reads on one screen, where it lives, and its word limit. Pieces read
 * together, like a question and its options, count as one.
 */
type ScreenText = [where: string, texts: readonly string[], limit: number];

/** Every line Otto says in a script, including the lines of what he does after a deny. */
function ottoLines(script: readonly AgentAction[]): string[] {
  return script.flatMap((action) => {
    const said = action.say === undefined ? [] : [action.say];
    if (action.do === 'newTerminal' || action.do === 'useTerminal') return said;
    const denied = action.onDeny.flatMap((then) => (then.say === undefined ? [] : [then.say]));
    return [...said, ...denied, ...(action.denyLine === undefined ? [] : [action.denyLine])];
  });
}

/** The texts of a directed step's agent task, and the screens they share. */
function agentTexts(at: string, step: MissionStep, agent: AgentTask): ScreenText[] {
  const texts: ScreenText[] = [];
  const add = (where: string, pieces: readonly string[], limit: number) => {
    texts.push([`${at} > ${where}`, pieces, limit]);
  };
  const direct = [agent.note ?? '', step.instruction, ...agent.plans.map((plan) => plan.text)];
  add('direct screen', direct, DIRECTED_WORDS.directScreen);
  // A fix round follows at least one tried start card, and it's fullest when that card
  // was the shortest. Every fix is offered each round.
  const [, ...untried] = agent.plans
    .map((plan) => plan.text)
    .sort((a, b) => countWords(a) - countWords(b));
  const ottoOpens = FIX_ROUND_LINES.reduce((longest, line) =>
    countWords(line) > countWords(longest) ? line : longest,
  );
  const fixCards = agent.fixes.map((fix) => fix.text);
  add('fix round screen', [ottoOpens, ...fixCards, ...untried], DIRECTED_WORDS.fixRoundScreen);
  const checkTexts = [
    agent.check.question,
    ...agent.check.options.map((option) => option.text),
    ...agent.looks.map((look) => look.label),
  ];
  for (const plan of [...agent.plans, ...agent.fixes]) {
    const where = `plan ${plan.id}`;
    add(where, [plan.text], DIRECTED_WORDS.card);
    add(`${where} > claim`, [plan.claim], DIRECTED_WORDS.ottoLine);
    add(`${where} > lesson`, [plan.lesson], DIRECTED_WORDS.lesson);
    ottoLines(plan.script).forEach((line) => {
      add(`${where} > Otto`, [line], DIRECTED_WORDS.ottoLine);
    });
    plan.script.forEach((action, index) => {
      if (action.do !== 'run' || action.predict === undefined) return;
      const { question, options } = action.predict;
      const pieces = [question, ...options.map((option) => option.text)];
      add(`${where} > predict ${String(index + 1)}`, pieces, DIRECTED_WORDS.predict);
    });
    add(`${where} > check screen`, [plan.claim, ...checkTexts], DIRECTED_WORDS.checkScreen);
  }
  for (const option of agent.check.options) {
    add(`check ${option.id} > feedback`, [option.feedback], DIRECTED_WORDS.feedback);
  }
  return texts;
}

/** Each piece of text the player reads on screen, labelled with where it lives. */
function screenTexts(act: Act, missions: readonly Mission[]): ScreenText[] {
  const texts: ScreenText[] = [];
  const add = (where: string, text: string, limit: number = MAX_SCREEN_WORDS) => {
    texts.push([where, [text], limit]);
  };
  const addLabels = (
    where: string,
    predicates: readonly Predicate[],
    limit: number = MAX_SCREEN_WORDS,
  ) => {
    predicates.flatMap(labelsIn).forEach((label, index) => {
      add(`${where} > label ${String(index + 1)}`, label, limit);
    });
  };
  for (const mission of missions) {
    const at = `mission ${mission.id}`;
    mission.briefing.captions.forEach((caption, index) => {
      add(`${at} > briefing caption ${String(index + 1)}`, caption);
    });
    for (const step of mission.steps) {
      const where = `${at} > step ${step.id}`;
      const { agent } = step;
      // A directed step's goal and hints sit beside the cards, and its checklist shares
      // the Result screen, so they get less room.
      const goalWords = agent === undefined ? MAX_SCREEN_WORDS : DIRECTED_WORDS.goal;
      const hintWords = agent === undefined ? MAX_SCREEN_WORDS : DIRECTED_WORDS.hint;
      const labelWords = agent === undefined ? MAX_SCREEN_WORDS : DIRECTED_WORDS.checklistLabel;
      add(`${where} > instruction`, step.instruction, goalWords);
      step.hints.forEach((hint, index) => {
        add(`${where} > hint ${String(index + 1)}`, hint, hintWords);
      });
      addLabels(where, [step.success, ...(agent?.guards ?? [])], labelWords);
      if (agent !== undefined) texts.push(...agentTexts(where, step, agent));
    }
    for (const drill of mission.drills) {
      add(`${at} > drill ${drill.id}`, drill.prompt);
      addLabels(`${at} > drill ${drill.id}`, drillChecks(drill));
    }
    add(`${at} > ticket`, mission.questionRound.ticket.body);
    for (const candidate of mission.questionRound.candidates) {
      add(`${at} > candidate ${candidate.id}`, candidate.text);
      add(`${at} > candidate ${candidate.id} > rationale`, candidate.rationale);
    }
  }
  act.upcoming.forEach((title, index) => {
    add(`act > upcoming ${String(index + 1)}`, title);
  });
  const { placementTest, boss, fieldMission } = act;
  if (placementTest !== undefined) add('placement test > pitch', placementTest.pitch);
  if (boss !== undefined) {
    boss.briefing.forEach((caption, index) => {
      add(`boss > briefing caption ${String(index + 1)}`, caption);
    });
    boss.twists.forEach((twist, index) => {
      add(`boss > twist ${String(index + 1)}`, twist.message);
    });
    addLabels('boss', [...boss.objectives, ...boss.failIf]);
  }
  if (fieldMission !== undefined) {
    fieldMission.briefing.forEach((caption, index) => {
      add(`field mission > briefing caption ${String(index + 1)}`, caption);
    });
    for (const item of fieldMission.checklist) {
      add(`field mission > checklist ${item.id}`, item.text);
    }
    for (const check of fieldMission.verifications) {
      add(`field mission > verification ${check.id}`, check.instruction);
    }
  }
  return texts;
}

/**
 * Checks the links between an Act and its missions that no single schema can see:
 * every referenced mission and placement drill exists, ids don't collide, laptop checks
 * only grade setups that build a laptop, an early-access Act's upcoming list names only
 * missions that haven't shipped, and every screen of text stays within DESIGN.md
 * pillar 1's word budget, with a directed step's text held to the tighter budgets of
 * DIRECTED_WORDS. The schemas also limit words, keep a mission directed or typed, and
 * point hintPlan at a strong card; repeating those here means content built without
 * parsing is covered too, and every problem is listed at once with its location.
 *
 * Returns an empty list when the Act is ready to ship.
 */
export function validateAct(act: Act, missions: readonly Mission[]): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const report = (where: string, problem: string) => issues.push({ where, problem });
  const byId = new Map(missions.map((mission) => [mission.id, mission]));

  for (const id of duplicates(missions.map((mission) => mission.id))) {
    report(`mission ${id}`, 'Two missions share this id.');
  }
  for (const id of duplicates(act.missionIds)) {
    report('act > missionIds', `"${id}" is listed more than once.`);
  }
  for (const id of act.missionIds) {
    if (!byId.has(id)) report('act > missionIds', `No mission has the id "${id}".`);
  }
  for (const mission of missions) {
    if (!act.missionIds.includes(mission.id)) {
      report(`mission ${mission.id}`, `Not listed in Act ${String(act.act)}'s missionIds.`);
    }
    if (mission.act !== act.act) {
      report(`mission ${mission.id}`, `Says act ${String(mission.act)}, not ${String(act.act)}.`);
    }
  }

  // Shipping a mission means taking it off the "Coming soon" list, or it shows twice.
  const shippedTitles = new Set(missions.map((mission) => mission.title));
  for (const title of act.upcoming) {
    if (shippedTitles.has(title)) {
      report('act > upcoming', `"${title}" has shipped, so it isn't upcoming.`);
    }
  }

  // The boss and Field Mission are saved and unlocked alongside missions, so all three
  // kinds of id must be told apart.
  const activityIds = [...byId.keys(), ...partIds(act)];
  for (const id of duplicates(activityIds)) {
    report('act', `The id "${id}" is used by more than one mission, boss, or Field Mission.`);
  }

  // The placement test names drills by id alone, so drill ids must be unique across the Act.
  const drillIds = missions.flatMap((mission) => mission.drills.map((drill) => drill.id));
  for (const id of duplicates(drillIds)) {
    report(`drill ${id}`, 'Two drills in this Act share this id.');
  }
  const knownDrills = new Set(drillIds);
  const placementIds = act.placementTest?.drillIds ?? [];
  for (const id of duplicates(placementIds)) {
    report('placement test', `Drill "${id}" is listed more than once.`);
  }
  for (const id of placementIds) {
    if (!knownDrills.has(id)) report('placement test', `No drill in this Act has the id "${id}".`);
  }

  const reportLaptop = (where: string, problem: string | null) => {
    if (problem !== null) report(where, problem);
  };
  for (const mission of missions) {
    for (const { field, message } of directedProblems(mission)) {
      report(`mission ${mission.id} > ${field}`, message);
    }
    for (const step of mission.steps) {
      const where = `mission ${mission.id} > step ${step.id}`;
      reportLaptop(
        where,
        laptopProblem([step.success], mission.initialRepoState, "the mission's initialRepoState"),
      );
      const hintProblem = step.agent === undefined ? null : hintPlanProblem(step.agent);
      if (hintProblem !== null) report(`${where} > hintPlan`, hintProblem);
    }
    for (const drill of mission.drills) {
      reportLaptop(
        `mission ${mission.id} > drill ${drill.id}`,
        laptopProblem(drillChecks(drill), drill.setup, "the drill's setup"),
      );
    }
  }
  const { boss } = act;
  if (boss !== undefined) {
    reportLaptop(
      'boss',
      laptopProblem([...boss.objectives, ...boss.failIf], boss.setup, "the boss's setup"),
    );
  }

  for (const [where, texts, limit] of screenTexts(act, missions)) {
    const words = texts.reduce((total, text) => total + countWords(text), 0);
    if (words > limit) report(where, `${String(words)} words; the limit is ${String(limit)}.`);
  }
  return issues;
}

/**
 * Checks the Acts against each other. The review queue, the placement tests, and the save
 * all name missions and drills by id alone, so ids must be unique across every Act, not
 * just within one. Each Act on its own is checked by validateAct.
 */
export function validateCatalog(
  acts: readonly { readonly act: Act; readonly missions: readonly Mission[] }[],
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  for (const number of duplicates(acts.map((entry) => String(entry.act.act)))) {
    issues.push({ where: 'catalog', problem: `Act ${number} appears more than once.` });
  }
  const activityIds = acts.flatMap(({ act, missions }) => [
    ...missions.map((mission) => mission.id),
    ...partIds(act),
  ]);
  for (const id of duplicates(activityIds)) {
    issues.push({ where: 'catalog', problem: `The id "${id}" is used in more than one place.` });
  }
  const drillIds = acts.flatMap(({ missions }) =>
    missions.flatMap((mission) => mission.drills.map((drill) => drill.id)),
  );
  for (const id of duplicates(drillIds)) {
    issues.push({ where: 'catalog', problem: `Drill "${id}" appears in more than one mission.` });
  }
  return issues;
}
