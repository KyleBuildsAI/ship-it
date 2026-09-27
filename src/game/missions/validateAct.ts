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

/** Each piece of text the player reads on screen, labelled with where it lives. */
function screenTexts(act: Act, missions: readonly Mission[]): [string, string][] {
  const texts: [string, string][] = [];
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
    }
    for (const drill of mission.drills) texts.push([`${at} > drill ${drill.id}`, drill.prompt]);
    texts.push([`${at} > ticket`, mission.questionRound.ticket.body]);
    for (const candidate of mission.questionRound.candidates) {
      texts.push([`${at} > candidate ${candidate.id}`, candidate.text]);
      texts.push([`${at} > candidate ${candidate.id} > rationale`, candidate.rationale]);
    }
  }
  act.boss.briefing.forEach((caption, index) => {
    texts.push([`boss > briefing caption ${String(index + 1)}`, caption]);
  });
  act.boss.twists.forEach((twist, index) => {
    texts.push([`boss > twist ${String(index + 1)}`, twist.message]);
  });
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
 * every referenced mission and placement drill exists, ids don't collide, and every
 * screen of text stays within DESIGN.md pillar 1's word budget. The schemas also limit
 * words; repeating it here means content built without parsing is covered too, and
 * every problem is listed at once with its location.
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

  for (const [where, text] of screenTexts(act, missions)) {
    const words = countWords(text);
    if (words > MAX_SCREEN_WORDS) {
      report(where, `${String(words)} words; the limit is ${String(MAX_SCREEN_WORDS)}.`);
    }
  }
  return issues;
}
