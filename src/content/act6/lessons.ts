import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Act 6: How Systems Work (DESIGN.md section 11), taught as lessons: reading the requests,
 * data and logs of the systems Kyle will have agents build, so he can tell when their
 * work is right and where to look when it isn't.
 */

export const requestsAndResponses = {
  id: 'requests-and-responses',
  act: 6,
  title: 'Requests and Responses',
  briefing: [
    'Every app you’ll direct agents to build talks over HTTP: a request goes out, a response comes back.',
    'Read them like a conversation: who asked, what for, and what the answer means.',
  ],
  cards: [
    {
      id: 'read-request',
      kind: 'choose',
      situation: 'Your browser sent this request.',
      artifact: {
        kind: 'request',
        text: [
          'POST /api/orders HTTP/1.1',
          'Host: shop.example.com',
          'Content-Type: application/json',
          'Authorization: Bearer eyJhbGciOi...',
          '',
          '{"productId": 42, "quantity": 2}',
        ].join('\n'),
      },
      question: 'What is it asking for?',
      options: [
        {
          id: 'create',
          text: 'To create an order for 2 of product 42, as the logged-in user.',
          correct: true,
          feedback: 'POST to /api/orders with a JSON body: create one.',
        },
        {
          id: 'read',
          text: 'To read order 42.',
          correct: false,
          feedback: 'Reading would be GET /api/orders/42.',
        },
        {
          id: 'delete',
          text: 'To delete product 42.',
          correct: false,
          feedback: 'That would be DELETE on the product’s path.',
        },
      ],
      explanation:
        'The method is the action (GET reads, POST creates, PATCH updates, DELETE removes), the path says what, headers carry context like login, and the body carries the data.',
    },
    {
      id: 'status-codes',
      kind: 'choose',
      situation: 'After lunch, the app shows “Something went wrong”. The network tab shows this.',
      artifact: {
        kind: 'response',
        text: [
          'HTTP/1.1 401 Unauthorized',
          'Content-Type: application/json',
          '',
          '{"error": "token expired"}',
        ].join('\n'),
      },
      question: 'What does this response mean?',
      options: [
        {
          id: 'crash',
          text: 'The server crashed.',
          correct: false,
          feedback: 'That’s a 5xx code, like 500.',
        },
        {
          id: 'missing',
          text: 'The page doesn’t exist.',
          correct: false,
          feedback: 'That’s 404.',
        },
        {
          id: 'auth',
          text: 'The server doesn’t know who you are: the login token expired.',
          correct: true,
          feedback: '401 means not authenticated. Log in again or refresh the token.',
        },
      ],
      explanation:
        '2xx worked, 3xx means look elsewhere, 4xx means the request was wrong (401 who are you, 403 not allowed, 404 not found), and 5xx means the server failed.',
    },
    {
      id: 'json',
      kind: 'choose',
      situation: 'Your agent’s code runs user.roles.includes("admin") on this response.',
      artifact: {
        kind: 'response',
        label: 'GET /api/users/7',
        text: [
          '{',
          '  "id": 7,',
          '  "name": "Ana",',
          '  "roles": ["admin", "billing"],',
          '  "manager": null',
          '}',
        ].join('\n'),
      },
      question: 'What’s true about this JSON?',
      options: [
        {
          id: 'string',
          text: 'roles is one string.',
          correct: false,
          feedback: 'Square brackets mean a list.',
        },
        {
          id: 'right',
          text: 'roles is a list, so includes works. manager is null, so code must handle “no manager”.',
          correct: true,
          feedback: 'Yes: read the types, especially null.',
        },
        {
          id: 'missing',
          text: 'manager is missing.',
          correct: false,
          feedback: 'It’s there, with the value null. Missing and null are different.',
        },
      ],
      explanation:
        'JSON has objects {}, lists [], strings, numbers, true and false, and null. Many crashes come from assuming a value is there when it’s null or missing.',
    },
    {
      id: 'auth-kinds',
      kind: 'choose',
      situation:
        'Your app lets users sign in with GitHub, and your server also calls a weather API.',
      question: 'Which kind of auth fits each?',
      options: [
        {
          id: 'right',
          text: 'OAuth for signing in with GitHub, and a secret API key kept on the server for the weather API.',
          correct: true,
          feedback:
            'OAuth lets users grant access without sharing passwords; a key identifies your server.',
        },
        {
          id: 'password',
          text: 'Ask users for their GitHub password.',
          correct: false,
          feedback: 'Never. OAuth exists so you never touch their password.',
        },
        {
          id: 'key-in-browser',
          text: 'Put the weather API key in the browser code.',
          correct: false,
          feedback: 'Anyone can read browser code and take the key.',
        },
      ],
      explanation:
        'OAuth: a user grants your app limited access to another site. API keys: your server proves who it is. Sessions and tokens keep a user logged in. Keys stay on servers.',
    },
    {
      id: 'api-spec',
      kind: 'prompt',
      situation: 'You want the agent to add a way to delete a comment.',
      question: 'Which instruction gets a well-behaved API?',
      options: [
        {
          id: 'vague',
          text: 'Add a way to delete comments.',
          correct: false,
          feedback: 'Who may delete? What if it’s missing? You’ll find out in production.',
        },
        {
          id: 'get',
          text: 'Add GET /deleteComment?id=5.',
          correct: false,
          feedback: 'GET must never change data: browsers and crawlers follow GET links freely.',
        },
        {
          id: 'good',
          text: 'Add DELETE /api/comments/:id. Only the author or an admin may delete: 403 otherwise, 404 if it doesn’t exist, 204 on success. Test each case.',
          correct: true,
          feedback: 'Method, path, who’s allowed, every status code, and tests.',
        },
      ],
      explanation:
        'Specify an endpoint like a contract: method and path, who may call it, and the response for each outcome. Then the tests almost write themselves.',
    },
    {
      id: 'request-journey',
      kind: 'order',
      situation: 'You type a web address and press Enter.',
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
        'Each step can fail on its own: DNS, the network, the server, the database. Knowing the journey tells you where to look.',
    },
  ],
} satisfies LessonInput;

export const dataSpeedAndScale = {
  id: 'data-speed-and-scale',
  act: 6,
  title: 'Data, Speed and Scale',
  briefing: [
    'Behind most requests is a database, and behind most slow pages is a slow query.',
    'Indexes, caches, queues and containers are how systems stay fast and steady as they grow.',
  ],
  cards: [
    {
      id: 'sql-read',
      kind: 'choose',
      situation: 'Your agent wrote this query.',
      artifact: {
        kind: 'code',
        label: 'query.sql',
        text: [
          'SELECT name, email',
          'FROM users',
          "WHERE country = 'NZ'",
          'ORDER BY name',
          'LIMIT 20;',
        ].join('\n'),
      },
      question: 'What does it return?',
      options: [
        {
          id: 'all',
          text: 'Every column of every user.',
          correct: false,
          feedback: 'SELECT names two columns, and WHERE filters the rows.',
        },
        {
          id: 'right',
          text: 'The names and emails of up to 20 New Zealand users, in alphabetical order.',
          correct: true,
          feedback: 'Yes.',
        },
        {
          id: 'delete',
          text: 'It removes users outside New Zealand.',
          correct: false,
          feedback: 'SELECT only reads. DELETE removes.',
        },
      ],
      explanation:
        'SELECT picks columns, FROM picks the table, WHERE filters rows, ORDER BY sorts, LIMIT caps the count. Reading SQL lets you check an agent’s query before it runs.',
    },
    {
      id: 'index',
      kind: 'choose',
      situation:
        'Looking up orders by customer_id takes 4 seconds. The orders table has 10 million rows.',
      question: 'What’s the likely fix?',
      options: [
        {
          id: 'index',
          text: 'Add an index on orders.customer_id.',
          correct: true,
          feedback: 'Yes: the database jumps to matching rows instead of scanning them all.',
        },
        {
          id: 'server',
          text: 'Buy a bigger server.',
          correct: false,
          feedback: 'Scanning 10 million rows is slow on any server.',
        },
        {
          id: 'memory',
          text: 'Load every order into memory at startup.',
          correct: false,
          feedback: 'Huge, soon out of date, and slow to start.',
        },
      ],
      explanation:
        'An index works like a book’s index: the database looks the value up instead of reading every row. Reads get fast and writes a little slower, so index what you search by.',
    },
    {
      id: 'sql-injection',
      kind: 'choose',
      situation: 'You’re reviewing the agent’s login code.',
      artifact: {
        kind: 'code',
        label: 'src/login.ts',
        text: [
          'const sql = "SELECT * FROM users WHERE email = \'" + email + "\'";',
          'db.query(sql);',
        ].join('\n'),
      },
      question: 'What’s the problem?',
      options: [
        {
          id: 'star',
          text: 'SELECT * is slow.',
          correct: false,
          feedback: 'A small point. The security hole is the real problem.',
        },
        {
          id: 'fine',
          text: 'Nothing. It works.',
          correct: false,
          feedback: 'It works for honest users. Attackers aren’t honest.',
        },
        {
          id: 'injection',
          text: "SQL injection: an email like ' OR '1'='1 changes the query. Use query parameters.",
          correct: true,
          feedback: 'Right: never glue user input into SQL.',
        },
      ],
      explanation:
        'Parameterised queries send the SQL and the values separately, so input can never become code. Flag any query built by gluing strings in an agent’s diff.',
    },
    {
      id: 'cache',
      kind: 'choose',
      situation:
        'The product page looks up prices on every visit, 5,000 times a minute, but prices change once a day.',
      question: 'What helps most?',
      options: [
        {
          id: 'forever',
          text: 'Cache them forever.',
          correct: false,
          feedback: 'Price changes would never appear.',
        },
        {
          id: 'cache',
          text: 'Cache prices for a few minutes, and clear the cache when a price changes.',
          correct: true,
          feedback: 'Fast reads, and changes still show up.',
        },
        {
          id: 'nothing',
          text: 'Nothing. Databases are fast.',
          correct: false,
          feedback: '5,000 identical queries a minute is wasted work.',
        },
      ],
      explanation:
        'A cache keeps a copy of a slow answer. The hard part is knowing when the copy is stale: set an expiry, and clear it when the data changes.',
    },
    {
      id: 'queue',
      kind: 'choose',
      situation: 'Sign-up sends a welcome email, which takes 3 seconds and sometimes fails.',
      question: 'How should sign-up handle it?',
      options: [
        {
          id: 'queue',
          text: 'Put an email job on a queue. A worker sends it and retries if it fails.',
          correct: true,
          feedback: 'Sign-up returns fast, and the emails still go out.',
        },
        {
          id: 'wait',
          text: 'Send the email inside the sign-up request.',
          correct: false,
          feedback: 'Users wait 3 seconds, and sign-up fails whenever email does.',
        },
        {
          id: 'skip',
          text: 'Skip the email when it fails.',
          correct: false,
          feedback: 'Users silently lose their welcome email.',
        },
      ],
      explanation:
        'Queues move slow or flaky work out of the request. The request records a job and returns; workers process jobs and retry. Nobody waits.',
    },
    {
      id: 'container',
      kind: 'choose',
      situation: 'A teammate says: “It works in Docker, so it’ll work on the server.”',
      question: 'Why is that mostly true?',
      options: [
        {
          id: 'vm',
          text: 'Docker copies your whole laptop.',
          correct: false,
          feedback: 'An image holds just the app and what it needs.',
        },
        {
          id: 'magic',
          text: 'Docker fixes bugs automatically.',
          correct: false,
          feedback: 'It fixes “works on my machine”, not logic bugs.',
        },
        {
          id: 'image',
          text: 'The image packs the app with its exact runtime and dependencies, so it runs the same anywhere Docker runs.',
          correct: true,
          feedback: 'Yes: same image, same environment.',
        },
      ],
      explanation:
        'Containers package an app with its environment. Settings and secrets still come from outside, through environment variables, so one image runs in staging and production.',
    },
  ],
} satisfies LessonInput;

export const theThreeAmPage = {
  id: 'the-3am-page',
  act: 6,
  title: 'The 3am Page',
  kind: 'final',
  timeLimitSeconds: 300,
  xp: 150,
  briefing: [
    '3am. Your phone buzzes: checkout errors are at 30%.',
    'Read the evidence, find the cause, stop the damage, then fix it properly. Five minutes on one clock.',
  ],
  cards: [
    {
      id: 'what-changed',
      kind: 'choose',
      situation: 'You’re awake and logged in. The errors started at 02:40.',
      question: 'What do you check first?',
      options: [
        {
          id: 'rewrite',
          text: 'Start rewriting the checkout code.',
          correct: false,
          feedback: 'You don’t know what’s wrong yet.',
        },
        {
          id: 'changes',
          text: 'What changed around 02:40: deploys, settings, traffic.',
          correct: true,
          feedback: 'Most incidents follow a change.',
        },
        {
          id: 'restart',
          text: 'Restart every server.',
          correct: false,
          feedback: 'It might hide the cause, or make things worse.',
        },
      ],
      explanation:
        'Incidents usually start with a change. Line up the error graph with deploys and setting changes before touching anything.',
    },
    {
      id: 'read-logs',
      kind: 'choose',
      situation: 'These are the checkout service’s logs.',
      artifact: {
        kind: 'log',
        label: 'checkout-api',
        text: [
          '02:39:58 INFO  deploy v4.12.0 complete',
          '02:40:03 ERROR POST /api/checkout 500',
          '  Error: connect ETIMEDOUT 10.0.3.7:5432',
          '02:40:04 ERROR POST /api/checkout 500',
          '  Error: connect ETIMEDOUT 10.0.3.7:5432',
          '02:40:05 INFO  GET /api/products 200 (cache hit)',
        ].join('\n'),
      },
      question: 'What do they suggest?',
      options: [
        {
          id: 'database',
          text: 'Since the deploy, checkout can’t reach the database on port 5432. Product pages still work from the cache.',
          correct: true,
          feedback: 'Yes: the timeouts and the deploy line up.',
        },
        {
          id: 'products',
          text: 'Product pages are broken.',
          correct: false,
          feedback: 'They return 200, from the cache.',
        },
        {
          id: 'traffic',
          text: 'There’s too much traffic.',
          correct: false,
          feedback: 'Nothing here shows load. It shows a connection failing.',
        },
      ],
      explanation:
        'Read logs for timing and patterns. Port 5432 is PostgreSQL. A cache can hide a database problem for reads, but not for writes like checkout.',
    },
    {
      id: 'mitigate',
      kind: 'choose',
      situation: 'v4.12.0 changed the database connection settings.',
      question: 'What do you do now, at 3am?',
      options: [
        {
          id: 'debug-live',
          text: 'Experiment with the new settings in production.',
          correct: false,
          feedback: 'Users keep failing while you experiment.',
        },
        {
          id: 'wait',
          text: 'Wait for the morning team.',
          correct: false,
          feedback: 'A third of checkouts fail every minute you wait.',
        },
        {
          id: 'rollback',
          text: 'Roll back to v4.11.0, confirm the errors drop, then investigate.',
          correct: true,
          feedback: 'Stop the damage first, then diagnose with users unaffected.',
        },
      ],
      explanation:
        'Mitigate first, then fix. Rolling back to the last good version is usually the fastest way to restore service. The root cause can wait an hour; customers can’t.',
    },
    {
      id: 'confirm',
      kind: 'choose',
      situation: 'You rolled back. These are the logs now.',
      artifact: {
        kind: 'log',
        label: 'after the rollback',
        text: [
          '02:52:10 INFO  deploy v4.11.0 complete',
          '02:52:14 INFO  POST /api/checkout 201',
          '02:52:15 INFO  POST /api/checkout 201',
          'error rate: 0.4%',
        ].join('\n'),
      },
      question: 'Is it resolved?',
      options: [
        {
          id: 'done',
          text: 'Fully fixed. Redeploy v4.12.0 tomorrow.',
          correct: false,
          feedback: 'It would break again.',
        },
        {
          id: 'mitigated',
          text: 'Mitigated: errors are back to normal, but v4.12.0 still needs fixing before it’s deployed again.',
          correct: true,
          feedback: 'Right: service is back, but the bug isn’t gone.',
        },
        {
          id: 'unclear',
          text: 'You can’t tell from this.',
          correct: false,
          feedback: '201s and a normal error rate are clear.',
        },
      ],
      explanation:
        'Watch the numbers recover before standing down. Then make sure the broken version can’t be deployed again until it’s fixed.',
    },
    {
      id: 'root-cause',
      kind: 'prompt',
      situation: 'Morning. You ask your agent to help find the root cause.',
      question: 'Which instruction?',
      options: [
        {
          id: 'good',
          text: 'Compare the database settings in v4.11.0 and v4.12.0. Explain which change breaks connections, using these logs. Propose a fix and a check that would catch it. Deploy nothing.',
          correct: true,
          feedback: 'Evidence, a fix and prevention, with a clear boundary.',
        },
        {
          id: 'deploy',
          text: 'Fix it and deploy.',
          correct: false,
          feedback: 'An unreviewed rushed fix is how incidents repeat.',
        },
        {
          id: 'blame',
          text: 'Find out who caused this.',
          correct: false,
          feedback: 'Blame makes people hide mistakes. Ask what failed, not who.',
        },
      ],
      explanation:
        'Root cause analysis asks what happened, why, and which check would have caught it. Keep it blameless and based on evidence, and keep deploys under human review.',
    },
    {
      id: 'incident-steps',
      kind: 'order',
      situation: 'Summing up the night.',
      question: 'Put incident response in order.',
      steps: [
        { id: 'detect', text: 'Get alerted and confirm the impact' },
        { id: 'mitigate', text: 'Mitigate: roll back or switch it off' },
        { id: 'verify', text: 'Check the numbers recover' },
        { id: 'root', text: 'Find the root cause' },
        { id: 'prevent', text: 'Fix it, and add a check so it can’t recur' },
      ],
      explanation:
        'Detect, mitigate, verify, then learn. Users come first, understanding second, and prevention last, but never skipped.',
    },
  ],
} satisfies LessonInput;

/** Act 6's lessons in play order, final last. */
export const act6Lessons: readonly LessonInput[] = [
  requestsAndResponses,
  dataSpeedAndScale,
  theThreeAmPage,
];
