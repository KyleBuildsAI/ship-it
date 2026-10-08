import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * 8.3 Design Trade-offs: the system design round. There's no single right answer, so the
 * lesson rewards the habits that make any answer good: requirements first, the simplest
 * design that works, the real bottleneck, and the cost of every fix said out loud.
 */
export const designTradeOffs = {
  id: 'design-trade-offs',
  act: 8,
  title: 'Design Trade-offs',
  briefing: [
    'The design round: Sage plays the interviewer, and the systems are Quillwork’s own.',
    'There’s no single right answer. Start from the requirements, keep it simple, and say what each choice costs.',
  ],
  cards: [
    {
      id: 'requirements-first',
      kind: 'choose',
      situation:
        'Marco wants a feature: “Anyone with the link can view a Quillwork doc.” Sage says: “Design it.”',
      question: 'How do you start?',
      options: [
        {
          id: 'requirements',
          text: 'Agree the requirements: can links expire or be revoked? View only, or edit too? How many views a day?',
          correct: true,
          feedback: 'Those answers decide the design. Everything after traces back to them.',
        },
        {
          id: 'database',
          text: 'Pick the database first, since everything else sits on it.',
          correct: false,
          feedback: 'You don’t know yet what it must store or how fast it must answer.',
        },
        {
          id: 'diagram',
          text: 'Draw a big diagram with a load balancer, cache and queue straight away.',
          correct: false,
          feedback:
            'Boxes before requirements are guesses, and they may solve problems you don’t have.',
        },
      ],
      explanation:
        'Start with what it must do and how big it must get. A design is only good relative to its requirements, and asking shows the interviewer you won’t build the wrong thing well.',
    },
    {
      id: 'read-heavy',
      kind: 'choose',
      situation: 'Sage shows a week of numbers for shared links.',
      artifact: {
        kind: 'log',
        label: 'metrics · last 7 days',
        text: [
          'links created        12,400',
          'link views        1,310,000',
          'p95 view latency      840ms',
          'db CPU (peak)           92%',
          'top query: SELECT * FROM docs WHERE share_token = $1',
        ].join('\n'),
      },
      question: 'What do you change first?',
      options: [
        {
          id: 'writes',
          text: 'Add servers for creating links.',
          correct: false,
          feedback: 'Creating is about 1% of the traffic. It isn’t what’s hurting.',
        },
        {
          id: 'rewrite',
          text: 'Rewrite the service in a faster language.',
          correct: false,
          feedback: 'The database is at 92%. The language isn’t the bottleneck.',
        },
        {
          id: 'index-cache',
          text: 'Index share_token, then cache doc lookups by token. Say the cost: a revoked link may work until the cache entry expires.',
          correct: true,
          feedback: 'You fixed the busy path and named the trade-off.',
        },
      ],
      explanation:
        'Fix the path that dominates. Views outnumber creates 100 to 1, so speed up reads: an index first, then a cache. Every fix has a cost, and caches can serve stale data. Say so before they ask.',
    },
    {
      id: 'slow-work',
      kind: 'choose',
      situation:
        'Exporting a long doc to PDF takes about 40 seconds. Requests time out at 30, so big exports fail every time.',
      question: 'Which design fits?',
      options: [
        {
          id: 'timeout',
          text: 'Raise the request timeout to two minutes.',
          correct: false,
          feedback: 'It works until a doc takes 121 seconds, and each wait holds a server busy.',
        },
        {
          id: 'bigger',
          text: 'Buy a bigger server so PDFs render faster.',
          correct: false,
          feedback: 'Faster for now. Docs keep growing, and you pay for it all day.',
        },
        {
          id: 'client',
          text: 'Make the browser build the PDF instead.',
          correct: false,
          feedback: 'Slow laptops and phones would struggle, and you lose control of the output.',
        },
        {
          id: 'queue',
          text: 'Accept the request, put a job on a queue, and let a worker build the PDF. Show progress, then a download link.',
          correct: true,
          feedback: 'The request is instant, and the slow work happens in the background.',
        },
      ],
      explanation:
        'Slow work goes on a queue. The request returns at once with a job id, a worker does the heavy part, and the user is told when it’s ready. Failed jobs can retry without the user doing anything.',
    },
    {
      id: 'design-order',
      kind: 'order',
      situation: 'Sage asks how you run any design round from start to finish.',
      question: 'Put the steps in order.',
      steps: [
        { id: 'clarify', text: 'Clarify the requirements and the scale' },
        { id: 'simple', text: 'Sketch the simplest design that works' },
        { id: 'bottleneck', text: 'Find where it breaks first under load' },
        { id: 'improve', text: 'Improve that part and say what it costs' },
        { id: 'monitor', text: 'Say what you’d measure to know it’s healthy' },
      ],
      explanation:
        'Requirements, simple design, bottleneck, improvement with its cost, then monitoring. It keeps you from over-building and shows you think about running the system, not just drawing it.',
    },
    {
      id: 'why-postgres',
      kind: 'choose',
      situation: 'Sage pushes back: “Why did Quillwork pick Postgres and not a NoSQL database?”',
      question: 'Which answer is strongest?',
      options: [
        {
          id: 'best',
          text: 'Postgres is simply the best database.',
          correct: false,
          feedback: 'Nothing is best for everything. It sounds like a habit, not a decision.',
        },
        {
          id: 'scale',
          text: 'NoSQL scales better, so we should probably switch.',
          correct: false,
          feedback: 'At what scale, for which data? Quillwork’s load fits one database easily.',
        },
        {
          id: 'fit',
          text: 'Users, docs and permissions are related data that must stay consistent. The team knows SQL, and our scale fits. I’d revisit at 100x the load.',
          correct: true,
          feedback:
            'Tied to the requirements, honest about limits, and says what would change your mind.',
        },
        {
          id: 'ai',
          text: 'Otto suggested it, so I went with it.',
          correct: false,
          feedback: 'Agents suggest; you decide. Show the reasons you checked.',
        },
      ],
      explanation:
        'A good trade-off answer names the requirement, the choice, what it costs, and what would make you change it. That’s the shape interviewers listen for, for any technology.',
    },
    {
      id: 'brief-a-design',
      kind: 'prompt',
      situation:
        'Customers hammer the public API, and Marco wants rate limits. You ask Otto for a design before any code.',
      question: 'Which instruction?',
      options: [
        {
          id: 'add-it',
          text: 'Add rate limiting to the API.',
          correct: false,
          feedback:
            'Otto will pick something and build it. You won’t see the choices he made for you.',
        },
        {
          id: 'best',
          text: 'Design the best rate limiter possible, ready for millions of users.',
          correct: false,
          feedback: 'Quillwork has two servers. “Millions” invites a design you can’t run.',
        },
        {
          id: 'options',
          text: 'Propose two rate-limit designs for our API: a limit of about 50 requests a second per customer, 2 servers. For each, say how it works, what happens if Redis goes down, and the cost. No code yet.',
          correct: true,
          feedback: 'Real numbers, a failure question, and a choice for you to make.',
        },
      ],
      explanation:
        'Ask an agent for options with trade-offs, sized to your real numbers, before it writes code. You stay the one who decides, and the failure question surfaces the risk an agent won’t raise by itself.',
    },
    {
      id: 'right-size',
      kind: 'prompt',
      situation:
        'Otto’s design for the share feature splits Quillwork’s app into nine microservices. The whole team is four people.',
      question: 'What do you tell him?',
      options: [
        {
          id: 'monolith',
          text: 'Keep it in the one app we have, plus a job queue for slow work. List what would make us split a service out later, with numbers.',
          correct: true,
          feedback: 'Simple enough for four people to run, with a clear signal for when to grow.',
        },
        {
          id: 'approve',
          text: 'Looks great. Start building all nine.',
          correct: false,
          feedback: 'Nine services means nine deploys, logs and failure points for four people.',
        },
        {
          id: 'twenty',
          text: 'Split it further, so each service does exactly one thing.',
          correct: false,
          feedback: 'Smaller pieces add more network calls and more to run, not less.',
        },
      ],
      explanation:
        'Fit the design to the team running it. Every service adds deploys, monitoring and failure modes. Start simple, and agree on the signal that would justify splitting, so it’s a decision, not a fashion.',
    },
    {
      id: 'single-point',
      kind: 'choose',
      situation: 'Sage shows Quillwork’s whole setup and asks: “What keeps you up at night?”',
      artifact: {
        kind: 'file',
        label: 'architecture.md',
        text: [
          '- 2 API servers behind a load balancer',
          '- 1 Postgres database (no replica)',
          '- Backups: none set up yet',
          '- Redis cache (can be rebuilt from Postgres)',
          '- PDF workers: 2, reading from a queue',
        ].join('\n'),
      },
      question: 'Which risk do you raise first?',
      options: [
        {
          id: 'redis',
          text: 'Redis has no copy.',
          correct: false,
          feedback: 'It can be rebuilt from Postgres. Losing it is slow, not fatal.',
        },
        {
          id: 'backups',
          text: 'The database has no backups. If it’s lost, every customer’s docs are gone for good.',
          correct: true,
          feedback: 'Yes. Everything else here can be rebuilt; that can’t.',
        },
        {
          id: 'workers',
          text: 'Two PDF workers might not be enough.',
          correct: false,
          feedback: 'The queue just waits longer. Slow exports aren’t lost data.',
        },
      ],
      explanation:
        'Rank risks by what can’t be undone. Slow is fixable; lost data isn’t. Backups that have been tested by actually restoring them come before any speed work.',
    },
  ],
} satisfies LessonInput;
