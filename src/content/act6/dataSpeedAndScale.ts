import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Lesson 6.3: reading the SQL Otto writes, and the tools that keep a system fast as it
 * grows: indexes, caches, queues and containers. The id predates this file, so existing
 * saves keep their progress on it.
 */
export const dataSpeedAndScale = {
  id: 'data-speed-and-scale',
  act: 6,
  title: 'Data, Speed and Scale',
  briefing: [
    'Behind most requests is a database, and behind most slow pages is a slow query.',
    'Indexes, caches, queues, containers and the cloud they run on keep Quillwork fast and steady as more writers join. Otto writes the queries; you judge them.',
  ],
  cards: [
    {
      id: 'sql-read',
      kind: 'choose',
      situation: 'Otto wrote this query for the “recent documents” sidebar.',
      artifact: {
        kind: 'code',
        label: 'recent-docs.sql',
        text: [
          'SELECT id, title, updated_at',
          'FROM docs',
          'WHERE workspace_id = 17',
          'ORDER BY updated_at DESC',
          'LIMIT 10;',
        ].join('\n'),
      },
      question: 'What does it return?',
      options: [
        {
          id: 'everything',
          text: 'Every column of every document.',
          correct: false,
          feedback: 'SELECT names three columns, and WHERE keeps only one workspace’s rows.',
        },
        {
          id: 'oldest',
          text: 'The 10 oldest documents in workspace 17.',
          correct: false,
          feedback: 'DESC means descending: newest first.',
        },
        {
          id: 'right',
          text: 'The id, title and last-edit time of workspace 17’s ten most recently edited documents, newest first.',
          correct: true,
          feedback: 'Yes: each clause narrows or orders the answer.',
        },
        {
          id: 'delete',
          text: 'It removes all but the 10 newest documents.',
          correct: false,
          feedback: 'SELECT only reads. Removing rows takes DELETE.',
        },
      ],
      explanation:
        'SELECT picks columns, FROM picks the table, WHERE filters rows, ORDER BY sorts, and LIMIT caps the count. Reading SQL lets you check an agent’s query before it runs.',
    },
    {
      id: 'index',
      kind: 'choose',
      situation:
        'That sidebar query takes 4 seconds. The docs table has 12 million rows, and no index on workspace_id.',
      question: 'What’s the likely fix?',
      options: [
        {
          id: 'bigger-server',
          text: 'Move to a bigger database server.',
          correct: false,
          feedback: 'Reading 12 million rows is slow on any server. It only postpones the problem.',
        },
        {
          id: 'memory',
          text: 'Load every document into the app’s memory at startup.',
          correct: false,
          feedback: 'Gigabytes of memory, slow starts, and stale data as soon as anyone types.',
        },
        {
          id: 'drop-order',
          text: 'Remove ORDER BY so the database does less work.',
          correct: false,
          feedback:
            'It still reads every row to find workspace 17’s. And the sidebar loses its order.',
        },
        {
          id: 'index',
          text: 'Add an index on docs (workspace_id, updated_at).',
          correct: true,
          feedback: 'The database jumps straight to workspace 17’s rows, already in time order.',
        },
      ],
      explanation:
        'An index works like a book’s index: look the value up instead of reading every page. Reads get much faster and writes a little slower, so index the columns you filter and sort by.',
    },
    {
      id: 'measure-first',
      kind: 'prompt',
      situation:
        'Search is slow too, and you don’t know why. Otto can use a staging database holding a production-sized copy of the data.',
      question: 'Which instruction?',
      options: [
        {
          id: 'explain',
          text: 'On staging, run EXPLAIN on the search query and tell me whether it scans the whole table. Propose a fix with before and after timings. Don’t change production.',
          correct: true,
          feedback:
            'Measure first, propose a fix with proof, and keep production out of the experiment.',
        },
        {
          id: 'vague',
          text: 'Make search faster.',
          correct: false,
          feedback:
            'Otto might add a cache, rewrite the feature or change the database. You wouldn’t know which, or whether it helped.',
        },
        {
          id: 'index-all',
          text: 'Add an index on every column, so every query is fast.',
          correct: false,
          feedback:
            'Each index slows every write and takes space. Index what queries actually use.',
        },
        {
          id: 'cache-day',
          text: 'Cache all search results for a day.',
          correct: false,
          feedback: 'Writers would search and not find what they wrote an hour ago.',
        },
      ],
      explanation:
        'EXPLAIN shows a query’s plan: whether it uses an index or reads every row. Asking an agent for that evidence, plus before and after numbers, turns “faster” into something you can check.',
    },
    {
      id: 'sql-injection',
      kind: 'choose',
      situation: 'You’re reviewing Otto’s new search endpoint.',
      artifact: {
        kind: 'code',
        label: 'src/api/search.ts',
        text: [
          'const sql =',
          '  "SELECT id, title FROM docs WHERE workspace_id = $1" +',
          '  " AND title LIKE \'%" + req.query.q + "%\'";',
          'const rows = await db.query(sql, [req.user.workspaceId]);',
        ].join('\n'),
      },
      question: 'What’s the problem?',
      options: [
        {
          id: 'like',
          text: 'LIKE is slow on big tables.',
          correct: false,
          feedback: 'Worth knowing, but the security hole matters far more.',
        },
        {
          id: 'injection',
          text: "SQL injection: a search like '; DROP TABLE docs; -- becomes part of the query. Use query parameters.",
          correct: true,
          feedback:
            'Right. Otto passed the workspace as a parameter but glued the search text in. Never glue user input into SQL.',
        },
        {
          id: 'leak',
          text: 'It returns other companies’ documents.',
          correct: false,
          feedback:
            'Look again: workspace_id = $1 keeps it to the writer’s own workspace. The flaw is the other value.',
        },
        {
          id: 'fine',
          text: 'Nothing. It worked when Otto tested it.',
          correct: false,
          feedback: 'It works for honest searches. Attackers don’t type honest searches.',
        },
      ],
      explanation:
        'Parameterised queries send the SQL and the values separately, so input can never become code. Flag any query built by gluing strings together in an agent’s diff, every time.',
    },
    {
      id: 'look-before-delete',
      kind: 'prompt',
      situation:
        "Marco wants the test accounts removed from the production database. Otto suggests: DELETE FROM users WHERE email LIKE '%test%'.",
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'run-it',
          text: 'Run it. Test accounts are junk anyway.',
          correct: false,
          feedback:
            'That pattern also matches real people, like contest@ or a surname like Attestor. Deleted rows don’t come back.',
        },
        {
          id: 'at-night',
          text: 'Run it, but late at night when fewer people use the app.',
          correct: false,
          feedback: 'Quieter, but just as wrong. Real writers still lose their accounts.',
        },
        {
          id: 'select-first',
          text: 'First run a SELECT with the same WHERE and show me the count and 20 sample rows. Then delete an exact list of ids, inside a transaction, after a backup.',
          correct: true,
          feedback: 'See exactly what a delete will hit before it runs, and keep a way back.',
        },
      ],
      explanation:
        'Before any DELETE or UPDATE, run the same WHERE as a SELECT and look at what it matches. Agents write confident queries; your job is to make them prove what they’ll touch.',
    },
    {
      id: 'cache',
      kind: 'choose',
      situation:
        'Every page loads the writer’s plan and usage limits, a query joining four tables that takes 120 ms, 5,000 times a minute. Database CPU is at 85%. Plans change about once a month.',
      question: 'What helps most?',
      options: [
        {
          id: 'cache-expiry',
          text: 'Cache each writer’s plan for a few minutes, and clear that entry when their plan changes.',
          correct: true,
          feedback: 'Fast reads, and an upgrade still shows up straight away.',
        },
        {
          id: 'forever',
          text: 'Cache plans forever.',
          correct: false,
          feedback: 'Someone upgrades and keeps the free plan’s limits.',
        },
        {
          id: 'nothing',
          text: 'Nothing. Databases are fast.',
          correct: false,
          feedback:
            'The database is already at 85% CPU on answers that almost never change, and it grows with Quillwork.',
        },
        {
          id: 'local-storage',
          text: 'Keep plans in the browser’s localStorage and trust what it says.',
          correct: false,
          feedback: 'Users can edit localStorage. A writer could give themselves the top plan.',
        },
      ],
      explanation:
        'A cache keeps a copy of a slow answer. The hard part is staleness: give entries an expiry, clear them when the data changes, and never trust a copy the user can edit.',
    },
    {
      id: 'cache-read',
      kind: 'order',
      situation:
        'Otto is adding a cache in front of the plans query. Sage asks you how a read should work.',
      question: 'Put the cached read in order.',
      steps: [
        { id: 'check', text: 'Look for the writer’s plan in the cache' },
        { id: 'miss', text: 'On a miss, query the database' },
        { id: 'store', text: 'Store the answer in the cache with an expiry' },
        { id: 'return', text: 'Return the plan to the caller' },
      ],
      explanation:
        'This is called cache-aside. A hit skips the database entirely; a miss pays once and fills the cache for the next request. The expiry caps how stale any copy can get.',
    },
    {
      id: 'queue',
      kind: 'choose',
      situation:
        'Exporting a long document to PDF takes 40 seconds, and the export request times out at 30.',
      question: 'How should export work?',
      options: [
        {
          id: 'longer-timeout',
          text: 'Raise the request timeout to two minutes.',
          correct: false,
          feedback:
            'Writers stare at a spinner, and every waiting request holds a server connection open.',
        },
        {
          id: 'queue',
          text: 'Put an export job on a queue and return at once. A worker makes the PDF, retries failures, and the app shows it when ready.',
          correct: true,
          feedback: 'The request is quick, the slow work happens elsewhere, and nobody waits.',
        },
        {
          id: 'browser',
          text: 'Make the PDF in the browser instead.',
          correct: false,
          feedback: 'Long documents would freeze writers’ laptops, and phones would struggle more.',
        },
        {
          id: 'shorter',
          text: 'Tell writers to export shorter documents.',
          correct: false,
          feedback: 'That asks users to work around our design.',
        },
      ],
      explanation:
        'Queues move slow or flaky work out of the request. The request records a job and returns; workers process jobs at their own pace and retry failures.',
    },
    {
      id: 'container',
      kind: 'choose',
      situation:
        'Dex says: “The export worker runs in a Docker container on my laptop, so it’ll run the same on the server.”',
      question: 'Why is that mostly true?',
      options: [
        {
          id: 'copies-laptop',
          text: 'Docker copies your whole laptop to the server.',
          correct: false,
          feedback: 'An image holds just the app and what it needs, not your laptop.',
        },
        {
          id: 'fixes-bugs',
          text: 'Docker fixes bugs automatically.',
          correct: false,
          feedback: 'It fixes “works on my machine”, not logic bugs.',
        },
        {
          id: 'image',
          text: 'The image packs the worker with its exact runtime and libraries, so it runs the same anywhere Docker runs. Settings and secrets come from outside.',
          correct: true,
          feedback: 'Yes: same image, same environment. Only the environment variables differ.',
        },
      ],
      explanation:
        'Containers package an app with its environment, which solves Act 1’s “works on my machine”. Config comes in through environment variables, so one image runs in staging and production.',
    },
    {
      id: 'managed-or-not',
      kind: 'prompt',
      situation:
        'Quillwork is moving its database to the cloud. Otto proposes running Postgres ourselves on a cloud VM to save money.',
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'one-vm',
          text: 'Fine. Run it on one VM. We can sort out backups later.',
          correct: false,
          feedback:
            'One disk failure and every writer’s work is gone. “Later” is usually after the outage.',
        },
        {
          id: 'managed',
          text: 'Use the cloud provider’s managed database, with automatic backups and a replica in another zone. Spell out the monthly cost and which region it runs in.',
          correct: true,
          feedback:
            'The provider handles patching and failover, and you still know what it costs and where the data lives.',
        },
        {
          id: 'same-container',
          text: 'Put the database in the same container as the app, so there’s one thing to deploy.',
          correct: false,
          feedback:
            'Containers get replaced on every deploy, and the data would go with them. You also couldn’t add app servers without copying the database.',
        },
        {
          id: 'biggest',
          text: 'Pick the biggest instance available, to be safe.',
          correct: false,
          feedback:
            'In the cloud you pay for what you reserve. Size it to real load and grow when the numbers say so.',
        },
      ],
      explanation:
        'In the cloud you rent servers and managed services, paying for what you use. A region is where they run; zones are separate buildings in it, so a replica in another zone survives one failing. Someone still owns backups and cost.',
    },
  ],
} satisfies LessonInput;
