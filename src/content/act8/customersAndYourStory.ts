import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * 8.4 Customers and Your Story: the people rounds. A customer scenario in the style of a
 * forward-deployed engineer, a deep-dive on SandCastles, and values questions. They all
 * reward the same thing: listening first, being specific, and owning your part honestly.
 */
export const customersAndYourStory = {
  id: 'customers-and-your-story',
  act: 8,
  title: 'Customers and Your Story',
  briefing: [
    'The people rounds: a customer with a problem, a deep-dive on SandCastles, and questions about how you work with others.',
    'Listen before you fix, be specific, and own your part, including what you’d change.',
  ],
  cards: [
    {
      id: 'listen-first',
      kind: 'choose',
      situation:
        'Customer round. Sage plays Brightline, a Quillwork customer: “Your API is slow. We need it faster, or we’re leaving.”',
      question: 'What do you say first?',
      options: [
        {
          id: 'promise',
          text: 'We’ll make it ten times faster by next week.',
          correct: false,
          feedback: 'A promise before facts. If you can’t keep it, you lose them anyway.',
        },
        {
          id: 'network',
          text: 'It’s fast for everyone else, so it may be your network.',
          correct: false,
          feedback: 'It could be, but you don’t know yet, and it sounds defensive.',
        },
        {
          id: 'escalate',
          text: 'I’ll pass this on to the engineering team.',
          correct: false,
          feedback: 'In this role you are the engineering team. Find out what’s happening.',
        },
        {
          id: 'which',
          text: 'I’m sorry it’s hurting you. Which calls are slow, when, and what are you trying to get done?',
          correct: true,
          feedback: 'You acknowledged the pain and went after the real problem.',
        },
      ],
      explanation:
        'Customer work starts with listening. “Faster API” is often a symptom; the real need might be one better call. Acknowledge the impact, then ask what they’re doing, when, and how slow is slow.',
    },
    {
      id: 'real-workflow',
      kind: 'choose',
      situation: 'Brightline shares a log from their 6am job. Every morning it takes 41 minutes.',
      artifact: {
        kind: 'log',
        label: 'brightline-sync.log',
        text: [
          '06:00:00 GET /v1/docs/10001  200  480ms',
          '06:00:01 GET /v1/docs/10002  200  495ms',
          '06:00:01 GET /v1/docs/10003  200  470ms',
          '...',
          '06:41:12 GET /v1/docs/15000  200  510ms',
          'done: 5,000 requests',
        ].join('\n'),
      },
      question: 'Best recommendation?',
      options: [
        {
          id: 'list-call',
          text: 'Show them our list call, GET /v1/docs?updated_since=, so the job asks once for what changed, and send a working example.',
          correct: true,
          feedback: 'One call instead of 5,000. Their job takes seconds.',
        },
        {
          id: 'rate-limit',
          text: 'Rate-limit them so they stop overloading us.',
          correct: false,
          feedback: 'Their job gets slower and they get angrier. It doesn’t solve their need.',
        },
        {
          id: 'servers',
          text: 'Add servers so each call is a bit faster.',
          correct: false,
          feedback: 'Each call is already about half a second. 5,000 of them is the problem.',
        },
      ],
      explanation:
        'Solve the customer’s workflow, not just the complaint. The best fix is often a better way to use what exists, with an example they can copy, rather than more hardware.',
    },
    {
      id: 'draft-reply',
      kind: 'prompt',
      situation: 'You ask Otto to draft your reply to Brightline before you send it.',
      question: 'Which instruction?',
      options: [
        {
          id: 'blame',
          text: 'Write a reply explaining that their script is badly written.',
          correct: false,
          feedback: 'True or not, blame loses the customer. They need a way forward.',
        },
        {
          id: 'technical',
          text: 'Write a detailed explanation of how our database and caching work.',
          correct: false,
          feedback: 'They asked for a fast morning job, not a tour of our internals.',
        },
        {
          id: 'reply',
          text: 'Draft a short reply: thank them for the log, explain plainly that the job makes 5,000 calls, show the list call with a copy-paste example, and offer a 15-minute call. No blame, no dates.',
          correct: true,
          feedback:
            'Clear audience, clear steps, and a tone you chose. You still read it before it goes.',
        },
        {
          id: 'promise',
          text: 'Write a reply promising a much faster API by Friday.',
          correct: false,
          feedback: 'Otto will write a promise nobody on the team agreed to.',
        },
      ],
      explanation:
        'An agent drafting customer messages needs the audience, the point, the tone and the limits, or it fills the gaps itself. And you read every word before it’s sent: your name is on it.',
    },
    {
      id: 'missed-webhooks',
      kind: 'order',
      situation:
        'Brightline calls again: “Your webhooks didn’t fire for 40 of our orders yesterday.” Sage asks how you handle it.',
      question: 'Put your response in order.',
      steps: [
        { id: 'acknowledge', text: 'Acknowledge the impact and say when they’ll hear next' },
        { id: 'details', text: 'Ask for the order ids and rough times' },
        { id: 'logs', text: 'Check our webhook logs for those orders' },
        { id: 'resend', text: 'Resend the missed events, then explain the cause' },
        { id: 'prevent', text: 'Say what changes so it doesn’t happen again' },
      ],
      explanation:
        'Acknowledge, gather facts, check the evidence, fix and explain, then prevent. Customers forgive problems far more easily than silence or guessing.',
    },
    {
      id: 'deep-dive',
      kind: 'choose',
      situation: 'Deep-dive round. Sage says: “Tell me about SandCastles.”',
      question: 'What makes a strong answer?',
      options: [
        {
          id: 'stack',
          text: 'Every technology it uses, from the database to the build tool.',
          correct: false,
          feedback: 'A list shows what you used, not how you think.',
        },
        {
          id: 'perfect',
          text: 'How smoothly it went, so it sounds impressive.',
          correct: false,
          feedback: 'Nobody believes that, and it hides everything you learned.',
        },
        {
          id: 'decisions',
          text: 'The problem it solves, two decisions you made and why, what went wrong, and what you’d change now.',
          correct: true,
          feedback: 'Decisions and lessons are what they’re listening for.',
        },
      ],
      explanation:
        'Tell it as situation, task, action, result. Spend most of the time on your decisions and their trade-offs, including one you’d make differently today.',
    },
    {
      id: 'prep-partner',
      kind: 'prompt',
      situation: 'You want Claude to help you prepare your SandCastles story for the real loop.',
      question: 'Which instruction do you give?',
      options: [
        {
          id: 'grill',
          text: 'Here are my notes on SandCastles. Ask me the follow-ups a tough interviewer would ask, one at a time, and tell me where my answers are vague. Don’t write my answers for me.',
          correct: true,
          feedback:
            'The story stays yours, and you find the weak spots before the interviewer does.',
        },
        {
          id: 'write-it',
          text: 'Write my SandCastles story so it sounds as impressive as possible.',
          correct: false,
          feedback: 'You’d be reciting someone else’s words, and the follow-ups would expose it.',
        },
        {
          id: 'numbers',
          text: 'Add some impressive numbers, like users and speed-ups, to make it stand out.',
          correct: false,
          feedback: 'Made-up numbers are lies, and the first follow-up question would catch them.',
        },
      ],
      explanation:
        'Use AI to pressure-test your story, not to write it. Ask it to play the interviewer and point out vague spots. Everything you say must be true and in your own words.',
    },
    {
      id: 'who-built-it',
      kind: 'choose',
      situation: 'Sage asks: “How much of SandCastles did you write, and how much did AI write?”',
      question: 'Best answer?',
      options: [
        {
          id: 'all-me',
          text: 'I wrote every line myself.',
          correct: false,
          feedback:
            'If it isn’t true, the next question will show it. And it hides a skill they want.',
        },
        {
          id: 'directed',
          text: 'Agents wrote most of the code. I wrote the briefs, reviewed every diff and ran the tests. Once I caught an agent weakening a test.',
          correct: true,
          feedback: 'Honest, specific, and it shows the judgment that matters now.',
        },
        {
          id: 'all-ai',
          text: 'The AI did basically everything.',
          correct: false,
          feedback: 'It undersells you. Who decided what to build and checked it was right?',
        },
      ],
      explanation:
        'Teams want engineers who direct AI well. Be honest about who typed what, then show your part: the briefs, the reviews, the checks and the bugs you caught.',
    },
    {
      id: 'disagree',
      kind: 'choose',
      situation: 'Values round: “Tell me about a time you disagreed with a teammate.”',
      question: 'Which story shape is best?',
      options: [
        {
          id: 'never',
          text: 'Say you get along with everyone and never disagree.',
          correct: false,
          feedback: 'Nobody believes it, and it suggests you avoid hard conversations.',
        },
        {
          id: 'won',
          text: 'A time you were right, they were wrong, and you proved it.',
          correct: false,
          feedback: 'It’s about how you handled it, not who won.',
        },
        {
          id: 'manager',
          text: 'A time you went to the manager to settle it.',
          correct: false,
          feedback: 'Sometimes needed, but they want to hear you tried working it out first.',
        },
        {
          id: 'real',
          text: 'A real one: Priya wanted to ship, you wanted more tests. You listened, compared the risk with evidence, and agreed a smaller release.',
          correct: true,
          feedback: 'Respect, evidence and a shared outcome. That’s what they’re listening for.',
        },
      ],
      explanation:
        'Values questions check how you’ll behave on the team. Pick a real story, show you listened and used evidence, and end with the outcome and what you learned.',
    },
    {
      id: 'mistake',
      kind: 'choose',
      situation: 'Last values question: “Tell me about a mistake you made at work.”',
      question: 'What makes the answer good?',
      options: [
        {
          id: 'own',
          text: 'Own it plainly: what happened, the impact, how you fixed it, and the habit you changed.',
          correct: true,
          feedback: 'Ownership plus a changed habit is exactly what they want to hear.',
        },
        {
          id: 'fake',
          text: 'Pick a fake weakness, like working too hard.',
          correct: false,
          feedback: 'Interviewers hear it every day. It sounds like you’re hiding something real.',
        },
        {
          id: 'blame',
          text: 'Explain how it was mostly someone else’s fault.',
          correct: false,
          feedback: 'Blame is the opposite of what this question is listening for.',
        },
      ],
      explanation:
        'Everyone makes mistakes; what matters is how you handle them. A real mistake, owned plainly, with a fix and a lasting change, shows you’re safe to trust with production.',
    },
  ],
} satisfies LessonInput;
