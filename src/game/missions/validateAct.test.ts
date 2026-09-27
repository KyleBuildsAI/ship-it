import { describe, expect, it } from 'vitest';
import { sampleAct, sampleMission, secondMission } from './sample.test-mission';
import type { Act, Mission } from './schema';
import { validateAct } from './validateAct';

const missions = [sampleMission, secondMission];
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
    expect(validateAct(sampleAct, [sampleMission])).toEqual([
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
    expect(validateAct(sampleAct, [sampleMission, wrongAct])).toEqual([
      { where: 'mission sample-reading-history', problem: 'Says act 3, not 2.' },
    ]);
  });

  it('catches ids that collide', () => {
    const twin: Mission = { ...secondMission, id: sampleMission.id };
    const act: Act = { ...sampleAct, missionIds: [sampleMission.id, sampleMission.id] };
    expect(validateAct(act, [sampleMission, twin])).toEqual([
      { where: 'mission sample-three-rooms', problem: 'Two missions share this id.' },
      { where: 'act > missionIds', problem: '"sample-three-rooms" is listed more than once.' },
    ]);
    // The placement test names drills by id alone, so two missions can't share one.
    const copycat: Mission = { ...secondMission, drills: sampleMission.drills };
    expect(validateAct(sampleAct, [sampleMission, copycat])).toEqual(
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
    expect(validateAct(act, [wordy, secondMission])).toEqual([
      {
        where: 'mission sample-three-rooms > step init > hint 2',
        problem: '61 words; the limit is 60.',
      },
      { where: 'mission sample-three-rooms > ticket', problem: '70 words; the limit is 60.' },
      { where: 'boss > twist 1', problem: '61 words; the limit is 60.' },
      { where: 'field mission > checklist long', problem: '62 words; the limit is 60.' },
    ]);
  });
});
