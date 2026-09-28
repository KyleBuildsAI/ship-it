import { z } from 'zod';
import { resolvePath } from '../../engine/fs/paths';
import type { FixtureStep } from '../../engine/git/fixtures';
import type { Predicate } from './predicates';

/**
 * Schemas for mission content (DESIGN.md sections 5 and 10). Missions are data, so a
 * typo in a mission file should fail a test, not crash the game halfway through Act 2.
 * Each schema checks one object on its own; `validateAct` checks the links between them.
 *
 * Every object is a `strictObject`, so an unknown key is an error. A plain `z.object`
 * quietly drops unknown keys: the typo `exist: false` would vanish and turn the check
 * "workingFile, exists: false" (the file must be gone) into "the file must exist".
 */

// ---- Shared building blocks ---------------------------------------------------------

/** DESIGN.md pillar 1: never more than about 60 words on screen at once. */
export const MAX_SCREEN_WORDS = 60;

export function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word !== '').length;
}

/** Text the player reads on screen: non-empty and within the word budget. */
const ScreenTextSchema = z
  .string()
  .trim()
  .min(1)
  .refine((text) => countWords(text) <= MAX_SCREEN_WORDS, {
    error: `Keep on-screen text to ${String(MAX_SCREEN_WORDS)} words or fewer (DESIGN.md pillar 1).`,
  });

const NameSchema = z.string().trim().min(1);

/** Ids end up in save files and URLs, so they use one predictable shape: `three-rooms`. */
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IdSchema = z.string().regex(KEBAB_CASE, 'Use a kebab-case id like "three-rooms".');

/**
 * A file path inside the sandbox in the engine's one canonical form: `src/app.ts`, never
 * `./src/app.ts`, `/src/app.ts`, or `src\app.ts`. A path is canonical when resolving it
 * from the project root changes nothing.
 */
const RepoPathSchema = z
  .string()
  .min(1)
  .refine((path) => resolvePath('', path) === path, {
    error: 'Write paths from the project root with forward slashes, like "src/app.ts".',
  });

const PathListSchema = z.array(RepoPathSchema).min(1);

const CaptionsSchema = z.array(ScreenTextSchema).min(1).max(3);

// ---- Fixture steps --------------------------------------------------------------------

/** A Windows environment variable name, like PORT or ProgramFiles(x86). */
const EnvNameSchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_()]*$/, 'Use an environment variable name like "PORT".');

const EnvScopeSchema = z.enum(['session', 'user', 'machine']);

/** Mirrors the engine's `FixtureStep` union, so mission setups are checked before replay. */
export const FixtureStepSchema = z.discriminatedUnion('op', [
  z
    .strictObject({
      op: z.literal('windows'),
      user: NameSchema,
      computer: NameSchema,
      mount: RepoPathSchema.optional(),
    })
    .readonly(),
  z.strictObject({ op: z.literal('mkdir'), path: RepoPathSchema }).readonly(),
  z.strictObject({ op: z.literal('session') }).readonly(),
  z.strictObject({ op: z.literal('cd'), path: RepoPathSchema }).readonly(),
  z
    .strictObject({
      op: z.literal('env'),
      scope: EnvScopeSchema,
      name: EnvNameSchema,
      value: z.string().nullable(),
    })
    .readonly(),
  z
    .strictObject({
      op: z.literal('pathAdd'),
      scope: EnvScopeSchema,
      dir: z.string().trim().min(1),
      at: z.enum(['start', 'end']),
    })
    .readonly(),
  z.strictObject({ op: z.literal('restartTerminals') }).readonly(),
  z.strictObject({ op: z.literal('init') }).readonly(),
  z.strictObject({ op: z.literal('write'), path: RepoPathSchema, content: z.string() }).readonly(),
  z.strictObject({ op: z.literal('append'), path: RepoPathSchema, text: z.string() }).readonly(),
  z.strictObject({ op: z.literal('delete'), path: RepoPathSchema }).readonly(),
  z.strictObject({ op: z.literal('stage'), paths: z.array(RepoPathSchema).readonly() }).readonly(),
  z.strictObject({ op: z.literal('commit'), message: NameSchema }).readonly(),
]);

/**
 * True only when A and B are the same type, readonly modifiers included. The unused-
 * looking T is the trick: TypeScript only treats these two generic function types as
 * equal when A and B are identical, which is stricter than "each fits into the other".
 */
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- T is the trick above. */
type SameType<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */

/**
 * A compile-time proof, checked by `npm run typecheck`: if the engine adds or changes a
 * FixtureStep, this line stops compiling until the schema above is updated to match.
 */
export const FIXTURE_SCHEMA_MATCHES_ENGINE: SameType<
  z.output<typeof FixtureStepSchema>,
  FixtureStep
> = true;

const MACHINE_ONLY_OPS = new Set(['mkdir', 'session', 'cd', 'env', 'pathAdd', 'restartTerminals']);

/**
 * A whole setup. windows() may only come first, and the laptop steps (folders, terminals,
 * variables) only make sense after it, so a misplaced step fails validation instead of
 * the game.
 */
// Readonly so content can pass a builder's `.toSpec()` result straight in.
const FixtureSchema = z
  .array(FixtureStepSchema)
  .readonly()
  .superRefine((steps, context) => {
    const onLaptop = steps[0]?.op === 'windows';
    steps.forEach((step, index) => {
      if (step.op === 'windows' && index > 0) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: 'windows() must be the first step.',
        });
      }
      if (!onLaptop && MACHINE_ONLY_OPS.has(step.op)) {
        context.addIssue({
          code: 'custom',
          path: [index],
          message: `The "${step.op}" step needs windows() as the first step.`,
        });
      }
    });
  });

// ---- Predicates -----------------------------------------------------------------------

/**
 * `g` and `y` are left out on purpose: they make `RegExp.test()` remember where it last
 * matched, so checking the same message twice could give two different answers.
 */
const RegexFlagsSchema = z
  .string()
  .regex(/^[imsu]*$/, 'Only the i, m, s, and u flags are allowed. g and y make test() stateful.');

/** Why a pattern won't compile, or null when it's fine. */
export function regexProblem(pattern: string, flags = ''): string | null {
  try {
    new RegExp(pattern, flags);
    return null;
  } catch (error) {
    // The RegExp constructor throws a SyntaxError that names the problem; pass it on.
    return error instanceof Error ? error.message : String(error);
  }
}

/** Rejects a bad regular expression when the mission loads, not when a player is mid-drill. */
function checkRegex(
  value: { pattern: string; flags?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  const problem = regexProblem(value.pattern, value.flags);
  if (problem !== null) {
    ctx.addIssue({ code: 'custom', message: `Invalid regex: ${problem}`, path: ['pattern'] });
  }
}

const labelled = { label: ScreenTextSchema.optional() };
const regexFields = { pattern: z.string().min(1), flags: RegexFlagsSchema.optional() };
// Recursion goes through z.lazy, which waits until parse time to read PredicateSchema,
// because PredicateSchema doesn't exist yet while this list is being built.
const nested = z.lazy(() => PredicateSchema);

const predicateKinds = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('isRepo'), ...labelled }),
  z.strictObject({ kind: z.literal('clean'), ...labelled }),
  z.strictObject({
    kind: z.literal('staged'),
    paths: PathListSchema,
    exact: z.boolean().optional(),
    ...labelled,
  }),
  z.strictObject({ kind: z.literal('notStaged'), paths: PathListSchema, ...labelled }),
  z.strictObject({ kind: z.literal('untracked'), paths: PathListSchema, ...labelled }),
  z.strictObject({ kind: z.literal('tracked'), paths: PathListSchema, ...labelled }),
  z.strictObject({ kind: z.literal('notTracked'), paths: PathListSchema, ...labelled }),
  z.strictObject({ kind: z.literal('ignored'), paths: PathListSchema, ...labelled }),
  z.strictObject({ kind: z.literal('modified'), paths: PathListSchema, ...labelled }),
  z
    .strictObject({
      kind: z.literal('commitCount'),
      min: z.int().nonnegative().optional(),
      max: z.int().nonnegative().optional(),
      equals: z.int().nonnegative().optional(),
      ...labelled,
    })
    .superRefine((value, ctx) => {
      const { min, max, equals } = value;
      if (min === undefined && max === undefined && equals === undefined) {
        ctx.addIssue({ code: 'custom', message: 'Give at least one of min, max, or equals.' });
      }
      if (min !== undefined && max !== undefined && min > max) {
        ctx.addIssue({ code: 'custom', message: 'min is larger than max.', path: ['min'] });
      }
      // { equals: 3, min: 5 } can never pass, and describe() would only mention equals.
      if (equals !== undefined && (min !== undefined || max !== undefined)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Use equals on its own, or min and max without it.',
          path: ['equals'],
        });
      }
    }),
  z
    .strictObject({ kind: z.literal('headMessage'), ...regexFields, ...labelled })
    .superRefine(checkRegex),
  z
    .strictObject({
      kind: z.literal('allMessagesMatch'),
      ...regexFields,
      last: z.int().positive().optional(),
      ...labelled,
    })
    .superRefine(checkRegex),
  z.strictObject({
    kind: z.literal('fileAtHead'),
    path: RepoPathSchema,
    equals: z.string().optional(),
    contains: z.string().min(1).optional(),
    ...labelled,
  }),
  z
    .strictObject({
      kind: z.literal('workingFile'),
      path: RepoPathSchema,
      equals: z.string().optional(),
      contains: z.string().min(1).optional(),
      exists: z.boolean().optional(),
      ...labelled,
    })
    .superRefine((value, ctx) => {
      // "The file must be gone, and contain X" can never pass, so it's a content bug.
      if (value.exists === false && (value.equals !== undefined || value.contains !== undefined)) {
        ctx.addIssue({
          code: 'custom',
          message: 'A file that must not exist cannot also have content to check.',
          path: ['exists'],
        });
      }
    }),
  z.strictObject({
    kind: z.literal('commitChanged'),
    ref: NameSchema.optional(),
    paths: PathListSchema,
    only: z.boolean().optional(),
    ...labelled,
  }),
  z
    .strictObject({ kind: z.literal('reflogContains'), ...regexFields, ...labelled })
    .superRefine(checkRegex),
  z.strictObject({ kind: z.literal('headMessageIs'), message: NameSchema, ...labelled }),
  z.strictObject({ kind: z.literal('all'), of: z.array(nested).min(1), ...labelled }),
  z.strictObject({ kind: z.literal('any'), of: z.array(nested).min(1), ...labelled }),
  z.strictObject({ kind: z.literal('not'), predicate: nested, ...labelled }),
  // ---- The laptop (Act 1) ----
  // Paths start at C:\ ('Users/kyle/notes'). validateAct checks the setup is a windows() laptop.
  z.strictObject({
    kind: z.literal('currentDirectory'),
    path: RepoPathSchema,
    tab: z.union([z.int().positive(), z.literal('any')]).optional(),
    ...labelled,
  }),
  z.strictObject({
    kind: z.literal('driveFolder'),
    path: RepoPathSchema,
    exists: z.boolean().optional(),
    ...labelled,
  }),
  z
    .strictObject({
      kind: z.literal('driveFile'),
      path: RepoPathSchema,
      equals: z.string().optional(),
      contains: z.string().min(1).optional(),
      pattern: z.string().min(1).optional(),
      flags: RegexFlagsSchema.optional(),
      exists: z.boolean().optional(),
      ...labelled,
    })
    .superRefine((value, ctx) => {
      if (value.pattern !== undefined)
        checkRegex({ pattern: value.pattern, flags: value.flags }, ctx);
      // Flags only change how a pattern matches; on their own they would be ignored.
      if (value.flags !== undefined && value.pattern === undefined) {
        ctx.addIssue({ code: 'custom', message: 'flags need a pattern.', path: ['flags'] });
      }
      const content = [value.equals, value.contains, value.pattern].some(
        (check) => check !== undefined,
      );
      if (value.exists === false && content) {
        ctx.addIssue({
          code: 'custom',
          message: 'A file that must not exist cannot also have content to check.',
          path: ['exists'],
        });
      }
    }),
  z
    .strictObject({
      kind: z.literal('envVar'),
      name: EnvNameSchema,
      scope: z.enum([...EnvScopeSchema.options, 'newTerminal']).optional(),
      // Windows deletes a variable set to '', so an empty value can never be read back.
      equals: z.string().min(1).optional(),
      contains: z.string().min(1).optional(),
      exists: z.boolean().optional(),
      ...labelled,
    })
    .superRefine((value, ctx) => {
      if (value.exists === false && (value.equals !== undefined || value.contains !== undefined)) {
        ctx.addIssue({
          code: 'custom',
          message: 'A variable that must be unset cannot also have a value to check.',
          path: ['exists'],
        });
      }
    }),
]);

/** Validates the predicate language in `predicates.ts`, including nested all/any/not. */
export const PredicateSchema: z.ZodType<Predicate, Predicate> = predicateKinds;

/** The same compile-time proof as for fixtures: every Predicate kind has a schema. */
export const PREDICATE_SCHEMA_MATCHES_DSL: SameType<
  z.output<typeof predicateKinds>,
  Predicate
> = true;

// ---- Missions -------------------------------------------------------------------------

/** Rejects a list where two items share an id, pointing at the second one. */
function checkUniqueIds(items: readonly { id: string }[], where: string, ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate id "${item.id}".`,
        path: [where, index, 'id'],
      });
    }
    seen.add(item.id);
  });
}

/**
 * DESIGN.md section 6 gives XP for every completed step, so a step that doesn't say
 * how much still earns this. Content can raise it for a hard step, or set 0.
 */
export const DEFAULT_STEP_XP = 10;

const StepSchema = z.strictObject({
  id: IdSchema,
  instruction: ScreenTextSchema,
  success: PredicateSchema,
  /** The hint ladder: 1 a question back, 2 the concept, 3 the command. Never skipped. */
  hints: z.tuple([ScreenTextSchema, ScreenTextSchema, ScreenTextSchema]),
  xp: z.int().nonnegative().default(DEFAULT_STEP_XP),
});

export const DEFAULT_DRILL_SECONDS = 90;

const DrillSchema = z.strictObject({
  id: IdSchema,
  prompt: ScreenTextSchema,
  setup: FixtureSchema,
  success: PredicateSchema,
  timeLimitSeconds: z.int().positive().default(DEFAULT_DRILL_SECONDS),
  /** The idea this drill tests, e.g. "staging". The review queue and skill tree group by it. */
  concept: NameSchema,
});

export const QUALITIES = ['strong', 'okay', 'weak'] as const;
export type Quality = (typeof QUALITIES)[number];

const CandidateSchema = z.strictObject({
  id: IdSchema,
  text: ScreenTextSchema,
  /** Hidden until the round ends. */
  quality: z.enum(QUALITIES),
  /** Why this question is strong, okay, or weak. Shown after the picks are locked in. */
  rationale: ScreenTextSchema,
});

/** DESIGN.md section 5: Kyle picks up to 3 of the candidate questions. */
export const PICK_LIMIT = 3;

const QuestionRoundSchema = z
  .strictObject({
    ticket: z.strictObject({ from: z.literal('Marco'), title: NameSchema, body: ScreenTextSchema }),
    candidates: z.array(CandidateSchema).min(6).max(10),
    pickLimit: z.literal(PICK_LIMIT).default(PICK_LIMIT),
    /** What a strong free-text question covers. Sage grades against it; players never see it. */
    rubric: NameSchema,
  })
  .superRefine((round, ctx) => {
    checkUniqueIds(round.candidates, 'candidates', ctx);
    const strong = round.candidates.filter((candidate) => candidate.quality === 'strong');
    if (strong.length < 2) {
      ctx.addIssue({
        code: 'custom',
        message: 'A Question Round needs at least 2 strong candidates.',
        path: ['candidates'],
      });
    }
  });

export const MissionSchema = z
  .strictObject({
    id: IdSchema,
    act: z.int().positive(),
    title: NameSchema,
    /** Awarded once the whole mission is finished, on top of each step's XP. */
    xp: z.int().nonnegative(),
    briefing: z.strictObject({
      sceneId: NameSchema,
      captions: CaptionsSchema,
      /** The one diagram moment in the briefing (DESIGN.md section 5). */
      diagram: NameSchema.optional(),
    }),
    initialRepoState: FixtureSchema,
    steps: z.array(StepSchema).min(1),
    drills: z.array(DrillSchema).min(5).max(10),
    questionRound: QuestionRoundSchema,
  })
  .superRefine((mission, ctx) => {
    checkUniqueIds(mission.steps, 'steps', ctx);
    checkUniqueIds(mission.drills, 'drills', ctx);
  });

/** A mission after parsing: defaults like a drill's 90-second limit are filled in. */
export type Mission = z.output<typeof MissionSchema>;
/** What a content file writes: fields with defaults may be left out. */
export type MissionInput = z.input<typeof MissionSchema>;
export type MissionStep = Mission['steps'][number];
export type Drill = Mission['drills'][number];
export type Candidate = Mission['questionRound']['candidates'][number];

// ---- Acts -----------------------------------------------------------------------------

export const PLACEMENT_PASS_PERCENT = 85;

const TwistSchema = z.strictObject({
  /** Fires once, when the boss clock shows this many seconds or fewer. */
  atSecondsRemaining: z.int().positive(),
  message: ScreenTextSchema,
  /** Changes made to the player's sandbox when the twist fires. May be empty. */
  apply: FixtureSchema.default([]),
});

const BossSchema = z
  .strictObject({
    id: IdSchema,
    title: NameSchema,
    briefing: CaptionsSchema,
    setup: FixtureSchema,
    timeLimitSeconds: z.int().positive(),
    /** All must be true to win. */
    objectives: z.array(PredicateSchema).min(1),
    /** Any one true loses immediately, e.g. a secret committed. */
    failIf: z.array(PredicateSchema).default([]),
    /** DESIGN.md section 5: a boss is a timed scenario "with a twist", so at least one. */
    twists: z.array(TwistSchema).min(1),
  })
  .superRefine((boss, ctx) => {
    boss.twists.forEach((twist, index) => {
      if (twist.atSecondsRemaining >= boss.timeLimitSeconds) {
        ctx.addIssue({
          code: 'custom',
          message: 'A twist must fire after the boss starts, so before the full time limit.',
          path: ['twists', index, 'atSecondsRemaining'],
        });
      }
    });
  });

// ls-files lists every tracked file, changed or not, so only it can prove no secret is tracked.
export const FIELD_PARSERS = ['status-short', 'status-long', 'log-oneline', 'ls-files'] as const;
export type FieldParser = (typeof FIELD_PARSERS)[number];

/** What a Field Mission verifies in pasted PowerShell output. Evaluated by the parser module. */
export const FieldCheckSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('clean') }),
  /** At least `min` (0 to 1) of the newest `last` commits use Conventional Commit messages. */
  z.strictObject({
    kind: z.literal('conventionalRatio'),
    min: z.number().min(0).max(1),
    last: z.int().positive(),
  }),
  z.strictObject({ kind: z.literal('noTrackedSecrets') }),
  z.strictObject({ kind: z.literal('minCommits'), count: z.int().positive() }),
  z.strictObject({ kind: z.literal('ignores'), patterns: z.array(NameSchema).min(1) }),
]);
export type FieldCheck = z.output<typeof FieldCheckSchema>;

/**
 * Which pasted output can answer which check. `git log --oneline` says nothing about the
 * working tree, and `git status` says nothing about history, so a mismatch here means
 * the mission asks the player to paste output that can never pass.
 */
export const PARSERS_FOR_CHECK: Record<FieldCheck['kind'], readonly FieldParser[]> = {
  clean: ['status-short', 'status-long'],
  ignores: ['status-short', 'status-long'],
  noTrackedSecrets: ['ls-files', 'status-short', 'status-long'],
  conventionalRatio: ['log-oneline'],
  minCommits: ['log-oneline'],
};

const VerificationSchema = z
  .strictObject({
    id: IdSchema,
    instruction: ScreenTextSchema,
    /** Exactly what to run in PowerShell on the real repo, e.g. `git status --short`. */
    command: NameSchema,
    parser: z.enum(FIELD_PARSERS),
    check: FieldCheckSchema,
  })
  .superRefine((verification, ctx) => {
    const usable = PARSERS_FOR_CHECK[verification.check.kind];
    if (!usable.includes(verification.parser)) {
      ctx.addIssue({
        code: 'custom',
        message: `A "${verification.check.kind}" check needs ${usable.join(' or ')} output.`,
        path: ['parser'],
      });
    }
  });

const FieldMissionSchema = z
  .strictObject({
    id: IdSchema,
    title: NameSchema,
    /** The real repository this happens in, e.g. "SandCastles". */
    repoName: NameSchema,
    briefing: CaptionsSchema,
    checklist: z.array(z.strictObject({ id: IdSchema, text: ScreenTextSchema })).min(1),
    verifications: z.array(VerificationSchema).min(1),
  })
  .superRefine((field, ctx) => {
    checkUniqueIds(field.checklist, 'checklist', ctx);
    checkUniqueIds(field.verifications, 'verifications', ctx);
  });

export const ActSchema = z.strictObject({
  act: z.int().positive(),
  title: NameSchema,
  /** DESIGN.md section 5: each Act has 3 to 6 missions. */
  missionIds: z.array(IdSchema).min(3).max(6),
  placementTest: z.strictObject({
    /** One line in the Act menu for players who may know this already. */
    pitch: z.string().min(1),
    /** Drills borrowed from this Act's missions (DESIGN.md section 5: 8-12 scenarios). */
    drillIds: z.array(IdSchema).min(8).max(12),
    passPercent: z.literal(PLACEMENT_PASS_PERCENT).default(PLACEMENT_PASS_PERCENT),
  }),
  boss: BossSchema,
  fieldMission: FieldMissionSchema,
});

export type Act = z.output<typeof ActSchema>;
export type ActInput = z.input<typeof ActSchema>;
export type Boss = Act['boss'];
export type BossTwist = Boss['twists'][number];
export type FieldMission = Act['fieldMission'];
