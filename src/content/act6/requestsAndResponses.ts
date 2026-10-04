import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Lesson 6.1: what an HTTP request and response say, and how to brief Otto on an
 * endpoint or a failing request. The id predates this file, so existing saves keep
 * their progress on it.
 */
export const requestsAndResponses = {
  id: 'requests-and-responses',
  act: 6,
  title: 'Requests and Responses',
  briefing: [
    'Welcome to Quillwork’s backend. Every click in our writing app becomes an HTTP request, and every answer comes back as a response.',
    'You won’t write the server code: Otto will. Your job is to read requests like a conversation and tell Otto what a good answer looks like.',
  ],
  cards: [
    {
      id: 'read-request',
      kind: 'choose',
      situation: 'Priya pastes a request from the browser’s network tab while she tests comments.',
      artifact: {
        kind: 'request',
        label: 'network tab',
        text: [
          'POST /api/docs/381/comments HTTP/1.1',
          'Host: app.quillwork.io',
          'Content-Type: application/json',
          'Cookie: qw_session=8f3c...e21',
          '',
          '{"body": "Love this intro!", "parentId": null}',
        ].join('\n'),
      },
      question: 'What is this request asking the server to do?',
      options: [
        {
          id: 'read',
          text: 'Read comment 381.',
          correct: false,
          feedback: 'Reading uses GET. And 381 is the document’s id: the path says docs/381.',
        },
        {
          id: 'update-doc',
          text: 'Change document 381’s text to “Love this intro!”.',
          correct: false,
          feedback:
            'An update would usually be PATCH /api/docs/381. This path ends in /comments, a list to add to.',
        },
        {
          id: 'create',
          text: 'Create a new top-level comment on document 381, as whoever owns that session cookie.',
          correct: true,
          feedback: 'POST creates, the path says where, the cookie says who, the body says what.',
        },
        {
          id: 'delete',
          text: 'Delete the comments on document 381.',
          correct: false,
          feedback: 'Deleting uses the DELETE method, and it has no body to send.',
        },
      ],
      explanation:
        'Read a request in four parts. The method is the verb (GET reads, POST creates, PATCH updates, DELETE removes), the path is the thing, headers carry context like who you are, and the body carries data.',
    },
    {
      id: 'status-codes',
      kind: 'choose',
      situation:
        'After lunch, Marco’s editor shows “Something went wrong” on every save. Dex grabs the response from the network tab.',
      artifact: {
        kind: 'response',
        label: 'PATCH /api/docs/77',
        text: [
          'HTTP/1.1 401 Unauthorized',
          'Content-Type: application/json',
          '',
          '{"error": "session expired"}',
        ].join('\n'),
      },
      question: 'What does this response tell you?',
      options: [
        {
          id: 'crash',
          text: 'The server crashed while saving.',
          correct: false,
          feedback: 'A crash is a 5xx code, like 500. A 4xx code says the problem is the request.',
        },
        {
          id: 'auth',
          text: 'The server doesn’t know who Marco is any more: his session expired, so he must sign in again.',
          correct: true,
          feedback: '401 means “not authenticated”. The fix is signing in, not debugging the save.',
        },
        {
          id: 'forbidden',
          text: 'Marco isn’t allowed to edit this document.',
          correct: false,
          feedback:
            'That’s 403 Forbidden: the server knows who you are and says no. 401 means it doesn’t know who you are.',
        },
        {
          id: 'missing',
          text: 'The document was deleted.',
          correct: false,
          feedback: 'That’s 404 Not Found.',
        },
      ],
      explanation:
        '2xx worked. 3xx means look elsewhere. 4xx means the request was the problem: 400 bad input, 401 who are you, 403 not allowed, 404 not found. 5xx means the server failed.',
    },
    {
      id: 'pick-a-code',
      kind: 'choose',
      situation:
        'Otto is building GET /api/docs/:id. Marco is signed in, but asks for a document that belongs to another company’s workspace.',
      question: 'Which response should Otto return?',
      options: [
        {
          id: 'ok-with-error',
          text: '200 OK, with {"error": "not yours"} in the body.',
          correct: false,
          feedback:
            'Everything that reads status codes, from the app to monitoring, will think it worked. Errors need error codes.',
        },
        {
          id: 'unauthorized',
          text: '401 Unauthorized.',
          correct: false,
          feedback:
            'Marco is signed in, so the server knows who he is. A 401 would bounce him to the sign-in page.',
        },
        {
          id: 'server-error',
          text: '500 Internal Server Error.',
          correct: false,
          feedback: 'Nothing broke. A 500 could page the on-call engineer for a normal “no”.',
        },
        {
          id: 'forbidden',
          text: '403 Forbidden: we know who you are, and you can’t have this.',
          correct: true,
          feedback:
            'Right. Some teams return 404 instead, so outsiders can’t even learn the document exists.',
        },
      ],
      explanation:
        'Status codes are how machines read your answer: apps decide what to show, and monitors decide whether to wake someone. Pick the code that says what actually happened.',
    },
    {
      id: 'brief-an-endpoint',
      kind: 'prompt',
      situation:
        'Priya wants writers to be able to delete their own comments. You’re about to brief Otto.',
      question: 'Which instruction gets a well-behaved endpoint?',
      options: [
        {
          id: 'vague',
          text: 'Add a way to delete comments.',
          correct: false,
          feedback:
            'Who may delete? What if it’s already gone? Otto will guess, and you’ll find out in production.',
        },
        {
          id: 'get',
          text: 'Add GET /api/deleteComment?id=5 so it’s easy to try in the browser.',
          correct: false,
          feedback:
            'GET must never change data. Link previews and crawlers follow GET links freely, and would delete comments.',
        },
        {
          id: 'contract',
          text: 'Add DELETE /api/comments/:id. Only the author or a workspace admin may delete: 403 otherwise, 404 if it doesn’t exist, 204 on success. Write a test for each case.',
          correct: true,
          feedback:
            'Method, path, who’s allowed, every outcome’s status code, and tests to prove it.',
        },
        {
          id: 'always-ok',
          text: 'Add DELETE /api/comments/:id, and make it return 200 no matter what, so the app never shows an error.',
          correct: false,
          feedback:
            'Then a comment that didn’t delete looks deleted. Hiding failures hides the truth from users and from you.',
        },
      ],
      explanation:
        'Brief an endpoint like a contract: method and path, who may call it, and the response for each outcome. A clear contract leaves Otto less to guess and gives you something to check.',
    },
    {
      id: 'brief-a-failure',
      kind: 'prompt',
      situation:
        'Exporting a document to PDF fails for Dex. You copied the failing request and its response from the network tab.',
      artifact: {
        kind: 'response',
        label: 'POST /api/docs/412/export',
        text: [
          'HTTP/1.1 502 Bad Gateway',
          'x-request-id: req_7Hq2',
          '',
          '{"error": "upstream error"}',
        ].join('\n'),
      },
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'evidence',
          text: 'POST /api/docs/412/export returns 502, request id req_7Hq2. Find that request in the server logs, explain why the PDF service failed, and reproduce it in a test before changing anything.',
          correct: true,
          feedback:
            'You gave evidence and a way to find more, and asked for the cause before a fix.',
        },
        {
          id: 'vague',
          text: 'The export button is broken, fix it.',
          correct: false,
          feedback:
            'Otto has to guess which document and what “broken” means. Guesses lead to changes that miss the cause.',
        },
        {
          id: 'hide',
          text: 'Show a friendly message instead of the error when export fails.',
          correct: false,
          feedback: 'Nicer, but exports still fail. Soften an error only after you understand it.',
        },
        {
          id: 'rewrite',
          text: 'Rewrite the export feature with a different PDF library.',
          correct: false,
          feedback: 'A big change with no diagnosis. The library may not even be the problem.',
        },
      ],
      explanation:
        'Agents work from evidence. Give Otto the exact request, the status code and the request id to search logs, and ask for the cause before a fix. A 502 means a server in the middle got a bad answer from the one behind it.',
    },
    {
      id: 'safe-retries',
      kind: 'choose',
      situation:
        'Otto wants to retry failed requests automatically. Two kinds fail now and then: loading a document (GET) and charging a card for a subscription (POST).',
      question: 'Which retry rule is safe?',
      options: [
        {
          id: 'idempotent',
          text: 'Retry the GET a few times, waiting longer each time. Retry the charge only with an idempotency key, so repeats count as one charge.',
          correct: true,
          feedback:
            'Yes. Reading twice is harmless; charging twice is not, unless the provider can spot the repeat.',
        },
        {
          id: 'retry-all',
          text: 'Retry every failed request three times.',
          correct: false,
          feedback:
            'If the charge reached the provider but the reply got lost, a retry charges the customer twice.',
        },
        {
          id: 'never',
          text: 'Never retry anything; show an error.',
          correct: false,
          feedback: 'Safe, but small network blips that a retry would hide now reach writers.',
        },
        {
          id: 'retry-4xx',
          text: 'Retry only the requests that got a 4xx code.',
          correct: false,
          feedback:
            'Most 4xx codes say the request itself was wrong, so the same request gets the same answer. (429, too many requests, is the exception: wait, then retry.)',
        },
      ],
      explanation:
        'A request that is safe to repeat is called idempotent. GET is; a charge is not, unless it carries an idempotency key. Cap retries and wait longer each time, or repeats bury a struggling server. Ask about this before any agent adds retries.',
    },
    {
      id: 'cors',
      kind: 'choose',
      situation:
        'Dex runs the new marketing site at localhost:5173. Its sign-up form calls Quillwork’s API, and the console shows this.',
      artifact: {
        kind: 'error',
        label: 'Chrome console',
        text: [
          "Access to fetch at 'https://api.quillwork.io/signup' from origin",
          "'http://localhost:5173' has been blocked by CORS policy: No",
          "'Access-Control-Allow-Origin' header is present on the requested",
          'resource.',
        ].join('\n'),
      },
      question: 'What is going on?',
      options: [
        {
          id: 'down',
          text: 'The API is down.',
          correct: false,
          feedback:
            'The request reached the server. The browser refused to hand the answer to the page.',
        },
        {
          id: 'origin',
          text: 'The browser blocked the page from reading the API’s answer, because the API doesn’t list this origin as allowed. The fix is on the API.',
          correct: true,
          feedback: 'Right: browsers enforce CORS, and servers configure it.',
        },
        {
          id: 'extension',
          text: 'Have users install a browser extension that turns CORS off.',
          correct: false,
          feedback:
            'That turns off a protection, one browser at a time. Real visitors would still be blocked.',
        },
        {
          id: 'typo',
          text: 'The sign-up code has a typo in the URL.',
          correct: false,
          feedback: 'A wrong URL would fail to connect or return 404. This message names a header.',
        },
      ],
      explanation:
        'CORS is the browser asking the server: may this website read your answers? The server says yes with a header listing allowed origins. Fix it on the server, and only for origins you trust.',
    },
    {
      id: 'request-journey',
      kind: 'order',
      situation: 'Sage asks you to explain what happens when a writer opens app.quillwork.io.',
      question: 'Put the journey in order.',
      steps: [
        { id: 'dns', text: 'DNS turns the name into an IP address' },
        { id: 'connect', text: 'The browser connects securely to the server' },
        { id: 'request', text: 'The browser sends the HTTP request' },
        { id: 'server', text: 'The server runs code and queries the database' },
        { id: 'response', text: 'The server sends back a response' },
        { id: 'render', text: 'The browser renders the page' },
      ],
      explanation:
        'Each step can fail on its own: DNS, the network, the server, the database. Knowing the journey tells you, and Otto, where to look.',
    },
  ],
} satisfies LessonInput;
