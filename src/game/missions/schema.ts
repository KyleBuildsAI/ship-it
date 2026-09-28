import { z } from 'zod';
import {
  checkUniqueIds,
  FixtureSchema,
  IdSchema,
  NameSchema,
  PredicateSchema,
  QUALITIES,
  ScreenTextSchema,
} from './schemaParts';

/**
 * Schemas for mission content (DESIGN.md sections 5 and 10). Missions are data, so a
 * typo in a mission file should fail a test, not crash the game halfway through Act 2.
 * Each schema checks one object on its own; `validateAct` checks the links between them.
 *
 * Every object is a `strictObject`, so an unknown key is an error. A plain `z.object`
 * quietly drops unknown keys: the typo `exist: false` would vanish and turn the check
 * "workingFile, exists: false" (the file must be gone) into "the file must exist".
 *
 * The building blocks these schemas share (on-screen text, ids, paths, setups, and
 * predicates) live in schemaParts.ts.
 */

// Re-exported so every file that imported these from schema.ts before they moved still can.
export {
  countWords,
  FIXTURE_SCHEMA_MATCHES_ENGINE,
  FixtureStepSchema,
  MAX_SCREEN_WORDS,
  PREDICATE_SCHEMA_MATCHES_DSL,
  PredicateSchema,
  QUALITIES,
  regexProblem,
  type Quality,
} from './schemaParts';

// ---- Missions -------------------------------------------------------------------------

const CaptionsSchema = z.array(ScreenTextSchema).min(1).max(3);

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

const PlacementSchema = z.strictObject({
  /** One line in the Act menu for players who may know this already. */
  pitch: z.string().min(1),
  /** Drills borrowed from this Act's missions (DESIGN.md section 5: 8-12 scenarios). */
  drillIds: z.array(IdSchema).min(8).max(12),
  passPercent: z.literal(PLACEMENT_PASS_PERCENT).default(PLACEMENT_PASS_PERCENT),
});

/** DESIGN.md section 5: an Act has 3 to 6 missions. In early access it may have fewer so far. */
const MIN_MISSIONS = 3;
const MAX_MISSIONS = 6;

/**
 * An Act is either finished, with every part, or in early access: it ships the missions
 * built so far, and its boss and Field Mission once they exist. The parts are optional in
 * the shape and required by the refinement below, so each rule can say what's missing.
 */
export const ActSchema = z
  .strictObject({
    act: z.int().positive(),
    title: NameSchema,
    /** Ships before it is finished. It never counts as complete while this is true. */
    earlyAccess: z.boolean().default(false),
    missionIds: z.array(IdSchema).min(1).max(MAX_MISSIONS),
    /** Titles of missions still being built, shown as "Coming soon" in early access. */
    upcoming: z.array(NameSchema).default([]),
    placementTest: PlacementSchema.optional(),
    boss: BossSchema.optional(),
    fieldMission: FieldMissionSchema.optional(),
  })
  .superRefine((act, ctx) => {
    const problem = (path: string, message: string) => {
      ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (act.missionIds.length + act.upcoming.length > MAX_MISSIONS) {
      problem('upcoming', 'An Act has at most 6 missions, counting the upcoming ones.');
    }
    if (act.earlyAccess) {
      // Testing out completes every mission, and some of this Act's aren't built yet.
      if (act.placementTest !== undefined) {
        problem('placementTest', 'An early-access Act has no placement test yet.');
      }
      return;
    }
    const needs = (path: string, part: string) => {
      problem(path, `A finished Act needs ${part}. Set earlyAccess until then.`);
    };
    if (act.missionIds.length < MIN_MISSIONS) needs('missionIds', '3 to 6 missions');
    if (act.placementTest === undefined) needs('placementTest', 'a placement test');
    if (act.boss === undefined) needs('boss', 'a boss');
    if (act.fieldMission === undefined) needs('fieldMission', 'a Field Mission');
    if (act.upcoming.length > 0) {
      problem('upcoming', 'Only an early-access Act has upcoming missions.');
    }
  });

export type Act = z.output<typeof ActSchema>;
export type ActInput = z.input<typeof ActSchema>;
export type PlacementTest = NonNullable<Act['placementTest']>;
export type Boss = NonNullable<Act['boss']>;
export type BossTwist = Boss['twists'][number];
export type FieldMission = NonNullable<Act['fieldMission']>;
/** A finished Act, with every part there. Act 2 is one. */
export type CompleteAct = Act & {
  placementTest: PlacementTest;
  boss: Boss;
  fieldMission: FieldMission;
};

/**
 * Thrown when code asks an Act for a part it doesn't have yet, like an unbuilt boss.
 * Play should only ever offer parts that exist, so this is a bug, not play.
 */
export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentError';
  }
}

function missing(act: Act, part: string): ContentError {
  return new ContentError(`Act ${String(act.act)} has no ${part} yet.`);
}

export function requirePlacement(act: Act): PlacementTest {
  if (act.placementTest === undefined) throw missing(act, 'placement test');
  return act.placementTest;
}

export function requireBoss(act: Act): Boss {
  if (act.boss === undefined) throw missing(act, 'boss');
  return act.boss;
}

export function requireFieldMission(act: Act): FieldMission {
  if (act.fieldMission === undefined) throw missing(act, 'Field Mission');
  return act.fieldMission;
}

/** The same Act, typed as finished, so content and tests can use its parts directly. */
export function requireComplete(act: Act): CompleteAct {
  return {
    ...act,
    placementTest: requirePlacement(act),
    boss: requireBoss(act),
    fieldMission: requireFieldMission(act),
  };
}
