import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Act 8: The Loop (DESIGN.md section 11), taught as lessons: the habits an interview
 * loop listens for in coding, debugging, design, customer, deep-dive and values rounds.
 * They're the habits the earlier Acts built, said out loud.
 */

export const thinkOutLoud = {
  id: 'think-out-loud',
  act: 8,
  title: 'Think Out Loud',
  briefing: [
    'Interviews test how you think, not just what you know.',
    'Say your plan, check your assumptions, test as you go. These rounds reward the habits you’ve built.',
  ],
  cards: [
    {
      id: 'clarify',
      kind: 'choose',
      situation: 'The interviewer says: “Write a function that removes duplicates from a list.”',
      question: 'What do you do first?',
      options: [
        {
          id: 'type',
          text: 'Start typing straight away.',
          correct: false,
          feedback: 'You might solve the wrong problem quickly.',
        },
        {
          id: 'silent',
          text: 'Think silently for five minutes.',
          correct: false,
          feedback: 'They can’t follow silent thinking. Talk.',
        },
        {
          id: 'ask',
          text: 'Ask: keep the original order? What types? How big can the list get?',
          correct: true,
          feedback: 'Clarifying turns a vague task into a spec.',
        },
      ],
      explanation:
        'Interviewers leave tasks vague on purpose. Asking about inputs, outputs and edge cases is part of the answer, exactly like writing a brief for an agent.',
    },
    {
      id: 'complexity',
      kind: 'choose',
      situation: 'You wrote this, keeping the original order.',
      artifact: {
        kind: 'code',
        label: 'solution.py',
        text: [
          'def dedupe(items):',
          '    seen = set()',
          '    result = []',
          '    for item in items:',
          '        if item not in seen:',
          '            seen.add(item)',
          '            result.append(item)',
          '    return result',
        ].join('\n'),
      },
      question: 'How does it perform on a million items?',
      options: [
        {
          id: 'quadratic',
          text: 'Quadratic: it compares every pair.',
          correct: false,
          feedback: 'Searching a list would. A set lookup takes constant time on average.',
        },
        {
          id: 'linear',
          text: 'Roughly linear: each set lookup is fast on average.',
          correct: true,
          feedback: 'Yes, about O(n).',
        },
        {
          id: 'too-big',
          text: 'It can’t handle a million items.',
          correct: false,
          feedback: 'It handles them fine.',
        },
      ],
      explanation:
        'Know why your code is fast or slow. Sets and dicts give near-instant lookups; searching a list is linear. Say the trade-off out loud.',
    },
    {
      id: 'traceback',
      kind: 'choose',
      situation: 'Debugging round: the report script crashes.',
      artifact: {
        kind: 'error',
        label: 'traceback',
        text: [
          'Traceback (most recent call last):',
          '  File "report.py", line 14, in <module>',
          '    print(average(scores))',
          '  File "report.py", line 4, in average',
          '    return sum(values) / len(values)',
          'ZeroDivisionError: division by zero',
        ].join('\n'),
      },
      question: 'What’s happening?',
      options: [
        {
          id: 'empty',
          text: 'scores is empty, so len is 0. Decide what an empty average should be, and handle it.',
          correct: true,
          feedback: 'Yes, and you named the decision to make.',
        },
        {
          id: 'sum',
          text: 'sum() is broken.',
          correct: false,
          feedback: 'Built-in functions are almost never the bug.',
        },
        {
          id: 'line-14',
          text: 'The print on line 14 is wrong.',
          correct: false,
          feedback: 'Line 14 made the call. Line 4 is where it failed.',
        },
      ],
      explanation:
        'Read a Python traceback from the bottom: the error, the line that raised it, then the calls that led there. Then ask which input causes it.',
    },
    {
      id: 'debug-method',
      kind: 'order',
      situation: 'You face a bug you don’t understand yet.',
      question: 'Put a good debugging method in order.',
      steps: [
        { id: 'reproduce', text: 'Reproduce it reliably' },
        { id: 'hypothesis', text: 'Guess a cause you can test' },
        { id: 'test', text: 'Test the guess with a print, debugger or test' },
        { id: 'fix', text: 'Fix the cause, not the symptom' },
        { id: 'guard', text: 'Add a test so it stays fixed' },
      ],
      explanation:
        'Reproduce, guess, test, fix, guard. Saying each step out loud shows the interviewer a method, not luck.',
    },
    {
      id: 'stuck',
      kind: 'choose',
      situation: 'You’ve been stuck for two minutes in the coding round.',
      question: 'Best move?',
      options: [
        {
          id: 'quiet',
          text: 'Stay quiet and hope it comes to you.',
          correct: false,
          feedback: 'Silence looks the same as giving up.',
        },
        {
          id: 'fake',
          text: 'Write code you know is wrong, to look busy.',
          correct: false,
          feedback: 'It wastes time and trust.',
        },
        {
          id: 'say',
          text: 'Say where you’re stuck and what you’ve tried, then try a simpler version first.',
          correct: true,
          feedback: 'Interviewers can help when they can see your thinking.',
        },
      ],
      explanation:
        'Getting stuck is normal. Narrate it, solve a smaller case, or write a slow version first and improve it. Working code beats perfect ideas.',
    },
    {
      id: 'edge-cases',
      kind: 'choose',
      situation: 'Your function works on the interviewer’s example.',
      question: 'What do you do before saying it’s done?',
      options: [
        {
          id: 'done',
          text: 'Say it’s done.',
          correct: false,
          feedback: 'One example rarely covers the edge cases.',
        },
        {
          id: 'edges',
          text: 'Test edge cases out loud: an empty list, one item, all duplicates.',
          correct: true,
          feedback: 'You catch your own bugs before they do.',
        },
        {
          id: 'their-job',
          text: 'Ask them to find the bugs.',
          correct: false,
          feedback: 'Testing your code is your job here.',
        },
      ],
      explanation:
        'Walk through edge cases before declaring victory: empty, one, many, duplicates, huge. It’s the same habit you’d ask of any agent.',
    },
    {
      id: 'practice-partner',
      kind: 'prompt',
      situation:
        'You want an AI to help you prepare for the coding round, which allows no AI, without doing the work for you.',
      question: 'Which instruction?',
      options: [
        {
          id: 'coach',
          text: 'Give me one interview-level Python problem. No hints or solutions unless I ask. When I submit, review it like an interviewer: correctness, edge cases, speed.',
          correct: true,
          feedback: 'The practice stays yours, and the feedback stays honest.',
        },
        {
          id: 'memorise',
          text: 'Solve ten interview problems so I can memorise the answers.',
          correct: false,
          feedback: 'Memorised answers fall apart at the first follow-up question.',
        },
        {
          id: 'flatter',
          text: 'Tell me my code is good so I feel confident.',
          correct: false,
          feedback: 'Flattery doesn’t prepare you. Ask for an honest review.',
        },
      ],
      explanation:
        'AI makes a great practice partner when you set the rules: it asks, you solve, it reviews. The live coding round has no AI, so the skill has to be yours.',
    },
  ],
} satisfies LessonInput;

export const designAndCustomers = {
  id: 'design-and-customers',
  act: 8,
  title: 'Design and Customers',
  briefing: [
    'In system design and customer rounds, there’s no single right answer.',
    'They want trade-offs said clearly, questions asked early, and the customer’s real problem solved.',
  ],
  cards: [
    {
      id: 'design-start',
      kind: 'choose',
      situation: 'System design round: “Design a URL shortener.”',
      question: 'How do you start?',
      options: [
        {
          id: 'database',
          text: 'Pick a database first.',
          correct: false,
          feedback: 'You don’t yet know what it must store, or how fast.',
        },
        {
          id: 'boxes',
          text: 'Draw twenty boxes straight away.',
          correct: false,
          feedback: 'Boxes without requirements are guesses.',
        },
        {
          id: 'requirements',
          text: 'Agree the requirements and scale: reads per second, custom links, expiry, analytics?',
          correct: true,
          feedback: 'Scale and features decide the design.',
        },
      ],
      explanation:
        'Start with requirements, both features and scale, then a simple design, then the bottlenecks. Every choice should trace back to a requirement.',
    },
    {
      id: 'trade-off',
      kind: 'choose',
      situation: 'Link lookups happen 100 times as often as new links are made.',
      question: 'What do you add?',
      options: [
        {
          id: 'writes',
          text: 'More servers for making links.',
          correct: false,
          feedback: 'Making links isn’t the bottleneck.',
        },
        {
          id: 'cache',
          text: 'A cache in front of the database for link lookups.',
          correct: true,
          feedback: 'It serves the busy path from memory.',
        },
        {
          id: 'nothing',
          text: 'Nothing. One database is fine at any scale.',
          correct: false,
          feedback: 'Say where it breaks, then fix that.',
        },
      ],
      explanation:
        'Optimise the path that dominates. Heavy reads point to caches and read copies; heavy writes point to queues and splitting data. Say the cost too: caches can serve stale data.',
    },
    {
      id: 'customer-listen',
      kind: 'choose',
      situation: 'Customer round: a client says “Your API is slow. We need a faster API.”',
      question: 'What do you ask?',
      options: [
        {
          id: 'which',
          text: 'Which calls are slow, how slow, when, and what are they trying to do?',
          correct: true,
          feedback: 'Find the real problem before promising a fix.',
        },
        {
          id: 'promise',
          text: 'Promise an API ten times faster by next week.',
          correct: false,
          feedback: 'Promises before facts break trust.',
        },
        {
          id: 'their-network',
          text: 'Explain that their network is slow.',
          correct: false,
          feedback: 'Maybe, but you don’t know yet, and it sounds defensive.',
        },
      ],
      explanation:
        'Customer-facing engineering starts with listening. The request, a faster API, is often a symptom; the real need might be one batch call or a cache on their side.',
    },
    {
      id: 'customer-fix',
      kind: 'choose',
      situation: 'It turns out they call GET /orders/:id 5,000 times in a loop every morning.',
      question: 'Best recommendation?',
      options: [
        {
          id: 'limit',
          text: 'Rate-limit them harder.',
          correct: false,
          feedback: 'Their job breaks, and they get angrier.',
        },
        {
          id: 'servers',
          text: 'Add servers to keep up with the loop.',
          correct: false,
          feedback: 'Costly, and the loop is still slow.',
        },
        {
          id: 'batch',
          text: 'Offer a batch endpoint or a filtered list call, and show them how to use it.',
          correct: true,
          feedback: 'It solves the real need in one call.',
        },
      ],
      explanation:
        'Solve the customer’s actual workflow. Often the best fix is a better way to use the system plus clear docs, not more hardware.',
    },
    {
      id: 'deep-dive',
      kind: 'choose',
      situation: 'Project deep-dive: “Tell me about SandCastles.”',
      question: 'What makes a strong answer?',
      options: [
        {
          id: 'tech-list',
          text: 'A list of every technology it uses.',
          correct: false,
          feedback: 'A list shows no judgment.',
        },
        {
          id: 'decisions',
          text: 'The problem, your decisions and why, what went wrong, and what you’d change.',
          correct: true,
          feedback: 'Decisions and lessons show seniority.',
        },
        {
          id: 'perfect',
          text: 'Say it all went perfectly.',
          correct: false,
          feedback: 'Nobody believes that, and it hides what you learned.',
        },
      ],
      explanation:
        'Tell it as situation, task, action, result. Own your decisions, including the ones you’d change, and say how you directed AI and checked its work.',
    },
    {
      id: 'values',
      kind: 'choose',
      situation: 'Values round: “Tell me about a time you disagreed with a teammate.”',
      question: 'What’s the best shape for the answer?',
      options: [
        {
          id: 'real',
          text: 'A real example: the disagreement, how you listened, the evidence you used, and the outcome.',
          correct: true,
          feedback: 'It shows you handle conflict with respect and facts.',
        },
        {
          id: 'never',
          text: 'Say you never disagree with people.',
          correct: false,
          feedback: 'Nobody believes it, and it suggests you avoid hard conversations.',
        },
        {
          id: 'won',
          text: 'A story where you were right and they were wrong.',
          correct: false,
          feedback: 'It’s about how you handled it, not who won.',
        },
      ],
      explanation:
        'Values questions check how you’d behave on the team. Pick a real story, show listening and evidence, and say what you learned.',
    },
  ],
} satisfies LessonInput;

export const theMockLoop = {
  id: 'the-mock-loop',
  act: 8,
  title: 'The Mock Interview Loop',
  kind: 'final',
  timeLimitSeconds: 420,
  xp: 150,
  briefing: [
    'The full loop, back to back: coding, debugging, design, customer, deep-dive, AI, and values.',
    'Seven minutes on one clock. Answer the way you would in the room.',
  ],
  cards: [
    {
      id: 'loop-coding',
      kind: 'choose',
      situation: 'Coding round, no AI. You run this on the text "a b a".',
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
          feedback: 'Not before the first key exists.',
        },
        {
          id: 'type-error',
          text: 'A TypeError on split.',
          correct: false,
          feedback: 'split works fine on text.',
        },
        {
          id: 'key-error',
          text: 'A KeyError: counts[word] doesn’t exist the first time. Use counts.get(word, 0) + 1.',
          correct: true,
          feedback: 'Yes: += reads the key before writing it, so it must exist.',
        },
      ],
      explanation:
        'Trace your code with a tiny input before running it. dict.get with a default, or collections.Counter, handles keys seen for the first time.',
    },
    {
      id: 'loop-debugging',
      kind: 'choose',
      situation: 'Debugging round: reports got slow, then started timing out.',
      artifact: {
        kind: 'log',
        label: 'report-service',
        text: [
          'GET /api/report 200   120ms',
          'GET /api/report 200   140ms',
          'GET /api/report 200  9800ms',
          'GET /api/report 504 30000ms',
        ].join('\n'),
      },
      question: 'What do you ask first?',
      options: [
        {
          id: 'restart',
          text: 'Can we restart the server?',
          correct: false,
          feedback: 'It treats the symptom and loses the evidence.',
        },
        {
          id: 'what-changed',
          text: 'What changed, and is the data growing? Then look at the report’s query.',
          correct: true,
          feedback: 'Change and growth explain most slowdowns.',
        },
        {
          id: 'frontend',
          text: 'Is the frontend broken?',
          correct: false,
          feedback: 'The server’s own log shows the slow responses.',
        },
      ],
      explanation:
        'Narrow it down: when it started, what changed, which part is slow. A gradual slowdown often means growing data and a missing index.',
    },
    {
      id: 'loop-design',
      kind: 'choose',
      situation: 'Design round: users upload photos, and thumbnails must appear within a minute.',
      question: 'Which design fits?',
      options: [
        {
          id: 'queue',
          text: 'Save the upload, queue a thumbnail job, and let workers make and store the thumbnail.',
          correct: true,
          feedback: 'Uploads stay fast, and the work scales with the workers.',
        },
        {
          id: 'inline',
          text: 'Make thumbnails inside the upload request.',
          correct: false,
          feedback: 'Uploads get slow, and a failure loses the photo.',
        },
        {
          id: 'users',
          text: 'Ask users to upload thumbnails too.',
          correct: false,
          feedback: 'That pushes your job onto your users.',
        },
      ],
      explanation:
        'Slow work goes on a queue. “Within a minute” tells you it can happen in the background, so say that link between requirement and design out loud.',
    },
    {
      id: 'loop-customer',
      kind: 'choose',
      situation: 'Customer round: “Your webhook didn’t fire for 40 of our orders yesterday!”',
      question: 'Your first response?',
      options: [
        {
          id: 'deny',
          text: 'Our system doesn’t miss webhooks.',
          correct: false,
          feedback: 'Denying before checking ends trust.',
        },
        {
          id: 'their-fault',
          text: 'Your server must have been down.',
          correct: false,
          feedback: 'Maybe. Check first, then explain with evidence.',
        },
        {
          id: 'acknowledge',
          text: 'Acknowledge the impact, ask for the order ids and times, and say when they’ll hear from you next.',
          correct: true,
          feedback: 'Calm, specific and accountable.',
        },
      ],
      explanation:
        'Customers want to feel heard and see a plan. Gather facts, check the logs, give a time for the next update, then explain the cause and the fix.',
    },
    {
      id: 'loop-deep-dive',
      kind: 'choose',
      situation: 'Deep-dive: “What was the hardest bug in SandCastles?”',
      question: 'Which answer is strongest?',
      options: [
        {
          id: 'vague',
          text: 'There were lots of hard bugs.',
          correct: false,
          feedback: 'A vague answer sounds like no answer.',
        },
        {
          id: 'specific',
          text: 'One specific bug: the symptoms, how you found the cause, the fix, and the test you added.',
          correct: true,
          feedback: 'Concrete and methodical, and it ends with prevention.',
        },
        {
          id: 'ai',
          text: 'None. The AI fixed everything.',
          correct: false,
          feedback: 'Directing AI is the skill. Explain how you checked its fix.',
        },
      ],
      explanation:
        'Specific stories beat general claims. Show the method: symptom, guess, evidence, fix, guard. Credit your tools, but own the judgment.',
    },
    {
      id: 'loop-ai',
      kind: 'prompt',
      situation: 'Bonus round: “How do you work with AI coding agents?”',
      question: 'Which answer shows the most skill?',
      options: [
        {
          id: 'method',
          text: 'I write a short brief with limits and proof, ask for a plan first, review every diff, require test output, and keep secrets and destructive actions behind my approval.',
          correct: true,
          feedback: 'It’s a method, and it’s what you practised in Act 7.',
        },
        {
          id: 'ship-it',
          text: 'I let it write everything and ship whatever works.',
          correct: false,
          feedback: '“Whatever works” was never checked.',
        },
        {
          id: 'avoid',
          text: 'I don’t trust AI, so I avoid it.',
          correct: false,
          feedback: 'Teams expect you to use it well, not avoid it.',
        },
      ],
      explanation:
        'Interviewers want to know you can direct agents safely: briefs, plans, reviews, evidence and guardrails. Name the habits, with an example.',
    },
    {
      id: 'loop-values',
      kind: 'choose',
      situation: 'Values round: “Tell me about a mistake you made.”',
      question: 'What makes the answer good?',
      options: [
        {
          id: 'none',
          text: 'Say you don’t make mistakes.',
          correct: false,
          feedback: 'Everyone does. This suggests you hide them.',
        },
        {
          id: 'deflect',
          text: 'Explain why it was someone else’s fault.',
          correct: false,
          feedback: 'Deflecting is the opposite of what they want to hear.',
        },
        {
          id: 'own',
          text: 'Own it plainly: the impact, what you did to fix it, and what you changed afterwards.',
          correct: true,
          feedback: 'Ownership and learning are what they’re listening for.',
        },
      ],
      explanation:
        'Good engineers make mistakes and learn from them openly. Show the fix and the habit you changed: that’s what makes you safe to trust with production.',
    },
  ],
} satisfies LessonInput;

/** Act 8's lessons in play order, final last. */
export const act8Lessons: readonly LessonInput[] = [thinkOutLoud, designAndCustomers, theMockLoop];
