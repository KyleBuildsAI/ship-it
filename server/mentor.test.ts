import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import {
  createAnthropicMentor,
  gradeUserMessage,
  HINT_WORD_LIMIT,
  hintUserMessage,
  limitWords,
  MentorError,
  type MentorOptions,
  type ModelResponse,
} from './mentor';
import type { GradeQuestionContext, HintContext } from './protocol';

const HINT_CONTEXT: HintContext = {
  missionTitle: 'Three Rooms',
  stepInstruction: 'Stage app.ts so it is ready to commit.',
  level: 1,
  recentCommands: ['git status', 'git add app'],
  gitStatus: 'Untracked files:\n  app.ts',
};

const GRADE_CONTEXT: GradeQuestionContext = {
  ticket: { title: 'Make the dashboard faster', body: 'Users say it is slow.' },
  question: 'Which page is slow, and how slow is it today?',
  rubric: 'Strong questions pin down which page and a measurable target.',
};

function textResponse(text: string, overrides: Partial<ModelResponse> = {}): ModelResponse {
  return {
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 120, output_tokens: 30 },
    ...overrides,
  };
}

function setup(respond: MentorOptions['createMessage']) {
  const createMessage = vi.fn(respond);
  const onUsage = vi.fn<MentorOptions['onUsage']>();
  const mentor = createAnthropicMentor({
    createMessage,
    model: 'claude-sonnet-5',
    prompts: { hint: 'HINT SYSTEM PROMPT', grade_question: 'GRADE SYSTEM PROMPT' },
    onUsage,
  });
  return { mentor, createMessage, onUsage };
}

function firstRequest(createMessage: ReturnType<typeof setup>['createMessage']) {
  const params = createMessage.mock.calls[0]?.[0];
  if (!params) throw new Error('createMessage was never called');
  return params;
}

describe('limitWords', () => {
  it('keeps short text as it is, minus outer whitespace', () => {
    expect(limitWords('  Stage it first.\n', 5)).toBe('Stage it first.');
  });

  it('cuts long text at the word limit and marks the cut', () => {
    expect(limitWords('one two three four', 2)).toBe('one two…');
  });
});

describe('prompt messages', () => {
  it('wraps each piece of hint context in its own tag and names the level', () => {
    const message = hintUserMessage({ ...HINT_CONTEXT, level: 2 });

    expect(message).toContain('<mission>Three Rooms</mission>');
    expect(message).toContain('<recent_commands>\ngit status\ngit add app\n</recent_commands>');
    expect(message).toContain('<git_status>\nUntracked files:\n  app.ts\n</git_status>');
    expect(message).toContain('level 2 hint');
  });

  it('says so when there are no commands or status output yet', () => {
    const message = hintUserMessage({ ...HINT_CONTEXT, recentCommands: [], gitStatus: ' ' });

    expect(message).toContain('(none yet)');
    expect(message).toContain('(no output)');
  });

  it('includes the ticket, rubric, and question for grading', () => {
    const message = gradeUserMessage(GRADE_CONTEXT);

    expect(message).toContain('<ticket_title>Make the dashboard faster</ticket_title>');
    expect(message).toContain('Strong questions pin down');
    expect(message).toContain('<question>Which page is slow');
  });
});

describe('hint', () => {
  it('sends the hint prompt with the configured model and returns the requested level', async () => {
    const { mentor, createMessage, onUsage } = setup(() =>
      Promise.resolve(textResponse('What does git status say about app.ts?')),
    );

    const reply = await mentor.hint(HINT_CONTEXT);

    expect(reply).toEqual({ level: 1, text: 'What does git status say about app.ts?' });
    const params = firstRequest(createMessage);
    expect(params.model).toBe('claude-sonnet-5');
    expect(params.system).toBe('HINT SYSTEM PROMPT');
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 120, outputTokens: 30 });
  });

  it('ignores thinking blocks and joins the text blocks', async () => {
    const { mentor } = setup(() =>
      Promise.resolve({
        content: [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'text', text: 'Look at ', citations: null },
          { type: 'text', text: 'the Loading Dock.', citations: null },
        ],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );

    expect((await mentor.hint(HINT_CONTEXT)).text).toBe('Look at the Loading Dock.');
  });

  it('trims a hint that runs past the word limit', async () => {
    const rambling = Array.from({ length: HINT_WORD_LIMIT + 20 }, () => 'word').join(' ');
    const { mentor } = setup(() => Promise.resolve(textResponse(rambling)));

    const { text } = await mentor.hint(HINT_CONTEXT);

    expect(text.split(' ')).toHaveLength(HINT_WORD_LIMIT);
    expect(text.endsWith('…')).toBe(true);
  });

  it('rejects an empty hint', async () => {
    const { mentor } = setup(() => Promise.resolve(textResponse('   ')));

    await expect(mentor.hint(HINT_CONTEXT)).rejects.toThrow('empty hint');
  });

  it('turns a refusal into a friendly error but still counts the tokens', async () => {
    const { mentor, onUsage } = setup(() =>
      Promise.resolve(textResponse('', { stop_reason: 'refusal' })),
    );

    await expect(mentor.hint(HINT_CONTEXT)).rejects.toThrow(MentorError);
    expect(onUsage).toHaveBeenCalledOnce();
  });

  it('reports an answer cut off by max_tokens', async () => {
    const { mentor } = setup(() =>
      Promise.resolve(textResponse('Try', { stop_reason: 'max_tokens' })),
    );

    await expect(mentor.hint(HINT_CONTEXT)).rejects.toThrow('ran out of room');
  });
});

describe('gradeQuestion', () => {
  const GOOD_GRADE = {
    score: 3,
    whyItMatters: 'It pins down the page and a target, which decides the whole fix.',
    betterVersion: 'Which page feels slow, and what load time would count as fixed?',
  };

  it('asks for structured JSON output and returns the validated grade', async () => {
    const { mentor, createMessage } = setup(() =>
      Promise.resolve(textResponse(JSON.stringify(GOOD_GRADE))),
    );

    const grade = await mentor.gradeQuestion(GRADE_CONTEXT);

    expect(grade).toEqual(GOOD_GRADE);
    const params = firstRequest(createMessage);
    expect(params.system).toBe('GRADE SYSTEM PROMPT');
    expect(params.output_config?.effort).toBe('medium');
    expect(params.output_config?.format?.type).toBe('json_schema');
    expect(params.output_config?.format?.schema).toMatchObject({
      properties: { score: { type: 'integer' } },
      required: ['score', 'whyItMatters', 'betterVersion'],
    });
  });

  it('refuses a reply that is not JSON', async () => {
    const { mentor } = setup(() => Promise.resolve(textResponse('Score: 3/3, nice!')));

    await expect(mentor.gradeQuestion(GRADE_CONTEXT)).rejects.toThrow('not valid JSON');
  });

  it.each([
    ['a score above 3', { ...GOOD_GRADE, score: 5 }],
    ['a fractional score', { ...GOOD_GRADE, score: 2.5 }],
    ['a missing field', { score: 2, whyItMatters: 'Because.' }],
    ['an empty explanation', { ...GOOD_GRADE, whyItMatters: '' }],
    ['an array instead of an object', [GOOD_GRADE]],
  ])('refuses JSON with %s', async (_label, grade) => {
    const { mentor } = setup(() => Promise.resolve(textResponse(JSON.stringify(grade))));

    await expect(mentor.gradeQuestion(GRADE_CONTEXT)).rejects.toThrow('wrong shape');
  });
});

describe('Anthropic errors', () => {
  const headers = new Headers();

  it.each([
    [
      'a rejected key',
      new Anthropic.AuthenticationError(401, undefined, 'invalid x-api-key', headers),
      502,
      'ANTHROPIC_API_KEY',
    ],
    [
      'a key without access',
      new Anthropic.PermissionDeniedError(403, undefined, 'permission denied', headers),
      502,
      'ANTHROPIC_API_KEY',
    ],
    [
      'an unknown model',
      new Anthropic.NotFoundError(404, undefined, 'model not found', headers),
      502,
      'claude-sonnet-5',
    ],
    [
      'rate limiting',
      new Anthropic.RateLimitError(429, undefined, 'slow down', headers),
      503,
      'rate-limiting',
    ],
    [
      'a timeout',
      new Anthropic.APIConnectionTimeoutError({ message: 'timed out' }),
      504,
      'too long',
    ],
    [
      'no connection',
      new Anthropic.APIConnectionError({ message: 'ENOTFOUND' }),
      502,
      "couldn't reach",
    ],
    [
      'a server error',
      new Anthropic.InternalServerError(500, undefined, 'overloaded', headers),
      502,
      'overloaded',
    ],
    ['an unknown failure', new TypeError('boom'), 502, 'unexpected problem'],
  ])('explains %s in plain words', async (_label, error, status, fragment) => {
    const { mentor, onUsage } = setup(() => Promise.reject(error));

    const failure = await mentor.hint(HINT_CONTEXT).catch((caught: unknown) => caught);

    expect(failure).toBeInstanceOf(MentorError);
    expect(failure).toMatchObject({ status, cause: error });
    expect((failure as MentorError).message).toContain(fragment);
    expect(onUsage).not.toHaveBeenCalled();
  });
});
