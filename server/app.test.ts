import { describe, expect, it, vi } from 'vitest';
import { createApp, isDrillTagged } from './app';
import { MentorError, type Mentor } from './mentor';
import type { GradeQuestionContext, HintContext } from './protocol';
import { createTestLogger } from './testLogger';
import type { UsageStore } from './usage';

const MODELS = { default: 'claude-sonnet-5', interview: 'claude-opus-5-5' };

const HINT_CONTEXT: HintContext = {
  missionTitle: 'Three Rooms',
  stepInstruction: 'Stage app.ts.',
  level: 2,
  recentCommands: ['git status'],
  gitStatus: 'Untracked files:\n  app.ts',
};

const GRADE_CONTEXT: GradeQuestionContext = {
  ticket: { title: 'Make it faster', body: 'It is slow.' },
  question: 'Which page is slow?',
  rubric: 'Pins down the page and a target.',
};

/** An in-memory usage counter, so route tests don't touch the disk. */
function fakeUsage(cap = 5): UsageStore {
  let calls = 0;
  return {
    dailyCallCap: cap,
    current: () => ({ date: '2026-09-27', calls, inputTokens: 0, outputTokens: 0 }),
    tryReserveCall: () => {
      if (calls >= cap) return Promise.resolve(false);
      calls += 1;
      return Promise.resolve(true);
    },
    recordTokens: () => Promise.resolve(),
  };
}

function fakeMentor() {
  return {
    hint: vi.fn<Mentor['hint']>((context) =>
      Promise.resolve({ level: context.level, text: 'Look at the Loading Dock.' }),
    ),
    gradeQuestion: vi.fn<Mentor['gradeQuestion']>(() =>
      Promise.resolve({
        score: 2,
        whyItMatters: 'It narrows scope.',
        betterVersion: 'Which page?',
      }),
    ),
  } satisfies Mentor;
}

function setup(options: { mentor?: Mentor | null; cap?: number } = {}) {
  const mentor = options.mentor === undefined ? fakeMentor() : options.mentor;
  const usage = fakeUsage(options.cap);
  const logger = createTestLogger();
  const app = createApp({ models: MODELS, usage, mentor, logger });
  return { app, usage, logger };
}

function postMentor(
  app: ReturnType<typeof setup>['app'],
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request('/api/mentor', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('GET /api/health', () => {
  it('reports the key, models, and today’s usage', async () => {
    const { app } = setup();

    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      keyConfigured: true,
      models: MODELS,
      usage: { date: '2026-09-27', calls: 0, cap: 5 },
    });
  });

  it('says the key is missing when there is no mentor', async () => {
    const { app } = setup({ mentor: null });

    const response = await app.request('/api/health');

    expect(await response.json()).toMatchObject({ ok: true, keyConfigured: false });
  });
});

describe('localhost guard', () => {
  it('refuses a request whose Host is not this computer (DNS rebinding)', async () => {
    const { app } = setup();

    const response = await app.request('http://evil.example:8787/api/health');

    expect(response.status).toBe(403);
  });

  it.each(['https://evil.example', 'null'])('refuses the Origin %s', async (origin) => {
    const { app } = setup();

    const response = await app.request('/api/health', { headers: { origin } });

    expect(response.status).toBe(403);
  });

  it.each(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://[::1]:5173'])(
    'accepts the local Origin %s',
    async (origin) => {
      const { app } = setup();

      const response = await app.request('http://127.0.0.1:8787/api/health', {
        headers: { origin },
      });

      expect(response.status).toBe(200);
    },
  );
});

describe('POST /api/mentor', () => {
  it('answers a hint request', async () => {
    const mentor = fakeMentor();
    const { app, usage, logger } = setup({ mentor });

    const response = await postMentor(app, { mode: 'hint', context: HINT_CONTEXT });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ level: 2, text: 'Look at the Loading Dock.' });
    expect(mentor.hint).toHaveBeenCalledWith(HINT_CONTEXT);
    expect(usage.current().calls).toBe(1);
    expect(logger.info).toHaveBeenCalledWith('hint answered (1/5 today)');
  });

  it('answers a grade_question request', async () => {
    const mentor = fakeMentor();
    const { app } = setup({ mentor });

    const response = await postMentor(app, { mode: 'grade_question', context: GRADE_CONTEXT });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ score: 2 });
    expect(mentor.gradeQuestion).toHaveBeenCalledWith(GRADE_CONTEXT);
  });

  describe('drills', () => {
    it.each([
      ['a drill session id', { mode: 'hint', context: HINT_CONTEXT, drillSessionId: 'drill-1' }],
      ['context.inDrill', { mode: 'hint', context: { ...HINT_CONTEXT, inDrill: true } }],
      ['a drill tag on an otherwise invalid body', { mode: 'nope', drillSessionId: 'drill-1' }],
    ])('refuses a request tagged with %s without spending a call', async (_label, body) => {
      const mentor = fakeMentor();
      const { app, usage } = setup({ mentor });

      const response = await postMentor(app, body);

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: 'Sage is off during No-AI Drills and placement tests.',
      });
      expect(mentor.hint).not.toHaveBeenCalled();
      expect(usage.current().calls).toBe(0);
    });

    it('allows inDrill: false', async () => {
      const { app } = setup();

      const response = await postMentor(app, {
        mode: 'hint',
        context: { ...HINT_CONTEXT, inDrill: false },
      });

      expect(response.status).toBe(200);
    });
  });

  describe('validation', () => {
    it('rejects a body that is not JSON', async () => {
      const { app } = setup();

      const response = await postMentor(app, '{"mode": ');

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'The request body must be JSON.' });
    });

    it.each([
      ['an unknown mode', { mode: 'interview', context: HINT_CONTEXT }],
      ['a hint level of 4', { mode: 'hint', context: { ...HINT_CONTEXT, level: 4 } }],
      ['a missing context', { mode: 'grade_question' }],
      [
        'an empty question',
        { mode: 'grade_question', context: { ...GRADE_CONTEXT, question: '' } },
      ],
      ['a JSON array', [1, 2, 3]],
    ])('rejects %s with a 400 that names the problem', async (_label, body) => {
      const mentor = fakeMentor();
      const { app, usage } = setup({ mentor });

      const response = await postMentor(app, body);

      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: string }).error).toMatch(
        /^Invalid mentor request/,
      );
      expect(usage.current().calls).toBe(0);
    });

    it('rejects a body over the size limit before parsing it', async () => {
      const { app } = setup();
      const huge = { mode: 'hint', context: { ...HINT_CONTEXT, gitStatus: 'x'.repeat(40_000) } };

      const response = await postMentor(app, huge);

      expect(response.status).toBe(413);
    });
  });

  it('answers 503 offline when no API key is configured', async () => {
    const { app } = setup({ mentor: null });

    const response = await postMentor(app, { mode: 'hint', context: HINT_CONTEXT });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ offline: true });
  });

  it('answers 429 with a friendly message once the daily cap is used up', async () => {
    const mentor = fakeMentor();
    const { app } = setup({ mentor, cap: 1 });
    await postMentor(app, { mode: 'hint', context: HINT_CONTEXT });

    const response = await postMentor(app, { mode: 'hint', context: HINT_CONTEXT });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error:
        "Sage has used all 1 of today's calls. The count resets at midnight. Pre-written hints still work.",
    });
    expect(mentor.hint).toHaveBeenCalledOnce();
  });

  it('passes a MentorError message and status through, and logs the cause', async () => {
    const mentor = fakeMentor();
    mentor.hint.mockRejectedValue(
      new MentorError('Anthropic took too long to answer. Try again.', 504, {
        cause: new Error('Request timed out.'),
      }),
    );
    const { app, logger } = setup({ mentor });

    const response = await postMentor(app, { mode: 'hint', context: HINT_CONTEXT });

    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({
      error: 'Anthropic took too long to answer. Try again.',
    });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Request timed out.'));
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const mentor = fakeMentor();
    mentor.gradeQuestion.mockRejectedValue(new Error('secret internal detail'));
    const { app, logger } = setup({ mentor });

    const response = await postMentor(app, { mode: 'grade_question', context: GRADE_CONTEXT });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Sage hit an unexpected error.' });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('secret internal detail'));
  });
});

it('answers unknown routes with a JSON 404', async () => {
  const { app } = setup();

  const response = await app.request('/api/nope');

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: 'Not found.' });
});

describe('isDrillTagged', () => {
  it.each([null, 'hint', 42, { context: null }, { context: { inDrill: 'yes' } }])(
    'is false for %j',
    (body) => {
      expect(isDrillTagged(body)).toBe(false);
    },
  );
});
