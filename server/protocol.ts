import { z } from 'zod';

/*
 * The wire format between the game and the Sage server. The server validates every
 * request against these schemas. The browser client imports only the types (never the
 * schemas), so zod stays out of the game bundle while both sides share one definition.
 * A lint rule in eslint.config.js holds the game to type-only imports from server/.
 *
 * The length limits keep prompts small: every character sent to Anthropic costs tokens.
 * A request over any limit gets a 400. The mentor client sends context as given, so the
 * code that builds it (the mission runner) must trim first.
 */

/** 1 = a question back, 2 = the concept, 3 = the command with an explanation. */
export const hintLevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type HintLevel = z.infer<typeof hintLevelSchema>;

export const hintContextSchema = z.object({
  missionTitle: z.string().min(1).max(200),
  stepInstruction: z.string().min(1).max(2000),
  level: hintLevelSchema,
  /** Oldest first, and only the latest 20. */
  recentCommands: z.array(z.string().max(500)).max(20),
  gitStatus: z.string().max(8000),
  /** Set by the game during No-AI Drills and placement tests. true is always refused. */
  inDrill: z.boolean().optional(),
});
export type HintContext = z.infer<typeof hintContextSchema>;

export const gradeQuestionContextSchema = z.object({
  ticket: z.object({
    title: z.string().min(1).max(200),
    body: z.string().max(4000),
  }),
  question: z.string().min(1).max(1000),
  rubric: z.string().min(1).max(4000),
  inDrill: z.boolean().optional(),
});
export type GradeQuestionContext = z.infer<typeof gradeQuestionContextSchema>;

/**
 * A request tagged with drillSessionId comes from inside a drill. The server refuses
 * those before looking at anything else (DESIGN.md pillar 4: No-AI Drills are real).
 */
export const mentorRequestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('hint'),
    context: hintContextSchema,
    drillSessionId: z.string().optional(),
  }),
  z.object({
    mode: z.literal('grade_question'),
    context: gradeQuestionContextSchema,
    drillSessionId: z.string().optional(),
  }),
]);
export type MentorRequest = z.infer<typeof mentorRequestSchema>;
export type MentorMode = MentorRequest['mode'];

export interface HintReply {
  level: HintLevel;
  text: string;
}

/**
 * Also sent to Anthropic as the structured output schema, so the descriptions double
 * as instructions to the model.
 */
export const gradeReplySchema = z.object({
  score: z.int().min(0).max(3).describe('0 = not a clarifying question, 3 = strong'),
  whyItMatters: z
    .string()
    .min(1)
    .describe('What the question uncovers and why that matters for the build'),
  betterVersion: z.string().min(1).describe('A sharper version of the question, in his voice'),
});
export type GradeReply = z.infer<typeof gradeReplySchema>;

export interface HealthReply {
  ok: true;
  keyConfigured: boolean;
  models: { default: string; interview: string };
  usage: { date: string; calls: number; cap: number };
}

/** Every non-200 answer. offline: true means "use the pre-written fallback instead". */
export interface ErrorReply {
  error: string;
  offline?: true;
}
