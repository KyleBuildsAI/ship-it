import { z } from 'zod';
import { ACT_COUNT } from './roadmapSchema';
import { checkUniqueIds, countWords, IdSchema, NameSchema } from './schemaParts';

/*
 * Lessons: missions played by clicking, never typing (DESIGN.md section 5.5). They teach
 * the Acts whose systems the game does not simulate, like GitHub's team flow, CI, or how
 * the web works, by putting Kyle in a situation and asking what he'd do or tell his AI
 * agent. A lesson is a short briefing, then a run of cards, each answered with a click.
 *
 * Like every content schema, every object is a `strictObject`: a misspelled field is an
 * error when the game loads, not a silently missing piece of a card.
 */

/**
 * Word limits for each piece of a card. A card shows a situation, maybe an artifact, a
 * question and its options together, so each gets a slice of DESIGN.md pillar 1's 60
 * words. Prompt options may run longer: a good instruction to an agent has detail.
 */
export const LESSON_WORDS = {
  caption: 30,
  situation: 40,
  question: 25,
  option: 25,
  promptOption: 40,
  feedback: 30,
  explanation: 45,
  step: 15,
  /** The situation and the question, read together before the options. */
  cardScreen: 60,
} as const;

/** An artifact is shown in a scrolling box, so it's measured in lines, not words. */
export const ARTIFACT_MAX_LINES = 30;
export const ARTIFACT_MAX_CHARS = 2400;

/** Text with a word limit of its own, non-empty and trimmed. */
function words(limit: number) {
  return z
    .string()
    .trim()
    .min(1)
    .refine((text) => countWords(text) <= limit, {
      error: `Keep this to ${String(limit)} words or fewer, so it reads at a glance.`,
    });
}

/** What kind of thing an artifact is. The view labels the box with it. */
export const ARTIFACT_KINDS = [
  'diff',
  'log',
  'terminal',
  'pull-request',
  'agent-message',
  'code',
  'file',
  'request',
  'response',
  'error',
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** Something to read before answering: a diff, a CI log, an agent's report. */
export const ArtifactSchema = z.strictObject({
  kind: z.enum(ARTIFACT_KINDS),
  /** A short caption above the box, like "PR #42" or "ci.yml". Defaults to the kind. */
  label: NameSchema.optional(),
  text: z
    .string()
    .min(1)
    .max(ARTIFACT_MAX_CHARS)
    .refine((text) => text.split('\n').length <= ARTIFACT_MAX_LINES, {
      error: `Keep an artifact to ${String(ARTIFACT_MAX_LINES)} lines; show only the part that matters.`,
    }),
});
export type Artifact = z.output<typeof ArtifactSchema>;

/** The fields every card shares: where we are, what to look at, and why the answer is right. */
const cardBase = {
  id: IdSchema,
  situation: words(LESSON_WORDS.situation),
  artifact: ArtifactSchema.optional(),
  question: words(LESSON_WORDS.question),
  /** Shown after the card is solved: why, in plain words. */
  explanation: words(LESSON_WORDS.explanation),
};

/** One option of a choose or prompt card. Its feedback shows when it's picked. */
function optionSchema(textLimit: number) {
  return z.strictObject({
    id: IdSchema,
    text: words(textLimit),
    correct: z.boolean(),
    feedback: words(LESSON_WORDS.feedback),
  });
}

/** Options need unique ids, at least one right answer, and at least one wrong one. */
function checkOptions(
  card: { options: readonly { id: string; correct: boolean }[] },
  ctx: z.RefinementCtx,
): void {
  checkUniqueIds(card.options, 'options', ctx);
  if (!card.options.some((option) => option.correct)) {
    ctx.addIssue({
      code: 'custom',
      path: ['options'],
      message: 'Mark at least one option correct.',
    });
  }
  if (card.options.every((option) => option.correct)) {
    ctx.addIssue({
      code: 'custom',
      path: ['options'],
      message: 'At least one option must be wrong, or the card teaches nothing.',
    });
  }
}

/** The situation and question share one screen, so together they keep to its budget. */
function checkScreen(card: { situation: string; question: string }, ctx: z.RefinementCtx): void {
  const total = countWords(card.situation) + countWords(card.question);
  if (total > LESSON_WORDS.cardScreen) {
    ctx.addIssue({
      code: 'custom',
      path: ['situation'],
      message: `The situation and question are ${String(total)} words together; the limit is ${String(LESSON_WORDS.cardScreen)}.`,
    });
  }
}

/** "What would you do?": pick the right option from 3 to 5. */
export const ChooseCardSchema = z
  .strictObject({
    ...cardBase,
    kind: z.literal('choose'),
    options: z.array(optionSchema(LESSON_WORDS.option)).min(3).max(5),
  })
  .superRefine((card, ctx) => {
    checkOptions(card, ctx);
    checkScreen(card, ctx);
  });

/** "Which instruction would you give the AI agent?": the options are prompts. */
export const PromptCardSchema = z
  .strictObject({
    ...cardBase,
    kind: z.literal('prompt'),
    options: z.array(optionSchema(LESSON_WORDS.promptOption)).min(3).max(5),
  })
  .superRefine((card, ctx) => {
    checkOptions(card, ctx);
    checkScreen(card, ctx);
  });

/** Put the steps in order. Content lists them in the right order; the game scrambles them. */
export const OrderCardSchema = z
  .strictObject({
    ...cardBase,
    kind: z.literal('order'),
    steps: z
      .array(z.strictObject({ id: IdSchema, text: words(LESSON_WORDS.step) }))
      .min(3)
      .max(6),
  })
  .superRefine((card, ctx) => {
    checkUniqueIds(card.steps, 'steps', ctx);
    // Two steps with the same text would make two different orders look identical.
    const texts = card.steps.map((step) => step.text);
    if (new Set(texts).size !== texts.length) {
      ctx.addIssue({ code: 'custom', path: ['steps'], message: 'Two steps say the same thing.' });
    }
    checkScreen(card, ctx);
  });

// A plain union, not a discriminated one: each card schema has a refinement attached, and
// zod only discriminates on plain objects. `kind` still tells them apart, so it's exact.
export const CardSchema = z.union([ChooseCardSchema, PromptCardSchema, OrderCardSchema]);

export type ChooseCard = z.output<typeof ChooseCardSchema>;
export type PromptCard = z.output<typeof PromptCardSchema>;
export type OrderCard = z.output<typeof OrderCardSchema>;
export type LessonCard = z.output<typeof CardSchema>;
export type PickCard = ChooseCard | PromptCard;
export type CardOption = PickCard['options'][number];

/** Whether a card is answered by picking an option, rather than by ordering steps. */
export function isPickCard(card: LessonCard): card is PickCard {
  return card.kind !== 'order';
}

/** The XP a lesson pays when no number is given: about a mission's worth. */
export const DEFAULT_LESSON_XP = 60;

export const LESSON_KINDS = ['lesson', 'final'] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

export const LessonSchema = z
  .strictObject({
    id: IdSchema,
    act: z.int().min(1).max(ACT_COUNT),
    title: NameSchema,
    /** 'final' is the Act's timed final challenge: every card shares one clock. */
    kind: z.enum(LESSON_KINDS).default('lesson'),
    briefing: z.array(words(LESSON_WORDS.caption)).min(2).max(3),
    cards: z.array(CardSchema).min(6).max(10),
    xp: z.int().positive().default(DEFAULT_LESSON_XP),
    /** Only a final has a clock, and it's for the whole lesson, not each card. */
    timeLimitSeconds: z.int().min(30).max(1800).optional(),
  })
  .superRefine((lesson, ctx) => {
    checkUniqueIds(lesson.cards, 'cards', ctx);
    if (lesson.kind === 'final' && lesson.timeLimitSeconds === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['timeLimitSeconds'],
        message: 'A final lesson needs a timeLimitSeconds for its clock.',
      });
    }
    if (lesson.kind === 'lesson' && lesson.timeLimitSeconds !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['timeLimitSeconds'],
        message: 'Only a final lesson has a clock. Set kind: "final" or remove the limit.',
      });
    }
  });

export type Lesson = z.output<typeof LessonSchema>;
export type LessonInput = z.input<typeof LessonSchema>;
