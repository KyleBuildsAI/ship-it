import { z } from 'zod';
import {
  checkUniqueIds,
  countWords,
  IdSchema,
  PredicateSchema,
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

export type AgentAction = z.output<typeof AgentActionSchema>;
export type BaseAction = z.output<typeof BaseActionSchema>;
export type Outcome = z.output<typeof OutcomeSchema>;
