import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * The Mock Interview Loop: Act 8's final, standing in for its boss (DESIGN.md section 11).
 * One card for each round of a real loop, back to back on one clock, so it checks that
 * the habits from 8.1 to 8.4 hold up under a little pressure.
 */
export const theMockLoop = {
  id: 'the-mock-loop',
  act: 8,
  title: 'The Mock Interview Loop',
  kind: 'final',
  // Six minutes for eight cards: 45 seconds each, enough to read an artifact and think.
  timeLimitSeconds: 360,
  xp: 150,
  briefing: [
    'Sage runs the whole loop back to back: coding, debugging, design, customer, deep-dive, working with AI, and values.',
    'Six minutes on one clock. Answer the way you would in the room.',
  ],
  cards: [
    {
      id: 'loop-coding',
      kind: 'choose',
      situation:
        'Coding round, no AI. Otto’s word counter for Quillwork’s search page runs on the text “a b a”.',
      artifact: {
        kind: 'code',
        label: 'count_words.py',
        text: [
          'def count_words(text):',
          '    counts = {}',
          '    for word in text.split():',
          '        counts[word] += 1',
          '    return counts',
        ].join('\n'),
      },
      question: 'What happens?',
      options: [
        {
          id: 'works',
          text: 'It returns {"a": 2, "b": 1}.',
          correct: false,
          feedback: 'Trace the first word: counts["a"] doesn’t exist yet.',
        },
        {
          id: 'split',
          text: 'A TypeError, because split() needs an argument.',
          correct: false,
          feedback: 'With no argument, split() splits on any whitespace. That part is fine.',
        },
        {
          id: 'empty',
          text: 'It returns an empty dict.',
          correct: false,
          feedback: 'It never gets as far as returning.',
        },
        {
          id: 'key-error',
          text: 'A KeyError on the first word. Use counts.get(word, 0) + 1.',
          correct: true,
          feedback: 'Yes: += reads the key before writing it, so it must already exist.',
        },
      ],
      explanation:
        'Trace code with a tiny input before trusting it. Reading a key that was never set raises a KeyError; dict.get with a default, or collections.Counter, handles first-time keys.',
    },
    {
      id: 'loop-debugging',
      kind: 'choose',
      situation:
        'Debugging round: Quillwork’s usage reports got slower all month, then started timing out.',
      artifact: {
        kind: 'log',
        label: 'report-service',
        text: [
          'Sep 02  GET /api/report  200    120ms',
          'Sep 16  GET /api/report  200   1900ms',
          'Sep 29  GET /api/report  200   9800ms',
          'Oct 02  GET /api/report  504  30000ms',
          'deploys since Sep 02: none touching reports',
        ].join('\n'),
      },
      question: 'What’s your first guess to test?',
      options: [
        {
          id: 'deploy',
          text: 'A bad deploy last week.',
          correct: false,
          feedback:
            'The log says nothing touching reports was deployed, and the slowdown is gradual.',
        },
        {
          id: 'growth',
          text: 'The data grew and the report’s query doesn’t scale, probably a missing index.',
          correct: true,
          feedback: 'A steady slowdown with no code change points at growing data.',
        },
        {
          id: 'frontend',
          text: 'The frontend is rendering too slowly.',
          correct: false,
          feedback: 'The server’s own log shows the slow responses.',
        },
      ],
      explanation:
        'Match the shape of the symptom to a cause. Sudden means something changed; gradual with no change usually means growing data. Then test that guess with evidence.',
    },
    {
      id: 'loop-debug-agent',
      kind: 'prompt',
      situation: 'Sage hands you Otto for the next step on the slow reports.',
      question: 'What do you tell him?',
      options: [
        {
          id: 'explain',
          text: 'Run EXPLAIN ANALYZE on the report query against the staging copy of the data. Show me where the time goes. Don’t change anything yet.',
          correct: true,
          feedback: 'Read-only, aimed at the evidence, and you decide the fix.',
        },
        {
          id: 'faster',
          text: 'Make the reports faster.',
          correct: false,
          feedback:
            'Otto might add caching everywhere and call it done, with no proof of the cause.',
        },
        {
          id: 'servers',
          text: 'Double the database server’s size.',
          correct: false,
          feedback: 'It buys a few weeks, costs every month, and the query still grows.',
        },
      ],
      explanation:
        'Point the agent at evidence before fixes, and keep it read-only until you know the cause. The query plan shows exactly where the time goes.',
    },
    {
      id: 'loop-design',
      kind: 'choose',
      situation:
        'Design round: Quillwork users will upload images into docs, and thumbnails must appear within a minute.',
      question: 'Which design fits?',
      options: [
        {
          id: 'queue',
          text: 'Save the upload, queue a thumbnail job, and let workers make and store it.',
          correct: true,
          feedback: 'Uploads stay fast, and the work scales with the workers.',
        },
        {
          id: 'inline',
          text: 'Make the thumbnail inside the upload request.',
          correct: false,
          feedback: 'Uploads get slow, and a failed thumbnail can fail the whole upload.',
        },
        {
          id: 'users',
          text: 'Ask users to upload a thumbnail as well.',
          correct: false,
          feedback: 'That pushes your job onto your users.',
        },
      ],
      explanation:
        '“Within a minute” tells you it can happen in the background, so it goes on a queue. Say that link between the requirement and the design out loud.',
    },
    {
      id: 'loop-customer',
      kind: 'choose',
      situation:
        'Customer round: “Your export dropped half our rows! Our finance team is furious.” You don’t know the cause yet.',
      question: 'Your first reply?',
      options: [
        {
          id: 'deny',
          text: 'Our export doesn’t drop rows.',
          correct: false,
          feedback: 'Denying before checking ends trust, and you might be wrong.',
        },
        {
          id: 'their-side',
          text: 'Your spreadsheet probably cut them off.',
          correct: false,
          feedback: 'Maybe. Check first, then explain with evidence.',
        },
        {
          id: 'fix-tonight',
          text: 'It’ll be fixed tonight, guaranteed.',
          correct: false,
          feedback: 'You don’t know the cause yet. Don’t promise a time you can’t control.',
        },
        {
          id: 'acknowledge',
          text: 'I’m sorry. Can you send the export and which rows are missing? You’ll hear from me by 3pm.',
          correct: true,
          feedback: 'Calm, specific, and a time you can keep.',
        },
      ],
      explanation:
        'Customers want to feel heard and see a plan. Acknowledge the impact, gather facts, and promise the next update, not the fix. Then explain the cause and what changes.',
    },
    {
      id: 'loop-deep-dive',
      kind: 'choose',
      situation: 'Deep-dive: “What was the hardest bug in SandCastles?”',
      question: 'Which answer is strongest?',
      options: [
        {
          id: 'vague',
          text: 'There were lots of hard bugs. It was a tough project.',
          correct: false,
          feedback: 'A vague answer sounds like no answer.',
        },
        {
          id: 'specific',
          text: 'One bug: the symptom, how I found the cause, the fix, and the test I added.',
          correct: true,
          feedback: 'Concrete and methodical, and it ends with prevention.',
        },
        {
          id: 'ai',
          text: 'None really. The AI fixed everything.',
          correct: false,
          feedback: 'Directing AI is a skill. Explain how you checked its fixes.',
        },
      ],
      explanation:
        'Specific stories beat general claims. Show the method: symptom, guess, evidence, fix, guard. Credit your tools, and own the judgment.',
    },
    {
      id: 'loop-ai',
      kind: 'prompt',
      situation:
        'AI round: Sage gives you Otto and a ticket, “Add CSV export to the invoices page.” You have one message.',
      question: 'Which first instruction?',
      options: [
        {
          id: 'brief',
          text: 'Add CSV export to the invoices page. Only touch src/export/. Show me a plan and wait for my OK. Then show the diff and tests for no invoices and 10,000 invoices.',
          correct: true,
          feedback: 'Scope, a checkpoint, and proof. That’s a brief, not a wish.',
        },
        {
          id: 'just-do',
          text: 'Add CSV export. Push to main when it works.',
          correct: false,
          feedback: '“When it works” by whose check? And straight to main skips review.',
        },
        {
          id: 'everything',
          text: 'Add CSV, Excel and PDF export to every page, since we’ll want them eventually.',
          correct: false,
          feedback: 'Scope creep: a big diff nobody asked for, and much harder to review.',
        },
      ],
      explanation:
        'Interviewers want to know you can direct agents safely: a clear scope, a plan before code, a checkpoint, and evidence at the end. Name those habits, with an example.',
    },
    {
      id: 'loop-values',
      kind: 'order',
      situation: 'Values round: “Tell me about a time you broke something in production.”',
      question: 'Put your answer in order.',
      steps: [
        { id: 'situation', text: 'The situation: what you were working on' },
        { id: 'mistake', text: 'The mistake, said plainly' },
        { id: 'impact', text: 'The impact on users and the team' },
        { id: 'fix', text: 'What you did to fix it' },
        { id: 'change', text: 'The habit you changed so it won’t repeat' },
      ],
      explanation:
        'Set the scene, own the mistake, show you understood the impact, then the fix, then the lasting change. Ending on what you changed shows you learn, which is what they’re listening for.',
    },
  ],
} satisfies LessonInput;
