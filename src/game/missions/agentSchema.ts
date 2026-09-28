import { z } from 'zod';
import {
  checkUniqueIds,
  countWords,
  FixtureStepSchema,
  IdSchema,
  NameSchema,
  PredicateSchema,
  QUALITIES,
  RepoPathSchema,
  ScreenTextSchema,
} from './schemaParts';

/**
 * Schemas for a directed step (docs/act1-directed.md section 5.2): Kyle picks a request
 * card, Otto runs its script through the real shell, then Kyle checks Otto's claim.
 *
 * Otto is content, not an AI: his plans, lines, claims and slips are all written here as
 * data, so every path can be tested and the game works without a key. Nothing in this
 * file decides whether Kyle was right. The engine does that by checking predicates
 * against the sandbox, the same way Act 2 grades a typed step.
 */

/** The four parts of a good request to an agent. A card lights up the ones it covers. */
export const ANATOMY = ['goal', 'place', 'limits', 'check'] as const;
export type AnatomyPart = (typeof ANATOMY)[number];

/** Real agent mistakes, named the same way everywhere (docs/act1-directed.md section 1.2). */
export const SLIPS = [
  'wrong-place',
  'overclaim',
  'too-broad',
  'wrong-verb',
  'leak',
  'stale-terminal',
  'shell-mixup',
  'big-hammer',
  'invented-fact',
  'moved-goalposts',
] as const;
export type Slip = (typeof SLIPS)[number];

/**
 * Which of Otto's lines pause for Kyle's approval, like a real agent's permission modes.
 * `destructive` pauses on deletes, replaced files, moves, saved variables and stopped
 * processes; `changes` also pauses on every new file or append.
 */
export const APPROVAL_MODES = ['changes', 'destructive'] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

/** Otto keeps it short: upbeat, literal, and readable at a glance. */
export const OTTO_LINE_WORDS = 12;

/** A PowerShell line Otto types. It is code, so it doesn't count toward the screen-word limit. */
const CommandLineSchema = z.string().trim().min(1).max(200);

const OttoLineSchema = ScreenTextSchema.refine((text) => countWords(text) <= OTTO_LINE_WORDS, {
  error: `Otto speaks in ${String(OTTO_LINE_WORDS)} words or fewer.`,
});

/** PowerShell's Confirm choices: Yes, Yes to All, No, No to All. Otto answers for himself. */
const ConfirmAnswerSchema = z.enum(['Y', 'A', 'N', 'L']);

/**
 * Changes applied to a sandbox the player is already in: a step's `before` and a boss
 * twist. Unlike a setup, laptop steps like `cd` may come first here, because the laptop
 * already exists. That's also why windows(), which builds a laptop, is refused.
 */
export const ChangeStepsSchema = z
  .array(FixtureStepSchema)
  .readonly()
  .superRefine((steps, ctx) => {
    steps.forEach((step, index) => {
      if (step.op === 'windows') {
        ctx.addIssue({
          code: 'custom',
          path: [index],
          message: 'windows() starts a sandbox; it cannot change one.',
        });
      }
    });
  });

/** What happens when a line runs. A predict option is right when its outcome holds. */
export const OutcomeSchema = z
  .strictObject({
    result: z.enum(['ok', 'error']).optional(),
    /** The real output contains this text, ignoring case. */
    printed: z.string().min(1).optional(),
    state: PredicateSchema.optional(),
  })
  .refine((o) => o.result !== undefined || o.printed !== undefined || o.state !== undefined, {
    error: 'Say what the outcome is: a result, printed text, or a state.',
  });

const runFields = {
  do: z.literal('run'),
  line: CommandLineSchema,
  /** Otto's answer if PowerShell asks its Confirm question. Tests require it on every line that asks. */
  answer: ConfirmAnswerSchema.optional(),
  /** A slip on purpose: tests require a non-zero exit here, and exit 0 on every other line. */
  fails: z.literal(true).optional(),
  say: OttoLineSchema.optional(),
};
const writeFields = {
  /** Otto's file tool: writes a whole file, shown as a diff on a gate. */
  do: z.literal('write'),
  path: RepoPathSchema,
  content: z.string(),
  say: OttoLineSchema.optional(),
};
const terminalActions = [
  z.strictObject({ do: z.literal('newTerminal'), say: OttoLineSchema.optional() }),
  z.strictObject({
    do: z.literal('useTerminal'),
    tab: z.int().min(1).max(6),
    say: OttoLineSchema.optional(),
  }),
] as const;

/**
 * An action with no predict and no deny branch of its own: what Otto does after a deny,
 * and later, what drill scenes and fix options play. Its lines still pause for approval
 * when the approval mode says so.
 */
export const BaseActionSchema = z.discriminatedUnion('do', [
  z.strictObject(runFields),
  z.strictObject(writeFields),
  ...terminalActions,
]);

const PredictSchema = z
  .strictObject({
    question: ScreenTextSchema,
    options: z
      .array(z.strictObject({ id: IdSchema, text: ScreenTextSchema, outcome: OutcomeSchema }))
      .min(2)
      .max(4),
  })
  .superRefine((predict, ctx) => {
    checkUniqueIds(predict.options, 'options', ctx);
  });

const denyFields = {
  /** What Otto does instead when Kyle denies. Empty: Otto stops and asks for new directions. */
  onDeny: z.array(BaseActionSchema).max(4).default([]),
  denyLine: OttoLineSchema.optional(),
};

/**
 * One action in a plan's script. Each option is written out in full, rather than built by
 * filtering a shared list, so TypeScript infers the exact type of every field.
 */
export const AgentActionSchema = z.discriminatedUnion('do', [
  z.strictObject({
    ...runFields,
    /** Kyle predicts what the line will do before it runs. */
    predict: PredictSchema.optional(),
    /** Pause for approval even when the dry run shows nothing risky. */
    ask: z.literal(true).optional(),
    ...denyFields,
  }),
  z.strictObject({ ...writeFields, ...denyFields }),
  ...terminalActions,
]);

/** A request card Kyle can give Otto, and everything that follows from picking it. */
export const PlanSchema = z.strictObject({
  id: IdSchema,
  /** What Kyle tells Otto: one card. validateAct keeps it to 12 words. */
  text: ScreenTextSchema,
  /** Like a Question Round candidate: teaching, shown after the step. Never used for grading. */
  quality: z.enum(QUALITIES),
  /** Which parts of a good request this card has: lit on the Result screen. */
  covers: z.array(z.enum(ANATOMY)).min(1).max(ANATOMY.length),
  /** Phrases that mean this plan, for matching Kyle's own words offline. Never shown. */
  intents: z.array(z.string().trim().min(2)).min(2),
  script: z.array(AgentActionSchema).min(1).max(8),
  /** Otto's report. It may be wrong on purpose: catching that is the lesson. */
  claim: OttoLineSchema,
  /** Why this direction worked or didn't. validateAct keeps it to 25 words. */
  lesson: ScreenTextSchema,
  slip: z.enum(SLIPS).optional(),
});

const CheckOptionSchema = z.strictObject({
  id: IdSchema,
  text: ScreenTextSchema,
  /** When this option is the right answer. The engine decides, never a flag. */
  truth: PredicateSchema,
  /** Shown on a miss or a false alarm. validateAct keeps it to 25 words. */
  feedback: ScreenTextSchema,
});

/** A read-only line Kyle can have Otto run while checking his claim, like Get-Location. */
const LookSchema = z.strictObject({ id: IdSchema, label: NameSchema, line: CommandLineSchema });

/** A directed step's `agent` field: the cards, the check, and what must stay true. */
export const AgentTaskSchema = z
  .strictObject({
    /** Applied when the step starts, e.g. restartTerminals, so every path starts the same. */
    before: ChangeStepsSchema.default([]),
    /** One line of story shown with the goal, like why the terminal is fresh. */
    note: ScreenTextSchema.optional(),
    /** Folders the world must show for this step. */
    focus: z.array(RepoPathSchema).max(4).default([]),
    /** The cards Kyle first picks from. */
    plans: z.array(PlanSchema).min(2).max(3),
    /** Extra cards for a fix round, offered with the start plans not tried yet. */
    fixes: z.array(PlanSchema).min(1).max(3),
    /** The start plan the last hint points at. It must be strong. */
    hintPlan: IdSchema,
    check: z
      .strictObject({
        question: ScreenTextSchema,
        options: z.array(CheckOptionSchema).min(2).max(4),
      })
      .superRefine((check, ctx) => {
        // Checked here, not on the task, so a duplicate points at check.options[i].id.
        checkUniqueIds(check.options, 'options', ctx);
      }),
    /** Must stay true. Denying a line is right exactly when a dry run of it breaks one. */
    guards: z.array(PredicateSchema).max(4).default([]),
    looks: z.array(LookSchema).max(3).default([]),
  })
  .superRefine((task, ctx) => {
    checkUniqueIds(task.plans, 'plans', ctx);
    checkUniqueIds(task.fixes, 'fixes', ctx);
    // A fix round offers fixes beside untried start plans, and play remembers which
    // were tried by id, so an id may be used only once across both lists.
    const startIds = new Set(task.plans.map((plan) => plan.id));
    task.fixes.forEach((fix, index) => {
      if (startIds.has(fix.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['fixes', index, 'id'],
          message: `Duplicate id "${fix.id}": a start plan uses it.`,
        });
      }
    });
    checkUniqueIds(task.looks, 'looks', ctx);
    const hint = task.plans.find((plan) => plan.id === task.hintPlan);
    if (hint?.quality !== 'strong') {
      ctx.addIssue({
        code: 'custom',
        path: ['hintPlan'],
        message: 'hintPlan must name a strong start plan.',
      });
    }
  });

export type AgentTask = z.output<typeof AgentTaskSchema>;
/** What a content file writes: fields with defaults may be left out. */
export type AgentTaskInput = z.input<typeof AgentTaskSchema>;
export type Plan = z.output<typeof PlanSchema>;
export type AgentAction = z.output<typeof AgentActionSchema>;
export type BaseAction = z.output<typeof BaseActionSchema>;
export type Outcome = z.output<typeof OutcomeSchema>;
