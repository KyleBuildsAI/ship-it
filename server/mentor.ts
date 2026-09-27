import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { MentorPrompts } from './prompts';
import {
  gradeReplySchema,
  type GradeQuestionContext,
  type GradeReply,
  type HintContext,
  type HintReply,
} from './protocol';
import type { TokenCounts } from './usage';

/** What Sage can do. The HTTP routes only know this interface, never the SDK. */
export interface Mentor {
  hint: (context: HintContext) => Promise<HintReply>;
  gradeQuestion: (context: GradeQuestionContext) => Promise<GradeReply>;
}

/** The only parts of an Anthropic response the mentor reads. Tests build these by hand. */
export type ModelResponse = Pick<Anthropic.Message, 'content' | 'stop_reason'> & {
  usage: Pick<Anthropic.Usage, 'input_tokens' | 'output_tokens'>;
};

export interface MentorOptions {
  /** In the real server this is client.messages.create. Tests pass a fake. */
  createMessage: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<ModelResponse>;
  model: string;
  prompts: MentorPrompts;
  /** Called with the token counts of every response, even ones that fail validation. */
  onUsage: (tokens: TokenCounts) => void;
}

/** A failure the player should hear about in plain words. status is the HTTP answer. */
export class MentorError extends Error {
  readonly status: 502 | 503 | 504;

  constructor(message: string, status: 502 | 503 | 504 = 502, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MentorError';
    this.status = status;
  }
}

// max_tokens covers thinking as well as the answer, so these leave room for both. The
// visible answers are tiny (about 60 words); the prompts, not these caps, keep them short.
const HINT_MAX_TOKENS = 4096;
const GRADE_MAX_TOKENS = 4096;

/** The prompt asks for 60 words. This hard stop protects the UI if the model overshoots. */
export const HINT_WORD_LIMIT = 80;

// Built once: turns the zod schema into the JSON schema Anthropic's structured outputs
// feature uses to guarantee the grade comes back as JSON with exactly these fields.
const GRADE_OUTPUT_FORMAT = zodOutputFormat(gradeReplySchema);

export function limitWords(text: string, maxWords: number): string {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) return trimmed;
  return `${words.slice(0, maxWords).join(' ')}…`;
}

export function hintUserMessage(context: HintContext): string {
  const commands =
    context.recentCommands.length > 0 ? context.recentCommands.join('\n') : '(none yet)';
  const status = context.gitStatus.trim() === '' ? '(no output)' : context.gitStatus;
  return [
    `<mission>${context.missionTitle}</mission>`,
    `<step>${context.stepInstruction}</step>`,
    `<recent_commands>\n${commands}\n</recent_commands>`,
    `<git_status>\n${status}\n</git_status>`,
    `Give Kyle a level ${String(context.level)} hint.`,
  ].join('\n\n');
}

export function gradeUserMessage(context: GradeQuestionContext): string {
  return [
    `<ticket_title>${context.ticket.title}</ticket_title>`,
    `<ticket_body>\n${context.ticket.body}\n</ticket_body>`,
    `<rubric>\n${context.rubric}\n</rubric>`,
    `<question>${context.question}</question>`,
    "Grade Kyle's question.",
  ].join('\n\n');
}

/**
 * Structured outputs guarantee valid JSON with the right fields, but not every rule: the
 * 0-3 range is only a hint to the model. So the reply is still checked here, and garbage
 * becomes a clear error instead of a broken grade on screen.
 */
export function parseGrade(raw: string): GradeReply {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new MentorError('Sage returned a grade that was not valid JSON.', 502, { cause: error });
  }
  const result = gradeReplySchema.safeParse(json);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'grade'}: ${issue.message}`)
      .join('; ');
    throw new MentorError(`Sage returned a grade in the wrong shape (${problems}).`);
  }
  return result.data;
}

function textOf(response: ModelResponse): string {
  // With thinking on, content also holds thinking blocks. Only text blocks are the answer.
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/** Turns SDK errors into messages that tell Kyle what to do next. */
function toMentorError(error: unknown, model: string): MentorError {
  const options = { cause: error };
  // Most specific classes first: the timeout class is a kind of connection error.
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new MentorError('Anthropic took too long to answer. Try again.', 504, options);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new MentorError("Sage couldn't reach Anthropic. Check your connection.", 502, options);
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new MentorError(
      'Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env, then restart the server.',
      502,
      options,
    );
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new MentorError(
      `Anthropic doesn't recognize the model "${model}". Check MENTOR_MODEL_DEFAULT in .env.`,
      502,
      options,
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new MentorError('Anthropic is rate-limiting Sage. Wait a minute.', 503, options);
  }
  if (error instanceof Anthropic.APIError) {
    return new MentorError(`Anthropic returned an error: ${error.message}`, 502, options);
  }
  return new MentorError('Sage hit an unexpected problem calling Anthropic.', 502, options);
}

export function createAnthropicMentor(options: MentorOptions): Mentor {
  const { createMessage, model, prompts, onUsage } = options;

  async function callModel(
    params: Omit<Anthropic.MessageCreateParamsNonStreaming, 'model'>,
  ): Promise<ModelResponse> {
    let response: ModelResponse;
    try {
      response = await createMessage({ ...params, model });
    } catch (error) {
      throw toMentorError(error, model);
    }
    // Tokens were spent even if the answer turns out unusable, so count them first.
    onUsage({
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
    if (response.stop_reason === 'refusal') {
      throw new MentorError("Sage can't help with that one. The pre-written hints still work.");
    }
    if (response.stop_reason === 'max_tokens') {
      throw new MentorError('Sage ran out of room mid-answer. Ask again.');
    }
    return response;
  }

  return {
    hint: async (context) => {
      const response = await callModel({
        system: prompts.hint,
        max_tokens: HINT_MAX_TOKENS,
        // Low effort: a 60-word hint needs little deliberation, and the browser gives up
        // after 20 seconds, so speed matters more than depth here.
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: hintUserMessage(context) }],
      });
      const text = limitWords(textOf(response), HINT_WORD_LIMIT);
      if (text === '') throw new MentorError('Sage returned an empty hint. Ask again.');
      return { level: context.level, text };
    },

    gradeQuestion: async (context) => {
      const response = await callModel({
        system: prompts.grade_question,
        max_tokens: GRADE_MAX_TOKENS,
        // Grading weighs the question against a rubric, so it gets a bit more thought.
        output_config: { effort: 'medium', format: GRADE_OUTPUT_FORMAT },
        messages: [{ role: 'user', content: gradeUserMessage(context) }],
      });
      return parseGrade(textOf(response));
    },
  };
}
