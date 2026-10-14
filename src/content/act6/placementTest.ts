import type { LessonPlacementInput } from '../../game/missions/schema';

/*
 * Act 6's placement test (DESIGN.md section 5): three cards borrowed from each of the four
 * lessons, so testing out means showing each one's idea, not just one of them. Each trio
 * mixes reading a system (a status code, some JSON, a query, a stack trace) with briefing
 * Otto, because the Act is about both. The final, The 3am Page, is the boss and lends none.
 */
export const act6Placement = {
  pitch: 'Already read requests, auth, data and logs? Score 85% to test out of the lessons.',
  cardIds: [
    // Requests and Responses
    'status-codes',
    'brief-an-endpoint',
    'safe-retries',
    // APIs and Auth
    'json-null',
    'key-in-the-browser',
    'least-scope',
    // Data, Speed and Scale
    'index',
    'sql-injection',
    'look-before-delete',
    // Logs and Stack Traces
    'what-was-undefined',
    'fix-the-cause',
    'swallowed-error',
  ],
  // 40 seconds a card, the same pace as the final, rather than the 30-second floor: these
  // cards have code and logs to read before the answer makes sense.
  timeLimitSeconds: 480,
} satisfies LessonPlacementInput;
