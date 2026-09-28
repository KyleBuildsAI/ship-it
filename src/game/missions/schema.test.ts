import { describe, expect, it } from 'vitest';
import { repo } from '../../engine/git/fixtures';
import {
  ActSchema,
  ContentError,
  countWords,
  DEFAULT_DRILL_SECONDS,
  DEFAULT_STEP_XP,
  FixtureStepSchema,
  MissionSchema,
  PICK_LIMIT,
  PLACEMENT_PASS_PERCENT,
  PredicateSchema,
  regexProblem,
  requireBoss,
  requireComplete,
  requireFieldMission,
  requirePlacement,
  type Act,
  type MissionInput,
} from './schema';
import {
  earlyActInput,
  sampleAct,
  sampleActInput,
  sampleMission,
  sampleMissionInput,
} from './sample.test-mission';

/** The messages zod reports, so a test can check the right rule fired. */
function problems(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

const words = (count: number) => Array.from({ length: count }, () => 'word').join(' ');

/** The sample mission with some fields replaced, for one broken rule per test. */
const mission = (changes: Partial<MissionInput>) =>
  MissionSchema.safeParse({ ...sampleMissionInput, ...changes });

/** Takes any object, because most act tests deliberately pass data the types would refuse. */
const act = (changes: object) => ActSchema.safeParse({ ...sampleActInput, ...changes });
const earlyAct = (changes: object) => ActSchema.safeParse({ ...earlyActInput, ...changes });

/** The first item of a list the sample data guarantees is non-empty. */
function first<T>(items: readonly T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error('The sample data should not be empty here.');
  return item;
}

const firstDrill = first(sampleMissionInput.drills);
const firstStep = first(sampleMissionInput.steps);

describe('countWords', () => {
  it('counts words separated by any whitespace', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  git   add\n app.ts ')).toBe(3);
  });
});

describe('FixtureStepSchema', () => {
  it('accepts every step a fixture builder produces', () => {
    const steps = repo()
      .commit('init', { 'src/app.ts': 'a' })
      .modify('src/app.ts')
      .delete('src/app.ts')
      .toSpec();
    expect(steps.every((step) => FixtureStepSchema.safeParse(step).success)).toBe(true);
  });

  it('rejects unknown operations and paths not in canonical form', () => {
    expect(FixtureStepSchema.safeParse({ op: 'push' }).success).toBe(false);
    for (const path of ['', './a.ts', '/a.ts', 'src\\a.ts', 'src/../a.ts', 'src/']) {
      expect(FixtureStepSchema.safeParse({ op: 'write', path, content: '' }).success).toBe(false);
    }
    expect(FixtureStepSchema.safeParse({ op: 'commit', message: '' }).success).toBe(false);
  });
});

describe('PredicateSchema', () => {
  it('accepts nested combinators', () => {
    const nested = {
      kind: 'all',
      of: [
        { kind: 'not', predicate: { kind: 'tracked', paths: ['.env'] } },
        { kind: 'any', of: [{ kind: 'clean' }, { kind: 'commitCount', min: 1 }] },
      ],
    };
    expect(PredicateSchema.parse(nested)).toEqual(nested);
  });

  it('rejects unknown kinds, empty lists, and bad paths, even deep inside', () => {
    expect(PredicateSchema.safeParse({ kind: 'deployed' }).success).toBe(false);
    expect(PredicateSchema.safeParse({ kind: 'staged', paths: [] }).success).toBe(false);
    expect(PredicateSchema.safeParse({ kind: 'all', of: [] }).success).toBe(false);
    const deep = {
      kind: 'not',
      predicate: { kind: 'any', of: [{ kind: 'tracked', paths: ['./a'] }] },
    };
    expect(PredicateSchema.safeParse(deep).success).toBe(false);
  });

  it('rejects misspelled keys instead of dropping them', () => {
    // Dropping `exist` would silently flip this check to "a.ts exists".
    const typo = { kind: 'workingFile', path: 'a.ts', exist: false };
    expect(problems(PredicateSchema.safeParse(typo))).toEqual(['Unrecognized key: "exist"']);
    expect(problems(MissionSchema.safeParse({ ...sampleMissionInput, xpp: 5 }))).toEqual([
      'Unrecognized key: "xpp"',
    ]);
    expect(FixtureStepSchema.safeParse({ op: 'delete', path: 'a.ts', paths: [] }).success).toBe(
      false,
    );
  });

  it('rejects a regex that does not compile, when the mission loads', () => {
    for (const kind of ['headMessage', 'allMessagesMatch', 'reflogContains']) {
      const result = PredicateSchema.safeParse({ kind, pattern: '(unclosed' });
      expect(result.success).toBe(false);
      expect(problems(result)[0]).toMatch(/^Invalid regex: /);
    }
    // \p{L} is only valid with the u flag, so the flags must be checked with the pattern.
    expect(PredicateSchema.safeParse({ kind: 'headMessage', pattern: '\\p{L}' }).success).toBe(
      true,
    );
    expect(
      PredicateSchema.safeParse({ kind: 'headMessage', pattern: '\\p{L', flags: 'u' }).success,
    ).toBe(false);
  });

  it('rejects the stateful g and y flags', () => {
    for (const flags of ['g', 'y', 'iy']) {
      const result = PredicateSchema.safeParse({ kind: 'headMessage', pattern: 'x', flags });
      expect(problems(result)[0]).toMatch(/g and y make test\(\) stateful/);
    }
    expect(
      PredicateSchema.safeParse({ kind: 'headMessage', pattern: 'x', flags: 'imsu' }).success,
    ).toBe(true);
  });

  it('rejects checks that could never pass or never say anything', () => {
    expect(problems(PredicateSchema.safeParse({ kind: 'commitCount' }))).toEqual([
      'Give at least one of min, max, or equals.',
    ]);
    expect(problems(PredicateSchema.safeParse({ kind: 'commitCount', min: 3, max: 2 }))).toEqual([
      'min is larger than max.',
    ]);
    for (const mixed of [{ min: 5 }, { max: 1 }]) {
      const result = PredicateSchema.safeParse({ kind: 'commitCount', equals: 3, ...mixed });
      expect(problems(result)).toEqual(['Use equals on its own, or min and max without it.']);
    }
    const goneButFull = { kind: 'workingFile', path: 'a.ts', exists: false, contains: 'x' };
    expect(problems(PredicateSchema.safeParse(goneButFull))).toEqual([
      'A file that must not exist cannot also have content to check.',
    ]);
  });

  it('accepts the four laptop checks with every option', () => {
    const checks = [
      { kind: 'currentDirectory', path: 'Users/kyle' },
      { kind: 'currentDirectory', path: 'Users/kyle', tab: 2 },
      { kind: 'currentDirectory', path: 'Users/kyle', tab: 'any' },
      { kind: 'driveFolder', path: 'Users/kyle/notes', exists: false },
      { kind: 'driveFile', path: 'Users/kyle/a.txt', equals: '', label: 'a.txt is empty' },
      { kind: 'driveFile', path: 'Users/kyle/a.txt', contains: 'x', pattern: '^x', flags: 'i' },
      { kind: 'envVar', name: 'PORT', scope: 'newTerminal', equals: '4000' },
      { kind: 'envVar', name: 'ProgramFiles(x86)', scope: 'machine', exists: false },
    ];
    for (const check of checks) expect(PredicateSchema.parse(check)).toEqual(check);
  });

  it('rejects laptop checks that could never pass or would be ignored', () => {
    const check = (value: object) => problems(PredicateSchema.safeParse(value));
    const file = { kind: 'driveFile', path: 'Users/kyle/a.txt' };
    expect(check({ ...file, exists: false, contains: 'x' })).toEqual([
      'A file that must not exist cannot also have content to check.',
    ]);
    expect(check({ ...file, flags: 'i' })).toEqual(['flags need a pattern.']);
    expect(check({ ...file, pattern: '(unclosed' })[0]).toMatch(/^Invalid regex: /);
    const port = { kind: 'envVar', name: 'PORT' };
    expect(check({ ...port, exists: false, equals: '4000' })).toEqual([
      'A variable that must be unset cannot also have a value to check.',
    ]);
    // Windows deletes a variable set to '', so "equals ''" could never pass.
    expect(PredicateSchema.safeParse({ ...port, equals: '' }).success).toBe(false);
    expect(PredicateSchema.safeParse({ ...port, scope: 'newterminal' }).success).toBe(false);
    expect(PredicateSchema.safeParse({ ...port, name: 'MY PORT' }).success).toBe(false);
    const here = { kind: 'currentDirectory', path: 'Users/kyle' };
    for (const tab of [0, 1.5, 'all']) {
      expect(PredicateSchema.safeParse({ ...here, tab }).success).toBe(false);
    }
    expect(PredicateSchema.safeParse({ ...here, path: 'C:\\Users\\kyle' }).success).toBe(false);
  });

  it("rejects a laptop path that starts at ~ or a drive letter, since a check doesn't expand them", () => {
    const fullPath =
      'Write the full drive path from C:\\, like "Users/kyle/notes". A check does not expand "~" or "C:".';
    // Written this way, a boss's failIf would look for a folder named '~' and fire at once.
    expect(
      problems(
        PredicateSchema.safeParse({ kind: 'driveFolder', path: '~/quillwork-api', exists: false }),
      ),
    ).toEqual([fullPath]);
    for (const path of ['~', '~/notes', 'C:/Users/kyle', 'Users/kyle/c:notes']) {
      for (const kind of ['currentDirectory', 'driveFolder', 'driveFile']) {
        expect(problems(PredicateSchema.safeParse({ kind, path }))).toEqual([fullPath]);
      }
    }
    // Only a leading '~' is home shorthand; one inside a name is an ordinary character.
    const lockFile = { kind: 'driveFile', path: 'Users/kyle/~notes.txt' };
    expect(PredicateSchema.parse(lockFile)).toEqual(lockFile);
  });
});

describe('regexProblem', () => {
  it('names the problem, or returns null for a good pattern', () => {
    expect(regexProblem('^feat: ')).toBeNull();
    expect(regexProblem('[')).toMatch(/Invalid regular expression/);
  });
});

describe('MissionSchema', () => {
  it('accepts the sample mission and fills in defaults', () => {
    expect(sampleMission.drills.map((drill) => drill.timeLimitSeconds)).toEqual([
      DEFAULT_DRILL_SECONDS,
      DEFAULT_DRILL_SECONDS,
      60,
      DEFAULT_DRILL_SECONDS,
      DEFAULT_DRILL_SECONDS,
    ]);
    expect(sampleMission.questionRound.pickLimit).toBe(PICK_LIMIT);
    // Only the first step leaves out its XP.
    expect(sampleMission.steps.map((step) => step.xp)).toEqual([DEFAULT_STEP_XP, 10, 20]);
  });

  it('wants kebab-case ids', () => {
    expect(mission({ id: 'Three Rooms' }).success).toBe(false);
    expect(mission({ id: 'three-rooms-2' }).success).toBe(true);
  });

  it('keeps on-screen text within 60 words (DESIGN.md pillar 1)', () => {
    const longCaption = { ...sampleMissionInput.briefing, captions: [words(61)] };
    expect(problems(mission({ briefing: longCaption }))[0]).toMatch(/60 words or fewer/);
    expect(mission({ briefing: { ...longCaption, captions: [words(60)] } }).success).toBe(true);
    const tooLong = /60 words or fewer/;
    const longStep = { ...firstStep, instruction: words(61) };
    expect(problems(mission({ steps: [longStep] }))).toEqual([expect.stringMatching(tooLong)]);
    const longDrill = { ...firstDrill, prompt: words(61) };
    const drills = [...sampleMissionInput.drills.slice(1), longDrill];
    expect(problems(mission({ drills }))).toEqual([expect.stringMatching(tooLong)]);
    // Labels replace checklist rows, so they are on-screen text too.
    const longLabel = { kind: 'clean', label: words(61) };
    expect(problems(PredicateSchema.safeParse(longLabel))).toEqual([
      expect.stringMatching(tooLong),
    ]);
  });

  it('shows 1 to 3 briefing captions', () => {
    const briefing = (captions: string[]) => mission({ briefing: { sceneId: 'x', captions } });
    expect(briefing([]).success).toBe(false);
    expect(briefing(['   ']).success).toBe(false);
    expect(briefing(['a', 'b', 'c']).success).toBe(true);
    expect(briefing(['a', 'b', 'c', 'd']).success).toBe(false);
  });

  it('needs a full three-rung hint ladder on every step', () => {
    const twoHints = { ...firstStep, hints: ['a question', 'a concept'] };
    // @ts-expect-error: the type system already refuses a two-hint ladder; the schema must too.
    expect(mission({ steps: [twoHints] }).success).toBe(false);
    expect(mission({ steps: [] }).success).toBe(false);
  });

  it('has 5 to 10 drills', () => {
    const drills = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        ...firstDrill,
        id: `drill-${String(index)}`,
      }));
    expect(mission({ drills: drills(4) }).success).toBe(false);
    expect(mission({ drills: drills(10) }).success).toBe(true);
    expect(mission({ drills: drills(11) }).success).toBe(false);
  });

  it('rejects duplicate step, drill, and candidate ids', () => {
    expect(problems(mission({ steps: [firstStep, firstStep] }))).toEqual(['Duplicate id "init".']);
    const drills = [...sampleMissionInput.drills.slice(0, 4), firstDrill];
    expect(problems(mission({ drills }))).toEqual(['Duplicate id "sample-init".']);
    const round = sampleMissionInput.questionRound;
    const candidates = [...round.candidates.slice(0, 5), first(round.candidates)];
    expect(problems(mission({ questionRound: { ...round, candidates } }))).toEqual([
      'Duplicate id "when-lost".',
    ]);
  });

  it('builds the Question Round DESIGN.md describes', () => {
    const round = sampleMissionInput.questionRound;
    const withRound = (changes: object) => mission({ questionRound: { ...round, ...changes } });
    expect(withRound({ candidates: round.candidates.slice(0, 5) }).success).toBe(false);
    const oneStrong = round.candidates.map((candidate) => ({ ...candidate, quality: 'okay' }));
    expect(problems(withRound({ candidates: oneStrong }))).toEqual([
      'A Question Round needs at least 2 strong candidates.',
    ]);
    expect(withRound({ pickLimit: 4 }).success).toBe(false);
    expect(withRound({ ticket: { ...round.ticket, from: 'Sage' } }).success).toBe(false);
  });
});

describe('ActSchema', () => {
  it('accepts the sample act and fills in defaults', () => {
    expect(sampleAct).toMatchObject({ earlyAccess: false, upcoming: [] });
    expect(sampleAct.placementTest.passPercent).toBe(PLACEMENT_PASS_PERCENT);
    expect(sampleAct.boss.twists[0]?.apply).toEqual([]);
    const bossWithoutRules = { ...sampleActInput.boss, failIf: undefined };
    const parsed = ActSchema.parse({ ...sampleActInput, boss: bossWithoutRules });
    expect(requireBoss(parsed).failIf).toEqual([]);
  });

  it('needs a placement test, a boss, and a Field Mission, naming each one missing', () => {
    expect(problems(act({ boss: undefined }))).toEqual([
      'A finished Act needs a boss. Set earlyAccess until then.',
    ]);
    expect(problems(act({ placementTest: undefined, fieldMission: undefined }))).toEqual([
      'A finished Act needs a placement test. Set earlyAccess until then.',
      'A finished Act needs a Field Mission. Set earlyAccess until then.',
    ]);
  });

  it('has 3 to 6 missions (DESIGN.md section 5)', () => {
    const ids = (count: number) => Array.from({ length: count }, (_, i) => `mission-${String(i)}`);
    expect(act({ missionIds: ids(2) }).success).toBe(false);
    expect(act({ missionIds: ids(3) }).success).toBe(true);
    expect(act({ missionIds: ids(6) }).success).toBe(true);
    expect(act({ missionIds: ids(7) }).success).toBe(false);
  });

  it('has 8 to 12 placement drills at 85% (DESIGN.md section 5)', () => {
    const placement = (drillIds: string[], passPercent?: number) =>
      act({ placementTest: { pitch: 'Know this already?', drillIds, passPercent } });
    const ids = (count: number) => Array.from({ length: count }, (_, i) => `drill-${String(i)}`);
    expect(placement(ids(7)).success).toBe(false);
    expect(placement(ids(12)).success).toBe(true);
    expect(placement(ids(13)).success).toBe(false);
    expect(placement(ids(8), 50).success).toBe(false);
  });

  it('needs a pitch for the placement test, shown in the Act menu', () => {
    const drillIds = Array.from({ length: 8 }, (_, i) => `drill-${String(i)}`);
    expect(act({ placementTest: { drillIds } }).success).toBe(false);
    expect(act({ placementTest: { pitch: '', drillIds } }).success).toBe(false);
  });

  it('needs objectives and at least one twist, fired after the clock starts', () => {
    const boss = sampleActInput.boss;
    const late = { ...boss, twists: [{ atSecondsRemaining: 180, message: 'Too late.' }] };
    expect(problems(act({ boss: late }))).toEqual([
      'A twist must fire after the boss starts, so before the full time limit.',
    ]);
    expect(act({ boss: { ...boss, twists: [] } }).success).toBe(false);
    expect(act({ boss: { ...boss, twists: undefined } }).success).toBe(false);
    expect(act({ boss: { ...boss, objectives: [] } }).success).toBe(false);
  });

  it('matches each Field Mission check with output that can answer it', () => {
    const field = sampleActInput.fieldMission;
    const verify = (parser: string, check: object) =>
      act({
        fieldMission: {
          ...field,
          verifications: [{ id: 'v', instruction: 'Paste it.', command: 'git log', parser, check }],
        },
      });
    expect(problems(verify('status-short', { kind: 'minCommits', count: 3 }))).toEqual([
      'A "minCommits" check needs log-oneline output.',
    ]);
    expect(verify('log-oneline', { kind: 'minCommits', count: 3 }).success).toBe(true);
    expect(verify('status-long', { kind: 'ignores', patterns: ['.env'] }).success).toBe(true);
    expect(verify('status-short', { kind: 'noTrackedSecrets' }).success).toBe(true);
    expect(verify('log-oneline', { kind: 'conventionalRatio', min: 1.5, last: 5 }).success).toBe(
      false,
    );
    expect(verify('status-short', { kind: 'ignores', patterns: [] }).success).toBe(false);
    expect(verify('ls-files', { kind: 'clean' }).success).toBe(false);
  });

  it('rejects duplicate checklist and verification ids', () => {
    const field = sampleActInput.fieldMission;
    const item = first(field.checklist);
    const check = first(field.verifications);
    const result = act({
      fieldMission: { ...field, checklist: [item, item], verifications: [check, check] },
    });
    expect(problems(result)).toEqual(['Duplicate id "commit-work".', 'Duplicate id "status".']);
  });
});

describe('early access', () => {
  it('ships an Act with its first missions, adding the boss and Field Mission when built', () => {
    const early = ActSchema.parse(earlyActInput);
    expect(early).toMatchObject({ earlyAccess: true, missionIds: ['early-three-rooms'] });
    expect([early.placementTest, early.boss, early.fieldMission]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    const { boss, fieldMission } = sampleActInput;
    expect(earlyAct({ boss, fieldMission }).success).toBe(true);
  });

  it('has no placement test, because testing out would skip unbuilt missions', () => {
    expect(problems(earlyAct({ placementTest: sampleActInput.placementTest }))).toEqual([
      'An early-access Act has no placement test yet.',
    ]);
  });

  it('counts upcoming missions toward the limit of 6', () => {
    const titles = (count: number) => Array.from({ length: count }, (_, i) => `M${String(i)}`);
    expect(earlyAct({ upcoming: titles(5) }).success).toBe(true);
    expect(problems(earlyAct({ missionIds: ['a', 'b'], upcoming: titles(5) }))).toEqual([
      'An Act has at most 6 missions, counting the upcoming ones.',
    ]);
  });

  it('must be over before an Act is finished: every part, and nothing upcoming', () => {
    const setEarlyAccess = (message: string) => `${message} Set earlyAccess until then.`;
    expect(problems(earlyAct({ earlyAccess: false }))).toEqual([
      setEarlyAccess('A finished Act needs 3 to 6 missions.'),
      setEarlyAccess('A finished Act needs a placement test.'),
      setEarlyAccess('A finished Act needs a boss.'),
      setEarlyAccess('A finished Act needs a Field Mission.'),
      'Only an early-access Act has upcoming missions.',
    ]);
  });
});

describe("an Act's parts", () => {
  it('are handed out when the Act has them', () => {
    expect(requirePlacement(sampleAct)).toBe(sampleAct.placementTest);
    expect(requireBoss(sampleAct)).toBe(sampleAct.boss);
    expect(requireFieldMission(sampleAct)).toBe(sampleAct.fieldMission);
    expect(requireComplete(sampleAct)).toEqual(sampleAct);
  });

  it('throw a ContentError when they are not built yet', () => {
    const bare: Act = {
      ...sampleAct,
      placementTest: undefined,
      boss: undefined,
      fieldMission: undefined,
    };
    expect(() => requirePlacement(bare)).toThrow('Act 2 has no placement test yet.');
    expect(() => requireBoss(bare)).toThrow('Act 2 has no boss yet.');
    expect(() => requireFieldMission(bare)).toThrow('Act 2 has no Field Mission yet.');
    expect(() => requireComplete(bare)).toThrow(ContentError);
  });
});
