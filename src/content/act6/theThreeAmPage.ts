import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Act 6's final, "The 3am Page" (DESIGN.md section 11): triaging a live incident from
 * metrics and logs on one clock, then briefing Otto on the root cause and the
 * postmortem. It stands in for the boss fight. The id predates this file, so existing
 * saves keep their progress on it.
 */
export const theThreeAmPage = {
  id: 'the-3am-page',
  act: 6,
  title: 'The 3am Page',
  kind: 'final',
  // Nine cards, 40 seconds each: enough to read an artifact, not enough to dawdle.
  timeLimitSeconds: 360,
  xp: 150,
  briefing: [
    '2:46am. Your phone buzzes: Quillwork’s checkout errors are at 30%, and you’re on call.',
    'Read the evidence, stop the damage, then find the cause. Six minutes on one clock. Sage is asleep, so this one is yours.',
  ],
  cards: [
    {
      id: 'what-changed',
      kind: 'choose',
      situation: 'You’re at your laptop. The alert says checkout errors started at 02:40.',
      question: 'What do you check first?',
      options: [
        {
          id: 'rewrite',
          text: 'Ask Otto to start rewriting the checkout code.',
          correct: false,
          feedback: 'You don’t know what’s wrong yet. Rewriting blind can add a second problem.',
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
          feedback: 'It might hide the cause for an hour, or make things worse.',
        },
      ],
      explanation:
        'Incidents usually start with a change. Line up the error graph with deploys and setting changes before touching anything.',
    },
    {
      id: 'read-metrics',
      kind: 'choose',
      situation: 'The checkout dashboard, from 02:30 until now.',
      artifact: {
        kind: 'log',
        label: 'checkout dashboard',
        text: [
          'time   req/min  errors  p95 latency  db connections',
          '02:30  410      0.3%    180ms        22/100',
          '02:35  405      0.4%    175ms        24/100',
          '02:40  398      29.8%   5,020ms      100/100',
          '02:45  402      31.2%   5,010ms      100/100',
        ].join('\n'),
      },
      question: 'What do the numbers say?',
      options: [
        {
          id: 'traffic',
          text: 'A traffic spike overloaded us.',
          correct: false,
          feedback: 'Requests per minute barely moved. Load didn’t change; something else did.',
        },
        {
          id: 'slow-only',
          text: 'Checkout is slow, but not failing.',
          correct: false,
          feedback: 'Errors went from 0.3% to 30%. It’s slow and failing.',
        },
        {
          id: 'connections',
          text: 'At 02:40 the database connections all got used up. At normal traffic, many requests wait 5 seconds for one, and about a third fail.',
          correct: true,
          feedback: 'Yes. Same load, but the connections are full, so requests time out waiting.',
        },
      ],
      explanation:
        'Read metrics side by side. Traffic shows whether load changed, errors and latency (p95: 95% of requests were faster) show the pain, and gauges like connections point at the cause.',
    },
    {
      id: 'read-logs',
      kind: 'choose',
      situation: 'These are the checkout service’s logs from the same minutes.',
      artifact: {
        kind: 'log',
        label: 'checkout-api',
        text: [
          '02:39:58 INFO  deploy v4.12.0 complete (deploy-bot)',
          '02:40:03 ERROR req=f01c POST /api/checkout 500 5003ms',
          '  Error: timeout acquiring connection from pool (size=100)',
          '02:40:03 ERROR req=f01d POST /api/checkout 500 5001ms',
          '  Error: timeout acquiring connection from pool (size=100)',
          '02:40:05 INFO  req=f01e GET /api/plans 200 4ms (cache hit)',
        ].join('\n'),
      },
      question: 'What do they suggest?',
      options: [
        {
          id: 'deploy',
          text: 'Since the v4.12.0 deploy, checkout waits for a free database connection and gives up. Cached reads still work.',
          correct: true,
          feedback: 'Yes: the timing, the error and the deploy line up.',
        },
        {
          id: 'plans',
          text: 'The plans page is broken too.',
          correct: false,
          feedback: 'It returns 200 in 4ms, from the cache.',
        },
        {
          id: 'db-down',
          text: 'The database server is down.',
          correct: false,
          feedback:
            'Close, but the error is about waiting for a free connection in our own pool, not about reaching the database.',
        },
      ],
      explanation:
        'Read logs for timing and patterns. A deploy seconds before the errors start is the prime suspect. A cache can hide a database problem for reads, but not for writes like checkout.',
    },
    {
      id: 'mitigate',
      kind: 'choose',
      situation:
        'The v4.12.0 changelog says Otto refactored how checkout opens database connections.',
      question: 'What do you do now, at 3am?',
      options: [
        {
          id: 'debug-live',
          text: 'Experiment with the connection code in production.',
          correct: false,
          feedback: 'Customers keep failing while you experiment.',
        },
        {
          id: 'wait',
          text: 'Wait for the morning team.',
          correct: false,
          feedback: 'A third of checkouts fail every minute you wait.',
        },
        {
          id: 'hotfix',
          text: 'Ask Otto for a quick fix and deploy it straight away.',
          correct: false,
          feedback:
            'An unreviewed fix at 3am, for a cause you haven’t confirmed, can make things worse.',
        },
        {
          id: 'rollback',
          text: 'Roll back to v4.11.0, check the errors drop, then investigate.',
          correct: true,
          feedback: 'Stop the damage first, then diagnose while customers are unaffected.',
        },
      ],
      explanation:
        'Mitigate first, then fix. Rolling back to the last good version is usually the fastest way to restore service. The root cause can wait an hour; customers can’t.',
    },
    {
      id: 'tell-people',
      kind: 'choose',
      situation:
        'The rollback is running. Priya runs support and will wake to angry emails. Quillwork has an #incidents channel.',
      question: 'What do you post there now?',
      options: [
        {
          id: 'silence',
          text: 'Nothing until it’s fixed. Why worry people?',
          correct: false,
          feedback:
            'Support hears it from customers instead of from you, and nobody knows anyone is on it.',
        },
        {
          id: 'status',
          text: 'Checkout failing for ~30% since 02:40, likely the v4.12.0 deploy. Rolling back now. Next update by 03:15.',
          correct: true,
          feedback: 'Impact, what you think, what you’re doing, and when they’ll hear more.',
        },
        {
          id: 'deep-dive',
          text: 'A full technical analysis of the connection pool.',
          correct: false,
          feedback:
            'Too early, and the wrong audience. Say what’s happening and when you’ll update.',
        },
        {
          id: 'blame',
          text: 'Otto broke checkout again.',
          correct: false,
          feedback: 'Blame helps nobody, and it isn’t even confirmed. Stick to impact and actions.',
        },
      ],
      explanation:
        'During an incident, short regular updates beat silence. Say who’s affected, what you’re doing and when the next update comes, even before you know the cause.',
    },
    {
      id: 'confirm',
      kind: 'choose',
      situation: 'The rollback finished. This is what you see now.',
      artifact: {
        kind: 'log',
        label: 'after the rollback',
        text: [
          '02:52:10 INFO  deploy v4.11.0 complete (rollback)',
          '02:52:14 INFO  req=f3a0 POST /api/checkout 201 210ms',
          '02:52:15 INFO  req=f3a1 POST /api/checkout 201 190ms',
          '02:57:00 METRIC errors=0.4% p95=190ms db_connections=23/100',
        ].join('\n'),
      },
      question: 'Is it resolved?',
      options: [
        {
          id: 'done',
          text: 'Fully fixed. Redeploy v4.12.0 tomorrow.',
          correct: false,
          feedback: 'It would break again the same way.',
        },
        {
          id: 'unclear',
          text: 'You can’t tell from this.',
          correct: false,
          feedback: '201s, a normal error rate and free connections are clear signs.',
        },
        {
          id: 'mitigated',
          text: 'Mitigated: the numbers are back to normal, but v4.12.0 needs a fix before it ships again.',
          correct: true,
          feedback: 'Right: service is back, but the bug isn’t gone.',
        },
      ],
      explanation:
        'Watch the numbers recover before standing down. Then make sure the broken version can’t be deployed again until it’s fixed.',
    },
    {
      id: 'root-cause',
      kind: 'prompt',
      situation: 'Morning. You ask Otto to help find the root cause.',
      question: 'Which instruction?',
      options: [
        {
          id: 'deploy',
          text: 'Fix it and deploy.',
          correct: false,
          feedback: 'A rushed, unreviewed fix is how incidents repeat.',
        },
        {
          id: 'evidence',
          text: 'Compare how v4.11.0 and v4.12.0 open and release database connections. Using these logs and metrics, explain why connections run out, add a test that fails on it, and propose a fix. Deploy nothing.',
          correct: true,
          feedback: 'Evidence, a failing test and a fix, with a clear boundary.',
        },
        {
          id: 'who',
          text: 'Find out who caused this.',
          correct: false,
          feedback: 'Blame makes people hide mistakes. Ask what failed, not who.',
        },
        {
          id: 'revert-forever',
          text: 'Revert v4.12.0 for good and never touch the connection code again.',
          correct: false,
          feedback:
            'The refactor had a reason. Find the bug; don’t throw away the work or the lesson.',
        },
      ],
      explanation:
        'Root cause analysis asks what happened, why, and which check would have caught it. Keep it based on evidence, and keep deploys under human review.',
    },
    {
      id: 'postmortem',
      kind: 'prompt',
      situation:
        'Otto found it: an error path in the refactor never released its connection. The fix is merged. Sage asks for a postmortem.',
      question: 'What do you ask Otto to draft?',
      options: [
        {
          id: 'names',
          text: 'A list of who made mistakes, so it doesn’t happen again.',
          correct: false,
          feedback: 'People who fear blame hide mistakes. Ask what failed, not who.',
        },
        {
          id: 'skip',
          text: 'Nothing. It’s fixed, so move on.',
          correct: false,
          feedback:
            'Then the same kind of bug ships next month. The fix is half the value; the lessons are the rest.',
        },
        {
          id: 'blameless',
          text: 'A blameless postmortem: a timeline from the logs, impact, root cause, what went well, and action items with owners, like an alert on db connections and a test for connection leaks.',
          correct: true,
          feedback:
            'Facts, impact and fixes to the system, so the next 3am page is shorter, or never comes.',
        },
      ],
      explanation:
        'A postmortem turns one bad night into lasting fixes. Keep it blameless and based on evidence, and make every action item something a person owns and can finish.',
    },
    {
      id: 'incident-steps',
      kind: 'order',
      situation: 'Summing up the night for the team.',
      question: 'Put incident response in order.',
      steps: [
        { id: 'detect', text: 'Get alerted and confirm the impact' },
        { id: 'mitigate', text: 'Mitigate: roll back or switch it off' },
        { id: 'verify', text: 'Check the numbers recover' },
        { id: 'root', text: 'Find the root cause' },
        { id: 'prevent', text: 'Fix it, and add a check so it can’t recur' },
      ],
      explanation:
        'Detect, mitigate, verify, then learn. Customers come first, understanding second, and prevention last, but never skipped.',
    },
  ],
} satisfies LessonInput;
