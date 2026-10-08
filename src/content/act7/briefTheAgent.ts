import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * 7.1 Brief the Agent. Otto writes the code now; Kyle's job is the brief. Every card is a
 * moment at Quillwork where what Kyle says decides whether Otto builds the right thing.
 */
export const briefTheAgent = {
  id: 'brief-the-agent',
  act: 7,
  title: 'Brief the Agent',
  xp: 70,
  briefing: [
    'Quillwork ships with Otto, an AI coding agent. Otto types fast. You decide what he builds.',
    'Otto does exactly what your words allow, confidently. A good brief says the goal, the limits, and what done looks like.',
  ],
  cards: [
    {
      id: 'spec',
      kind: 'prompt',
      situation:
        'Marco from support: customers keep asking for their invoices as a spreadsheet. You hand the job to Otto.',
      question: 'Which brief do you give Otto?',
      options: [
        {
          id: 'short',
          text: 'Add CSV export to invoices.',
          correct: false,
          feedback:
            'Which invoices, which columns, who may download them? Otto will guess, and guess confidently.',
        },
        {
          id: 'huge',
          text: 'On /billing, add a Download CSV button: number, date, amount, status, for the signed-in customer only, with tests. And refactor the billing module while you’re there.',
          correct: false,
          feedback:
            'A good brief until the last line. “While you’re there” turns a small change into a huge diff nobody asked for.',
        },
        {
          id: 'spec',
          text: 'On /billing, add a Download CSV button: number, date, amount, status. Signed-in customer’s invoices only. Test that others’ never appear. Change nothing else.',
          correct: true,
          feedback: 'Goal, place, details, who, proof, and a boundary. Nothing left to guess.',
        },
        {
          id: 'vibe',
          text: 'Add invoice export, the way Stripe does it. You’ll figure out the details.',
          correct: false,
          feedback: '“Figure it out” hands the decisions to Otto. You still own the result.',
        },
      ],
      explanation:
        'A brief is short but complete: what, where, for whom, the edge cases, how to prove it, and what not to touch. A vague brief doesn’t get a question back; it gets a confident guess.',
    },
    {
      id: 'lasting-context',
      kind: 'choose',
      situation: 'For the third time this week, Otto’s code imports moment.js.',
      artifact: {
        kind: 'agent-message',
        label: 'Otto',
        text: [
          'Added the due-date reminder.',
          "import moment from 'moment';",
          "const due = moment(invoice.dueAt).format('MMM D');",
        ].join('\n'),
      },
      question: 'The team moved to date-fns last month. What’s the lasting fix?',
      options: [
        {
          id: 'remind',
          text: 'Tell Otto again in this chat, firmly.',
          correct: false,
          feedback: 'It fixes this chat. Tomorrow’s session starts fresh and slips back.',
        },
        {
          id: 'repo-file',
          text: 'Add “dates: use date-fns, never moment” to the repo’s agent instructions file, like CLAUDE.md.',
          correct: true,
          feedback:
            'Context that lives in the repo reaches every session and every teammate’s agent.',
        },
        {
          id: 'switch',
          text: 'Switch to a smarter agent.',
          correct: false,
          feedback: 'Any agent only knows what it reads. The next one needs the same rule.',
        },
        {
          id: 'fix-yourself',
          text: 'Quietly fix the import yourself each time.',
          correct: false,
          feedback: 'You’ll be fixing it forever, and you’ll miss one.',
        },
      ],
      explanation:
        'An agent starts every session knowing only what it reads. Rules that should always hold, like libraries, commands and conventions, belong in the repo’s instructions file.',
    },
    {
      id: 'plan-first',
      kind: 'prompt',
      situation:
        'Priya wants logins moved from cookies to tokens. It touches the API, the web app and the tests.',
      question: 'How do you start Otto on it?',
      options: [
        {
          id: 'plan',
          text: 'Before writing code, reply with a plan: the files you’ll change, in what order, and what could break. Wait for my OK.',
          correct: true,
          feedback: 'A wrong plan costs one reply to fix. Wrong code costs an afternoon.',
        },
        {
          id: 'go',
          text: 'Go ahead and make the change. Ping me when it’s done.',
          correct: false,
          feedback: 'You’ll meet his assumptions after he has built on all of them.',
        },
        {
          id: 'one-shot',
          text: 'Change the API, the web app and the tests in one go, run the whole suite, fix whatever breaks along the way, and open one PR when it all passes.',
          correct: false,
          feedback:
            'Sounds thorough, but you meet every assumption after it’s built, and “fix whatever breaks” invites bent tests.',
        },
      ],
      explanation:
        'For anything bigger than a small fix, ask for a plan first. You catch misunderstandings while they are still words, and the plan becomes a checklist to review against.',
    },
    {
      id: 'ambiguity',
      kind: 'choose',
      situation: 'Halfway through the CSV task, Otto stops and asks you something.',
      artifact: {
        kind: 'agent-message',
        label: 'Otto',
        text: [
          'Question before I continue:',
          'Some invoices are "void". Should the CSV include them?',
          'I can include them with status=void, or leave them out.',
        ].join('\n'),
      },
      question: 'What do you do?',
      options: [
        {
          id: 'whatever',
          text: 'Reply “whatever you think is best”.',
          correct: false,
          feedback: 'He asked because the brief left it open. Now a product choice is a coin flip.',
        },
        {
          id: 'ignore',
          text: 'Ignore it. He’ll pick something.',
          correct: false,
          feedback: 'He will, and nobody will remember that a choice was made.',
        },
        {
          id: 'guess',
          text: 'Tell him to leave them out, so the file is shorter.',
          correct: false,
          feedback: 'Short isn’t the goal. Customers’ accountants may need the voids.',
        },
        {
          id: 'answer',
          text: 'Check with Marco, answer Otto, and add the rule to the issue so the brief is complete.',
          correct: true,
          feedback: 'The question was a gap in the spec. Close it where everyone can see it.',
        },
      ],
      explanation:
        'An agent’s question is a gift: it found a gap in your brief. Answer it with a real decision, and write the answer into the issue so the spec stays the source of truth.',
    },
    {
      id: 'agent-loop',
      kind: 'order',
      situation: 'Dex asks how you work with Otto on a feature.',
      question: 'Put the loop in order.',
      steps: [
        { id: 'brief', text: 'Write the brief: goal, limits, proof' },
        { id: 'plan', text: 'Ask Otto for a plan before any code' },
        { id: 'approve', text: 'Correct the plan, then approve it' },
        { id: 'build', text: 'Let Otto build in small commits' },
        { id: 'review', text: 'Check the evidence and review the diff, then merge' },
      ],
      explanation:
        'Brief, plan, build, prove, review. Every step before the code is cheap to change, and every step after it is where you catch what the brief missed.',
    },
    {
      id: 'define-done',
      kind: 'prompt',
      situation: 'You’re ending the CSV brief. You want to know when it’s really finished.',
      question: 'Which last line do you add?',
      options: [
        {
          id: 'ping',
          text: 'Let me know when you’re done.',
          correct: false,
          feedback: 'Done by whose standard? Otto will decide, and say so with confidence.',
        },
        {
          id: 'done-means',
          text: 'Done means: npm test and npm run build pass, a test proves other customers’ invoices never appear, and you paste the output.',
          correct: true,
          feedback: 'A finish line you can check, not a feeling.',
        },
        {
          id: 'perfect',
          text: 'Make sure it’s perfect and handles every possible case.',
          correct: false,
          feedback: '“Every case” has no finish line, and no way to check it.',
        },
      ],
      explanation:
        'Tell the agent what done means in checks anyone can run: tests, build, a specific behaviour, and the output pasted back. Then “done” is evidence, not an opinion.',
    },
    {
      id: 'right-context',
      kind: 'choose',
      situation:
        'Dex pastes a 4,000-line server log and the whole repo into Otto’s chat: “find the bug.” Otto is slow and keeps guessing.',
      question: 'What would help Otto most?',
      options: [
        {
          id: 'more',
          text: 'Paste last week’s logs too, so nothing is missing.',
          correct: false,
          feedback: 'More noise buries the signal deeper, and costs more for every step.',
        },
        {
          id: 'model',
          text: 'Switch to a bigger model that can hold more text.',
          correct: false,
          feedback: 'It can hold more, but the clue is still lost in the pile.',
        },
        {
          id: 'focused',
          text: 'The 30 lines around the first error, the endpoint’s file name, and what the user did when it broke.',
          correct: true,
          feedback: 'The relevant facts, and where to look. That’s what a teammate would need too.',
        },
        {
          id: 'nothing',
          text: 'Just say “find the bug” and let it search.',
          correct: false,
          feedback: 'It will read everything, slowly, and may fix the wrong thing.',
        },
      ],
      explanation:
        'Context is a budget. Give the agent what a sharp teammate would want: the error, where it happens, how to reproduce it. Too little and it guesses; too much and it drowns.',
    },
    {
      id: 'show-an-example',
      kind: 'choose',
      situation:
        'Otto’s new /refunds endpoint works, but looks nothing like the other 20 endpoints: different errors, different names, no validation.',
      question: 'What’s the best fix for the next one?',
      options: [
        {
          id: 'example',
          text: 'Point Otto at a good existing endpoint, like src/api/invoices.ts, and say “follow this pattern”.',
          correct: true,
          feedback: 'An example in the codebase beats a paragraph of description.',
        },
        {
          id: 'accept',
          text: 'Accept it. It works.',
          correct: false,
          feedback: 'Twenty styles later, nobody can find anything. Consistency is a feature.',
        },
        {
          id: 'rewrite-all',
          text: 'Ask Otto to rewrite all 20 endpoints in his new style.',
          correct: false,
          feedback: 'A huge risky diff to match one newcomer. Backwards.',
        },
      ],
      explanation:
        'Agents copy what they see. Show a real file that does it right and ask for the same pattern. It’s the fastest way to make AI-written code fit in.',
    },
  ],
} satisfies LessonInput;
