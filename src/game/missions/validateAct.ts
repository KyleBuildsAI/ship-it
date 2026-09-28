import type { FixtureStep } from '../../engine/git/fixtures';
import { isMachinePredicate } from './machinePredicates';
import type { Predicate } from './predicates';
import { countWords, MAX_SCREEN_WORDS, type Act, type Mission } from './schema';

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
 * the machine, and only a setup that starts with windows() has one: anywhere else,
 * grading would stop with a PredicateContextError halfway through a mission.
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

/** Each piece of text the player reads on screen, labelled with where it lives. */
function screenTexts(act: Act, missions: readonly Mission[]): [string, string][] {
  const texts: [string, string][] = [];
  const addLabels = (where: string, predicates: readonly Predicate[]) => {
    predicates.flatMap(labelsIn).forEach((label, index) => {
      texts.push([`${where} > label ${String(index + 1)}`, label]);
    });
  };
  for (const mission of missions) {
    const at = `mission ${mission.id}`;
    mission.briefing.captions.forEach((caption, index) => {
      texts.push([`${at} > briefing caption ${String(index + 1)}`, caption]);
    });
    for (const step of mission.steps) {
      texts.push([`${at} > step ${step.id} > instruction`, step.instruction]);
      step.hints.forEach((hint, index) => {
        texts.push([`${at} > step ${step.id} > hint ${String(index + 1)}`, hint]);
      });
      addLabels(`${at} > step ${step.id}`, [step.success]);
    }
    for (const drill of mission.drills) {
      texts.push([`${at} > drill ${drill.id}`, drill.prompt]);
      addLabels(`${at} > drill ${drill.id}`, [drill.success]);
    }
    texts.push([`${at} > ticket`, mission.questionRound.ticket.body]);
    for (const candidate of mission.questionRound.candidates) {
      texts.push([`${at} > candidate ${candidate.id}`, candidate.text]);
      texts.push([`${at} > candidate ${candidate.id} > rationale`, candidate.rationale]);
    }
  }
  texts.push(['placement test > pitch', act.placementTest.pitch]);
  act.boss.briefing.forEach((caption, index) => {
    texts.push([`boss > briefing caption ${String(index + 1)}`, caption]);
  });
  act.boss.twists.forEach((twist, index) => {
    texts.push([`boss > twist ${String(index + 1)}`, twist.message]);
  });
  addLabels('boss', [...act.boss.objectives, ...act.boss.failIf]);
  act.fieldMission.briefing.forEach((caption, index) => {
    texts.push([`field mission > briefing caption ${String(index + 1)}`, caption]);
  });
  for (const item of act.fieldMission.checklist) {
    texts.push([`field mission > checklist ${item.id}`, item.text]);
  }
  for (const check of act.fieldMission.verifications) {
    texts.push([`field mission > verification ${check.id}`, check.instruction]);
  }
  return texts;
}

/**
 * Checks the links between an Act and its missions that no single schema can see:
 * every referenced mission and placement drill exists, ids don't collide, laptop checks
 * only grade setups that build a laptop, and every screen of text stays within DESIGN.md
 * pillar 1's word budget. The schemas also limit words; repeating it here means content
 * built without parsing is covered too, and every problem is listed at once with its
 * location.
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

  // The boss and Field Mission are saved and unlocked alongside missions, so all three
  // kinds of id must be told apart.
  const activityIds = [...byId.keys(), act.boss.id, act.fieldMission.id];
  for (const id of duplicates(activityIds)) {
    report('act', `The id "${id}" is used by more than one mission, boss, or Field Mission.`);
  }

  // The placement test names drills by id alone, so drill ids must be unique across the Act.
  const drillIds = missions.flatMap((mission) => mission.drills.map((drill) => drill.id));
  for (const id of duplicates(drillIds)) {
    report(`drill ${id}`, 'Two drills in this Act share this id.');
  }
  const knownDrills = new Set(drillIds);
  for (const id of duplicates(act.placementTest.drillIds)) {
    report('placement test', `Drill "${id}" is listed more than once.`);
  }
  for (const id of act.placementTest.drillIds) {
    if (!knownDrills.has(id)) report('placement test', `No drill in this Act has the id "${id}".`);
  }

  const reportLaptop = (where: string, problem: string | null) => {
    if (problem !== null) report(where, problem);
  };
  for (const mission of missions) {
    for (const step of mission.steps) {
      reportLaptop(
        `mission ${mission.id} > step ${step.id}`,
        laptopProblem([step.success], mission.initialRepoState, "the mission's initialRepoState"),
      );
    }
    for (const drill of mission.drills) {
      reportLaptop(
        `mission ${mission.id} > drill ${drill.id}`,
        laptopProblem([drill.success], drill.setup, "the drill's setup"),
      );
    }
  }
  const { boss } = act;
  reportLaptop(
    'boss',
    laptopProblem([...boss.objectives, ...boss.failIf], boss.setup, "the boss's setup"),
  );

  for (const [where, text] of screenTexts(act, missions)) {
    const words = countWords(text);
    if (words > MAX_SCREEN_WORDS) {
      report(where, `${String(words)} words; the limit is ${String(MAX_SCREEN_WORDS)}.`);
    }
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
    act.boss.id,
    act.fieldMission.id,
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
