import { describe, expect, it } from 'vitest';
import { windows } from '../../engine/fixtures';
import { repo } from '../../engine/git/fixtures';
import type { AgentTask, Plan } from './agentSchema';
import {
  directedMission,
  earlySampleAct,
  otherSampleAct,
  sampleAct,
  sampleMission,
  secondMission,
  thirdMission,
} from './sample.test-mission';
import type { Predicate } from './predicates';
import { lessonActInput, sampleFinal, sampleLesson, sampleLessonAct } from './sample.test-lesson';
import { ActSchema, type Act, type CompleteAct, type Mission, type MissionStep } from './schema';
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

describe('validateAct on a directed mission', () => {
  const directedAct = ActSchema.parse({
    act: 1,
    title: 'Directed Sample',
    earlyAccess: true,
    missionIds: [directedMission.id],
  });
  const [step] = directedMission.steps;
  const agent = step?.agent;
  if (step === undefined || agent === undefined) throw new Error('The sample step is directed.');
  const [guess, fullPath, fix] = [...agent.plans, ...agent.fixes];
  if (guess === undefined || fullPath === undefined || fix === undefined) {
    throw new Error('The sample has two start plans and a fix.');
  }
  const at = 'mission sample-where-things-live > step stand-in-the-api';
  const over = (where: string, count: number, limit: number) => ({
    where: `${at}${where}`,
    problem: `${String(count)} words; the limit is ${String(limit)}.`,
  });

  /** Checks the directed sample with its one step, and that step's agent task, changed. */
  const check = (stepChanges: Partial<MissionStep>, agentChanges: Partial<AgentTask> = {}) => {
    const changed = { ...step, ...stepChanges, agent: { ...agent, ...agentChanges } };
    return validateAct(directedAct, [{ ...directedMission, steps: [changed] }]);
  };

  it('passes the directed sample, beside the typed one', () => {
    expect(check({})).toEqual([]);
    const directed = { act: directedAct, missions: [directedMission] };
    expect(validateCatalog([directed, { act: sampleAct, missions }])).toEqual([]);
  });

  it("gives a directed step's goal and hints 20 words each, not 60", () => {
    const hints: MissionStep['hints'] = [words(21), step.hints[1], step.hints[2]];
    expect(check({ instruction: words(21), hints })).toEqual([
      over(' > instruction', 21, 20),
      over(' > hint 1', 21, 20),
    ]);
  });

  it("keeps each card to 12 words, and each of Otto's lines too", () => {
    const chatty: Plan = {
      ...guess,
      text: words(13),
      claim: words(13),
      script: [
        {
          do: 'run',
          line: 'cd api',
          say: words(13),
          onDeny: [
            { do: 'newTerminal', say: words(13) },
            { do: 'run', line: 'Get-Location' },
          ],
          denyLine: words(13),
        },
        { do: 'useTerminal', tab: 1 },
        { do: 'newTerminal', say: words(13) },
      ],
    };
    expect(check({}, { plans: [chatty, fullPath] })).toEqual([
      over(' > plan guess', 13, 12),
      over(' > plan guess > claim', 13, 12),
      // What Otto says as he runs the line, after a deny, on a deny, and opening a terminal.
      over(' > plan guess > Otto', 13, 12),
      over(' > plan guess > Otto', 13, 12),
      over(' > plan guess > Otto', 13, 12),
      over(' > plan guess > Otto', 13, 12),
    ]);
  });

  it('keeps lessons and feedback to 25 words', () => {
    const [api, home] = agent.check.options;
    if (api === undefined || home === undefined) throw new Error('The check has two options.');
    const options = [api, { ...home, feedback: words(26) }];
    const lesson = { ...fullPath, lesson: words(26) };
    expect(check({}, { plans: [guess, lesson], check: { ...agent.check, options } })).toEqual([
      over(' > plan full-path > lesson', 26, 25),
      over(' > check home > feedback', 26, 25),
    ]);
  });

  it('adds up the pieces shown together on one screen', () => {
    // The note, the 12-word goal and the cards (5 and 8 words) share the Direct screen.
    expect(check({}, { note: words(36) })).toEqual([over(' > direct screen', 61, 60)]);
    // Each claim shows with the question, 6 words of options and a 3-word look. The fix's
    // claim is one word longer than the start plans' claims, so only its screen runs over.
    const question = { ...agent.check, question: words(45) };
    expect(check({}, { check: question })).toEqual([
      over(' > plan fix-full-path > check screen', 61, 60),
    ]);
    const predict = {
      question: words(30),
      options: [
        { id: 'api', text: words(6), outcome: { result: 'ok' as const } },
        { id: 'fails', text: words(5), outcome: { result: 'error' as const } },
      ],
    };
    const predicting = {
      ...fix,
      script: [{ do: 'run' as const, line: 'cd api', predict, onDeny: [] }],
    };
    expect(check({}, { fixes: [predicting] })).toEqual([
      over(' > plan fix-full-path > predict 1', 41, 40),
    ]);
  });

  it('adds up a fix round: the longer opening line, every fix, and the untried cards', () => {
    // Otto opens with 7 words. At least one start card was tried, and the round is
    // fullest when that was the shortest, so the 5-word card drops out.
    const card = (plan: Plan, id: string, count: number) => ({ ...plan, id, text: words(count) });
    const fixes = ['fix-a', 'fix-b', 'fix-c'].map((id) => card(fix, id, 12));
    const plans = (last: number) => [
      card(guess, 'guess', 9),
      card(fullPath, 'full-path', 5),
      card(guess, 'extra', last),
    ];
    expect(check({}, { plans: plans(8), fixes })).toEqual([]);
    expect(check({}, { plans: plans(9), fixes })).toEqual([over(' > fix round screen', 61, 60)]);
  });

  it("holds the checklist's labels, the guards' too, to 8 words each", () => {
    const guards: Predicate[] = [
      { kind: 'driveFolder', path: 'Users/kyle/notes', label: words(8) },
      { kind: 'driveFolder', path: 'Users/kyle/notes', label: words(9) },
    ];
    const success: Predicate = { ...step.success, label: words(9) };
    expect(check({ success }, { guards })).toEqual([
      over(' > label 1', 9, 8),
      over(' > label 3', 9, 8),
    ]);
  });

  it("repeats the schema's directed rules, for content built without parsing", () => {
    const mission = 'mission sample-where-things-live';
    const typed: MissionStep = { ...step, id: 'typed', agent: undefined };
    const mixed = { ...directedMission, approvals: undefined, steps: [step, typed] };
    expect(validateAct(directedAct, [mixed])).toEqual([
      {
        where: `${mission} > steps`,
        problem: 'Give every step an agent task, or none: a mission is directed or typed.',
      },
      {
        where: `${mission} > approvals`,
        problem: 'A directed mission sets approvals: "changes" or "destructive".',
      },
    ]);
    const onGit = { ...directedMission, initialRepoState: sampleMission.initialRepoState };
    expect(validateAct(directedAct, [onGit])).toEqual([
      {
        where: `${mission} > initialRepoState`,
        problem: 'Otto works on the laptop, so start with windows().',
      },
      {
        where: at,
        problem: `"currentDirectory" checks the laptop, so the mission's initialRepoState must start with windows().`,
      },
    ]);
    expect(check({}, { hintPlan: 'guess' })).toEqual([
      { where: `${at} > hintPlan`, problem: 'hintPlan must name a strong start plan.' },
    ]);
    const typedWithApprovals = { ...sampleMission, approvals: 'changes' as const };
    expect(validateAct(sampleAct, [typedWithApprovals, secondMission, thirdMission])).toEqual([
      {
        where: 'mission sample-three-rooms > approvals',
        problem: 'Only a directed mission sets approvals.',
      },
    ]);
  });

  it("keeps a judgment drill's question to 60 words, its explain to 30, Otto's lines to 12", () => {
    const say = { do: 'run', line: 'Get-Location', say: words(13) };
    const changed: Record<string, object> = {
      // The prompt shares the question with 18 words of options.
      'sample-predict-typo': { prompt: words(43) },
      'sample-diagnose-home': { explain: words(31) },
      'sample-fix-cd': { claim: words(13), history: [say] },
      'sample-approve-stray': { action: say },
    };
    const drills = directedMission.drills.map((drill) => ({ ...drill, ...changed[drill.id] }));
    const at = 'mission sample-where-things-live > drill';
    const ottoOver = { problem: '13 words; the limit is 12.' };
    expect(validateAct(directedAct, [{ ...directedMission, drills }])).toEqual([
      { where: `${at} sample-predict-typo > question`, problem: '61 words; the limit is 60.' },
      { where: `${at} sample-diagnose-home > explain`, problem: '31 words; the limit is 30.' },
      // Otto's claim, then his line in the scene before the question.
      { where: `${at} sample-fix-cd > Otto`, ...ottoOver },
      { where: `${at} sample-fix-cd > Otto`, ...ottoOver },
      { where: `${at} sample-approve-stray > Otto`, ...ottoOver },
    ]);
  });

  it("finds the laptop checks in every judgment drill's answer key", () => {
    // Each sample key checks the laptop, so none can be graded in a setup without one.
    const drills = directedMission.drills.map((drill) => ({ ...drill, setup: repo().toSpec() }));
    const onGit = (id: string, kind: string) => ({
      where: `mission sample-where-things-live > drill ${id}`,
      problem: `"${kind}" checks the laptop, so the drill's setup must start with windows().`,
    });
    expect(validateAct(directedAct, [{ ...directedMission, drills }])).toEqual([
      onGit('sample-predict-typo', 'currentDirectory'),
      onGit('sample-diagnose-home', 'currentDirectory'),
      onGit('sample-fix-cd', 'currentDirectory'),
      onGit('sample-approve-stray', 'driveFile'),
      onGit('sample-approve-notes', 'driveFile'),
    ]);
  });

  it("finds a laptop check in a fix's failIf, even when its goal checks git", () => {
    const goal: Predicate = { kind: 'isRepo' };
    const failIf: Predicate[] = [{ kind: 'driveFolder', path: 'Users/kyle/api' }];
    const drills = directedMission.drills.map((drill) =>
      drill.id === 'sample-fix-cd' ? { ...drill, setup: repo().toSpec(), goal, failIf } : drill,
    );
    expect(validateAct(directedAct, [{ ...directedMission, drills }])).toEqual([
      {
        where: 'mission sample-where-things-live > drill sample-fix-cd',
        problem:
          '"driveFolder" checks the laptop, so the drill\'s setup must start with windows().',
      },
    ]);
  });

  it("holds the labels in a judgment drill's answer key to 60 words", () => {
    const label = words(61);
    const changed: Record<string, object> = {
      'sample-fix-cd': { failIf: [{ kind: 'driveFolder', path: 'Users/kyle/api', label }] },
      'sample-approve-stray': {
        guards: [{ kind: 'driveFile', path: 'Users/kyle/quillwork/api/package.json', label }],
      },
    };
    const drills = directedMission.drills.map((drill) => ({ ...drill, ...changed[drill.id] }));
    const at = 'mission sample-where-things-live > drill';
    const over = { problem: '61 words; the limit is 60.' };
    expect(validateAct(directedAct, [{ ...directedMission, drills }])).toEqual([
      // The fix's goal has no label, so the label in its failIf is the first.
      { where: `${at} sample-fix-cd > label 1`, ...over },
      { where: `${at} sample-approve-stray > label 1`, ...over },
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

describe('an Act made of lessons', () => {
  const lessonAct = sampleLessonAct();
  const { act, lessons } = lessonAct;

  it('ships with its lessons named in missionIds, final last', () => {
    expect(validateAct(act, [], lessons)).toEqual([]);
    expect(validateCatalog([{ act: sampleAct, missions }, lessonAct])).toEqual([]);
  });

  it('catches a lesson that is missing, unlisted, or in the wrong Act', () => {
    expect(validateAct(act, [], [sampleFinal])).toEqual([
      { where: 'act > missionIds', problem: `No mission has the id "${sampleLesson.id}".` },
    ]);
    const stray = { ...sampleLesson, id: 'sample-stray', act: 5 };
    expect(validateAct(act, [], [...lessons, stray])).toEqual([
      { where: 'lesson sample-stray', problem: "Not listed in Act 4's missionIds." },
      { where: 'lesson sample-stray', problem: 'Says act 5, not 4.' },
    ]);
  });

  it('keeps one final, played last', () => {
    const finalFirst = { ...act, missionIds: [sampleFinal.id, sampleLesson.id] };
    expect(validateAct(finalFirst, [], lessons)).toEqual([
      { where: `lesson ${sampleFinal.id}`, problem: 'A final lesson comes last in missionIds.' },
    ]);
    const second = { ...sampleFinal, id: 'sample-final-two' };
    const twoFinals = { ...act, missionIds: [...act.missionIds, second.id] };
    expect(validateAct(twoFinals, [], [...lessons, second])).toContainEqual({
      where: 'act',
      problem: 'An Act has at most one final lesson.',
    });
  });

  it('catches a lesson that shares an id with a mission, here or in another Act', () => {
    const clash = { ...sampleLesson, id: sampleMission.id };
    const listed = { ...act, missionIds: [sampleMission.id, sampleFinal.id] };
    expect(validateAct(listed, [], [clash, sampleFinal])).toEqual([]);
    expect(
      validateCatalog([
        { act: sampleAct, missions },
        { act: listed, missions: [], lessons: [clash, sampleFinal] },
      ]),
    ).toContainEqual({
      where: 'catalog',
      problem: `The id "${sampleMission.id}" is used in more than one place.`,
    });
  });

  it('takes a shipped lesson off the upcoming list', () => {
    const stale = ActSchema.parse({ ...lessonActInput, upcoming: [sampleLesson.title] });
    expect(validateAct(stale, [], lessons)).toEqual([
      {
        where: 'act > upcoming',
        problem: `"${sampleLesson.title}" has shipped, so it isn't upcoming.`,
      },
    ]);
  });
});
