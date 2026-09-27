import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthReply } from '../../server/protocol';
import { devStatus } from '../game/devStatus';
import {
  createMentorClient,
  fallbackHint,
  MENTOR_TIMEOUT_MS,
  nextHintLevel,
  type GradeQuestionContext,
  type HintContext,
} from './client';
import { beginDrill, endDrill } from './drillGuard';

const HINT_CONTEXT: HintContext = {
  missionTitle: 'Three Rooms',
  stepInstruction: 'Stage app.ts.',
  level: 1,
  recentCommands: [],
  gitStatus: '',
};

const GRADE_CONTEXT: GradeQuestionContext = {
  ticket: { title: 'Make it faster', body: 'It is slow.' },
  question: 'Which page?',
  rubric: 'Pins down the page.',
};

function health(overrides: Partial<HealthReply> = {}): HealthReply {
  return {
    ok: true,
    keyConfigured: true,
    models: { default: 'claude-sonnet-5', interview: 'claude-opus-5-5' },
    usage: { date: '2026-09-27', calls: 0, cap: 50 },
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type FetchInput = Parameters<typeof fetch>[0];

function pathOf(input: FetchInput): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.pathname : input.url;
}

/** Answers /api/health with `healthReply` and /api/mentor with `mentorReply`. */
function routeFetch(healthReply: () => Response, mentorReply: () => Response) {
  const fetchMock = vi.fn<typeof fetch>((input) =>
    Promise.resolve(pathOf(input) === '/api/health' ? healthReply() : mentorReply()),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The parsed JSON body of the first POST to /api/mentor. */
function sentMentorBody(fetchMock: ReturnType<typeof routeFetch>): unknown {
  const call = fetchMock.mock.calls.find(([input]) => pathOf(input) === '/api/mentor');
  const body = call?.[1]?.body;
  if (typeof body !== 'string') throw new Error('expected a JSON string body');
  return JSON.parse(body);
}

function mentorCalls(fetchMock: ReturnType<typeof routeFetch>) {
  return fetchMock.mock.calls.filter(([input]) => pathOf(input) === '/api/mentor');
}

const client = createMentorClient({ serverExpected: true });

beforeEach(() => {
  devStatus.update({ mentor: 'offline' });
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  endDrill();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('getMentorStatus', () => {
  it('reports online and lights the dev badge when a key is configured', async () => {
    routeFetch(
      () => json(health()),
      () => json({}),
    );

    const status = await client.getMentorStatus();

    expect(status).toEqual({ ...health(), offline: false });
    expect(devStatus.get().mentor).toBe('online');
  });

  it.each([
    ['no key is configured', health({ keyConfigured: false })],
    ['the daily cap is spent', health({ usage: { date: '2026-09-27', calls: 50, cap: 50 } })],
  ])('turns the badge offline when %s', async (_label, reply) => {
    routeFetch(
      () => json(reply),
      () => json({}),
    );
    // Start from online, so this test fails if the client forgets to update the badge.
    devStatus.update({ mentor: 'online' });

    const status = await client.getMentorStatus();

    expect(status.offline).toBe(false);
    expect(devStatus.get().mentor).toBe('offline');
  });

  it('never touches the network on a build without a Sage server', async () => {
    const fetchMock = routeFetch(
      () => json(health()),
      () => json({}),
    );
    const pagesClient = createMentorClient({ serverExpected: false });

    const status = await pagesClient.getMentorStatus();

    expect(status).toMatchObject({ offline: true, reason: 'no-server' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips even the health check while a drill is running', async () => {
    const fetchMock = routeFetch(
      () => json(health()),
      () => json({}),
    );
    devStatus.update({ mentor: 'online' });
    beginDrill('placement-act-2');

    const status = await client.getMentorStatus();

    expect(status).toMatchObject({ offline: true, reason: 'drill' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(devStatus.get().mentor).toBe('online');
  });

  it('goes offline quietly when the server cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const error = vi.spyOn(console, 'error');
    const warn = vi.spyOn(console, 'warn');
    devStatus.update({ mentor: 'online' });

    const status = await client.getMentorStatus();

    expect(status).toMatchObject({ offline: true, reason: 'unreachable' });
    expect(devStatus.get().mentor).toBe('offline');
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("treats the dev proxy's offline answer as an unreachable server", async () => {
    routeFetch(
      () => json({ offline: true, error: 'The Sage server is not running.' }),
      () => json({}),
    );

    expect(await client.getMentorStatus()).toMatchObject({ offline: true, reason: 'unreachable' });
  });

  it.each([
    ['an HTML error page', () => new Response('<html>oops</html>', { status: 500 })],
    ['a reply in the wrong shape', () => json({ ok: true, keyConfigured: 'yes' })],
  ])('reports an error for %s', async (_label, reply) => {
    routeFetch(reply, () => json({}));
    devStatus.update({ mentor: 'online' });

    expect(await client.getMentorStatus()).toMatchObject({ offline: true, reason: 'error' });
    expect(devStatus.get().mentor).toBe('offline');
  });

  it('gives up after the timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }),
      ),
    );

    const pending = client.getMentorStatus();
    await vi.advanceTimersByTimeAsync(MENTOR_TIMEOUT_MS);

    expect(await pending).toMatchObject({ offline: true, reason: 'timeout' });
  });
});

describe('askHint', () => {
  it('posts the hint request and returns the answer', async () => {
    const fetchMock = routeFetch(
      () => json(health()),
      () => json({ level: 1, text: 'What does git status say?' }),
    );

    const result = await client.askHint(HINT_CONTEXT);

    expect(result).toEqual({ level: 1, text: 'What does git status say?', offline: false });
    const [call] = mentorCalls(fetchMock);
    expect(call?.[1]?.method).toBe('POST');
    expect(sentMentorBody(fetchMock)).toEqual({ mode: 'hint', context: HINT_CONTEXT });
    expect(devStatus.get().mentor).toBe('online');
  });

  it('refuses to contact Sage at all while a drill is running', async () => {
    const fetchMock = routeFetch(
      () => json(health()),
      () => json({ level: 1, text: 'Nope' }),
    );
    beginDrill('drill-42');

    const result = await client.askHint(HINT_CONTEXT);

    expect(result).toMatchObject({ offline: true, reason: 'drill' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a context marked inDrill without contacting Sage', async () => {
    const fetchMock = routeFetch(
      () => json(health()),
      () => json({ level: 1, text: 'Nope' }),
    );

    const result = await client.askHint({ ...HINT_CONTEXT, inDrill: true });

    expect(result).toMatchObject({ offline: true, reason: 'drill' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('works again once the drill ends', async () => {
    routeFetch(
      () => json(health()),
      () => json({ level: 1, text: 'Back online.' }),
    );
    beginDrill('drill-42');
    endDrill();

    expect((await client.askHint(HINT_CONTEXT)).offline).toBe(false);
  });

  it.each([
    ['no key is configured', health({ keyConfigured: false }), 'no-key'],
    [
      'the cap is already spent',
      health({ usage: { date: '2026-09-27', calls: 5, cap: 5 } }),
      'daily-cap',
    ],
  ])('skips the request when %s', async (_label, reply, reason) => {
    const fetchMock = routeFetch(
      () => json(reply),
      () => json({}),
    );

    expect(await client.askHint(HINT_CONTEXT)).toMatchObject({ offline: true, reason });
    expect(mentorCalls(fetchMock)).toHaveLength(0);
  });

  it('passes the server message through when the cap is hit mid-session', async () => {
    routeFetch(
      () => json(health()),
      () => json({ error: 'Sage has answered 50 questions today.' }, 429),
    );

    expect(await client.askHint(HINT_CONTEXT)).toEqual({
      offline: true,
      reason: 'daily-cap',
      message: 'Sage has answered 50 questions today.',
    });
    expect(devStatus.get().mentor).toBe('offline');
  });

  it('treats a 503 offline answer as a missing key', async () => {
    routeFetch(
      () => json(health()),
      () => json({ offline: true, error: 'No key.' }, 503),
    );

    expect(await client.askHint(HINT_CONTEXT)).toMatchObject({ offline: true, reason: 'no-key' });
  });

  it('treats a server that vanished after the health check as unreachable', async () => {
    routeFetch(
      () => json(health()),
      () => json({ offline: true, error: 'The Sage server is not running.' }),
    );

    expect(await client.askHint(HINT_CONTEXT)).toMatchObject({ reason: 'unreachable' });
  });

  it('returns the server error message for a failed answer', async () => {
    routeFetch(
      () => json(health()),
      () => json({ error: 'Anthropic took too long to answer. Try again.' }, 504),
    );

    expect(await client.askHint(HINT_CONTEXT)).toEqual({
      offline: true,
      reason: 'error',
      message: 'Anthropic took too long to answer. Try again.',
    });
  });

  it('rejects a 200 answer in the wrong shape', async () => {
    routeFetch(
      () => json(health()),
      () => json({ level: 4, text: 'Skipped a level' }),
    );

    expect(await client.askHint(HINT_CONTEXT)).toMatchObject({ offline: true, reason: 'error' });
  });

  it('reports the network failing between the health check and the hint', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => {
        calls += 1;
        return calls === 1 ? Promise.resolve(json(health())) : Promise.reject(new TypeError());
      }),
    );

    expect(await client.askHint(HINT_CONTEXT)).toMatchObject({ reason: 'unreachable' });
    expect(devStatus.get().mentor).toBe('offline');
  });

  it('stops before the hint request when the health check finds no server', async () => {
    const pagesClient = createMentorClient({ serverExpected: false });

    expect(await pagesClient.askHint(HINT_CONTEXT)).toMatchObject({ reason: 'no-server' });
  });
});

describe('gradeQuestion', () => {
  it('returns a valid grade', async () => {
    const grade = { score: 2, whyItMatters: 'It narrows scope.', betterVersion: 'Which page?' };
    const fetchMock = routeFetch(
      () => json(health()),
      () => json(grade),
    );

    expect(await client.gradeQuestion(GRADE_CONTEXT)).toEqual({ ...grade, offline: false });
    expect(sentMentorBody(fetchMock)).toMatchObject({ mode: 'grade_question' });
  });

  it.each([
    { score: 4, whyItMatters: 'x', betterVersion: 'y' },
    { score: 1.5, whyItMatters: 'x', betterVersion: 'y' },
    { score: '3', whyItMatters: 'x', betterVersion: 'y' },
    { score: 3, whyItMatters: 'x' },
  ])('rejects the malformed grade %j', async (grade) => {
    routeFetch(
      () => json(health()),
      () => json(grade),
    );

    expect(await client.gradeQuestion(GRADE_CONTEXT)).toMatchObject({ reason: 'error' });
  });
});

describe('fallbackHint', () => {
  const ladder = ['What changed?', 'Staging picks what goes in.', 'git add app.ts'] as const;

  it('picks the pre-written hint for each level', () => {
    expect(fallbackHint(ladder, 1)).toBe('What changed?');
    expect(fallbackHint(ladder, 2)).toBe('Staging picks what goes in.');
    expect(fallbackHint(ladder, 3)).toBe('git add app.ts');
  });
});

describe('nextHintLevel', () => {
  it('climbs one level at a time and stays at 3', () => {
    expect(nextHintLevel(null)).toBe(1);
    expect(nextHintLevel(1)).toBe(2);
    expect(nextHintLevel(2)).toBe(3);
    expect(nextHintLevel(3)).toBe(3);
  });
});
