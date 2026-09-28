import { describe, expect, it } from 'vitest';
import { windows } from '../../engine/fixtures';
import {
  earlySampleAct,
  otherSampleAct,
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from './sample.test-mission';
import type { Predicate } from './predicates';
import type { Act, CompleteAct, Mission } from './schema';
import { validateAct, validateCatalog } from './validateAct';

const missions = [sampleMission, secondMission, thirdMission];
const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ');

/** The sample act with the placement test replaced. */
const withPlacement = (drillIds: string[]): Act => ({
  ...sampleAct,
  placementTest: { ...sampleAct.placementTest, drillIds },
});

describe('validateAct', () => {
  it('passes the sample Act', () => {
    expect(validateAct(sampleAct, missions)).toEqual([]);
  });

  it('finds missions that are listed but missing, or present but not listed', () => {
    expect(validateAct(sampleAct, [sampleMission, thirdMission])).toEqual([
      { where: 'act > missionIds', problem: 'No mission has the id "sample-reading-history".' },
      // The placement test also borrows drills from the missing mission.
      {
        where: 'placement test',
        problem: 'No drill in this Act has the id "history-sample-init".',
      },
      {
        where: 'placement test',
        problem: 'No drill in this Act has the id "history-sample-stage-one".',
      },
      {
        where: 'placement test',
        problem: 'No drill in this Act has the id "history-sample-commit".',
      },
    ]);
    const extra: Mission = { ...secondMission, id: 'sample-extra', drills: [] };
    expect(validateAct(sampleAct, [...missions, extra])).toEqual([
      { where: 'mission sample-extra', problem: "Not listed in Act 2's missionIds." },
    ]);
  });

  it('catches a mission filed under the wrong Act', () => {
    const wrongAct: Mission = { ...secondMission, act: 3 };
    expect(validateAct(sampleAct, [sampleMission, wrongAct, thirdMission])).toEqual([
      { where: 'mission sample-reading-history', problem: 'Says act 3, not 2.' },
    ]);
  });

  it('catches ids that collide', () => {
    const twin: Mission = { ...secondMission, id: sampleMission.id };
    const act: Act = {
      ...sampleAct,
      missionIds: [sampleMission.id, sampleMission.id, thirdMission.id],
    };
    expect(validateAct(act, [sampleMission, twin, thirdMission])).toEqual([
      { where: 'mission sample-three-rooms', problem: 'Two missions share this id.' },
      { where: 'act > missionIds', problem: '"sample-three-rooms" is listed more than once.' },
    ]);
    // The placement test names drills by id alone, so two missions can't share one.
    const copycat: Mission = { ...secondMission, drills: sampleMission.drills };
    expect(validateAct(sampleAct, [sampleMission, copycat, thirdMission])).toEqual(
      expect.arrayContaining([
        { where: 'drill sample-init', problem: 'Two drills in this Act share this id.' },
      ]),
    );
    const bossClash: Act = { ...sampleAct, boss: { ...sampleAct.boss, id: sampleMission.id } };
    expect(validateAct(bossClash, missions)).toEqual([
      {
        where: 'act',
        problem:
          'The id "sample-three-rooms" is used by more than one mission, boss, or Field Mission.',
      },
    ]);
  });

  it('checks the placement test only names real drills, once each', () => {
    const [firstId = '', ...rest] = sampleAct.placementTest.drillIds;
    expect(validateAct(withPlacement([firstId, firstId, ...rest.slice(1)]), missions)).toEqual([
      { where: 'placement test', problem: 'Drill "sample-init" is listed more than once.' },
    ]);
    expect(validateAct(withPlacement([...rest, 'no-such-drill']), missions)).toEqual([
      { where: 'placement test', problem: 'No drill in this Act has the id "no-such-drill".' },
    ]);
  });

  it('flags every screen of text over 60 words, with its location', () => {
    const wordy: Mission = {
      ...sampleMission,
      steps: sampleMission.steps.map((step, index) =>
        index === 0 ? { ...step, hints: [step.hints[0], words(61), step.hints[2]] } : step,
      ),
      questionRound: {
        ...sampleMission.questionRound,
        ticket: { ...sampleMission.questionRound.ticket, body: words(70) },
      },
    };
    const act: Act = {
      ...sampleAct,
      boss: {
        ...sampleAct.boss,
        twists: [{ atSecondsRemaining: 60, message: words(61), apply: [] }],
      },
      fieldMission: {
        ...sampleAct.fieldMission,
        checklist: [{ id: 'long', text: words(62) }],
      },
    };
    expect(validateAct(act, [wordy, secondMission, thirdMission])).toEqual([
      {
        where: 'mission sample-three-rooms > step init > hint 2',
        problem: '61 words; the limit is 60.',
      },
      { where: 'mission sample-three-rooms > ticket', problem: '70 words; the limit is 60.' },
      { where: 'boss > twist 1', problem: '61 words; the limit is 60.' },
      { where: 'field mission > checklist long', problem: '62 words; the limit is 60.' },
    ]);
  });

  it('checks predicate labels too, even nested ones, since the checklist shows them', () => {
    const wordyCheck: Predicate = { kind: 'not', predicate: { kind: 'clean', label: words(61) } };
    const labelled: Mission = {
      ...sampleMission,
      steps: sampleMission.steps.map((step, index) =>
        index === 0 ? { ...step, success: { kind: 'all', of: [step.success, wordyCheck] } } : step,
      ),
    };
    const act: Act = {
      ...sampleAct,
      boss: { ...sampleAct.boss, failIf: [{ kind: 'tracked', paths: ['.env'], label: words(65) }] },
    };
    expect(validateAct(act, [labelled, secondMission, thirdMission])).toEqual([
      {
        where: 'mission sample-three-rooms > step init > label 1',
        problem: '61 words; the limit is 60.',
      },
      { where: 'boss > label 1', problem: '65 words; the limit is 60.' },
    ]);
  });

  it('lets laptop checks grade only setups that build a laptop, even nested ones', () => {
    const noStray: Predicate = {
      kind: 'not',
      predicate: { kind: 'driveFolder', path: 'Users/kyle/notes' },
    };
    const onGit: Mission = {
      ...sampleMission,
      steps: sampleMission.steps.map((step, index) =>
        index === 0 ? { ...step, success: { kind: 'all', of: [step.success, noStray] } } : step,
      ),
      drills: sampleMission.drills.map((drill, index) =>
        index === 0 ? { ...drill, success: { kind: 'envVar', name: 'PORT' } } : drill,
      ),
    };
    const atHome: Predicate = { kind: 'currentDirectory', path: 'Users/kyle' };
    const act: CompleteAct = { ...sampleAct, boss: { ...sampleAct.boss, failIf: [atHome] } };
    expect(validateAct(act, [onGit, secondMission, thirdMission])).toEqual([
      {
        where: 'mission sample-three-rooms > step init',
        problem:
          '"driveFolder" checks the laptop, so the mission\'s initialRepoState must start with windows().',
      },
      {
        where: 'mission sample-three-rooms > drill sample-init',
        problem: '"envVar" checks the laptop, so the drill\'s setup must start with windows().',
      },
      {
        where: 'boss',
        problem:
          '"currentDirectory" checks the laptop, so the boss\'s setup must start with windows().',
      },
    ]);

    // The same checks are fine once every setup starts with windows().
    const laptop = windows().toSpec();
    const onLaptop: Mission = {
      ...onGit,
      initialRepoState: laptop,
      drills: onGit.drills.map((drill) => ({ ...drill, setup: laptop })),
    };
    const laptopAct: Act = { ...act, boss: { ...act.boss, setup: laptop } };
    expect(validateAct(laptopAct, [onLaptop, secondMission, thirdMission])).toEqual([]);
  });

  it('checks only the parts an Act has', () => {
    const bare: Act = {
      ...sampleAct,
      placementTest: undefined,
      boss: undefined,
      fieldMission: undefined,
    };
    expect(validateAct(bare, missions)).toEqual([]);
    expect(validateCatalog([{ act: bare, missions }, otherSampleAct()])).toEqual([]);
  });

  it('flags an upcoming title that has already shipped, or runs long', () => {
    const early = earlySampleAct();
    expect(validateAct(early.act, early.missions)).toEqual([]);
    const shipped = early.missions[0]?.title ?? '';
    const stale: Act = { ...early.act, upcoming: [shipped, words(61)] };
    expect(validateAct(stale, early.missions)).toEqual([
      { where: 'act > upcoming', problem: `"${shipped}" has shipped, so it isn't upcoming.` },
      { where: 'act > upcoming 2', problem: '61 words; the limit is 60.' },
    ]);
  });
});

describe('validateCatalog', () => {
  const first = { act: sampleAct, missions };

  it('passes Acts whose ids are all different', () => {
    expect(validateCatalog([first, otherSampleAct()])).toEqual([]);
  });

  it('passes an early-access Act without a boss or Field Mission beside finished ones', () => {
    expect(validateCatalog([earlySampleAct(), first, otherSampleAct()])).toEqual([]);
  });

  it('catches an Act number used twice', () => {
    expect(
      validateCatalog([first, { ...otherSampleAct(), act: { ...otherSampleAct().act, act: 2 } }]),
    ).toEqual([{ where: 'catalog', problem: 'Act 2 appears more than once.' }]);
  });

  it('catches missions, bosses, and drills shared between Acts', () => {
    const copy = { act: { ...sampleAct, act: 3 }, missions };
    const problems = validateCatalog([first, copy]).map((issue) => issue.problem);

    expect(problems).toContain(`The id "${sampleMission.id}" is used in more than one place.`);
    expect(problems).toContain(`The id "${sampleAct.boss.id}" is used in more than one place.`);
    expect(problems).toContain(
      `Drill "${String(sampleMission.drills[0]?.id)}" appears in more than one mission.`,
    );
  });
});
