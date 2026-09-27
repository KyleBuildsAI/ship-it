import { describe, expect, it } from 'vitest';
import { repo } from '../../engine/git/fixtures';
import {
  ActSchema,
  countWords,
  DEFAULT_DRILL_SECONDS,
  FixtureStepSchema,
  MissionSchema,
  PICK_LIMIT,
  PLACEMENT_PASS_PERCENT,
  PredicateSchema,
  regexProblem,
  type MissionInput,
} from './schema';
import {
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
    const result = PredicateSchema.safeParse({ kind: 'headMessage', pattern: 'x', flags: 'g' });
    expect(problems(result)[0]).toMatch(/g and y make test\(\) stateful/);
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
    const goneButFull = { kind: 'workingFile', path: 'a.ts', exists: false, contains: 'x' };
    expect(problems(PredicateSchema.safeParse(goneButFull))).toEqual([
      'A file that must not exist cannot also have content to check.',
    ]);
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
  });

  it('wants kebab-case ids', () => {
    expect(mission({ id: 'Three Rooms' }).success).toBe(false);
    expect(mission({ id: 'three-rooms-2' }).success).toBe(true);
  });

  it('keeps on-screen text within 60 words (DESIGN.md pillar 1)', () => {
    const longCaption = { ...sampleMissionInput.briefing, captions: [words(61)] };
    expect(problems(mission({ briefing: longCaption }))[0]).toMatch(/60 words or fewer/);
    expect(mission({ briefing: { ...longCaption, captions: [words(60)] } }).success).toBe(true);
    const longStep = { ...firstStep, instruction: words(61) };
    expect(mission({ steps: [longStep] }).success).toBe(false);
    const longDrill = { ...firstDrill, prompt: words(61) };
    expect(mission({ drills: [...sampleMissionInput.drills.slice(1), longDrill] }).success).toBe(
      false,
    );
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
    expect(sampleAct.placementTest.passPercent).toBe(PLACEMENT_PASS_PERCENT);
    expect(sampleAct.boss.twists[0]?.apply).toEqual([]);
    const bossWithoutRules = { ...sampleActInput.boss, failIf: undefined };
    expect(ActSchema.parse({ ...sampleActInput, boss: bossWithoutRules }).boss.failIf).toEqual([]);
  });

  it('has 8 to 12 placement drills at 85% (DESIGN.md section 5)', () => {
    const placement = (drillIds: string[], passPercent?: number) =>
      act({ placementTest: { drillIds, passPercent } });
    const ids = (count: number) => Array.from({ length: count }, (_, i) => `drill-${String(i)}`);
    expect(placement(ids(7)).success).toBe(false);
    expect(placement(ids(12)).success).toBe(true);
    expect(placement(ids(13)).success).toBe(false);
    expect(placement(ids(8), 50).success).toBe(false);
  });

  it('only allows twists after the boss clock starts', () => {
    const boss = sampleActInput.boss;
    const late = { ...boss, twists: [{ atSecondsRemaining: 180, message: 'Too late.' }] };
    expect(problems(act({ boss: late }))).toEqual([
      'A twist must fire after the boss starts, so before the full time limit.',
    ]);
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
