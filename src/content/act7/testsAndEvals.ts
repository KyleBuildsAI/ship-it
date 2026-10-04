import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * 7.3 Tests and Evals. You can't read every line an agent writes forever. Tests are how
 * the code checks itself, and evals are how you check AI behaviour that has no single
 * right answer. Both only help if the agent can't quietly bend them.
 */
export const testsAndEvals = {
  id: 'tests-and-evals',
  act: 7,
  title: 'Tests and Evals',
  xp: 70,
  briefing: [
    'Otto writes code faster than anyone can read it. Tests are how the code checks itself, every time.',
    'For AI features with no single right answer, evals do the same job: fixed examples, graded, scored.',
  ],
  cards: [
    {
      id: 'why-tests',
      kind: 'choose',
      situation:
        'Priya: “Before Otto touches billing, I want tests on the refund rules.” Dex thinks that’s slow.',
      question: 'Why is Priya right?',
      options: [
        {
          id: 'coverage',
          text: 'Coverage numbers look good to investors.',
          correct: false,
          feedback: 'Numbers aren’t the point. Caught mistakes are.',
        },
        {
          id: 'guardrail',
          text: 'Tests pin down what the rules are, so every change Otto makes is checked against them automatically.',
          correct: true,
          feedback: 'Yes. A guardrail that never gets tired or skims.',
        },
        {
          id: 'bugs-gone',
          text: 'Tested code has no bugs.',
          correct: false,
          feedback: 'Tests only check what they check. That’s still a lot.',
        },
        {
          id: 'ai-cant',
          text: 'Otto can’t write code without tests.',
          correct: false,
          feedback: 'He can, happily. That’s the problem.',
        },
      ],
      explanation:
        'Tests turn “what should happen” into checks that run on every change. With an agent writing code, they are the guardrail that holds when your attention doesn’t.',
    },
    {
      id: 'test-first',
      kind: 'prompt',
      situation:
        'New rule: a refund can’t be more than what the customer paid, and can’t happen after 60 days.',
      question: 'Which instruction do you give Otto?',
      options: [
        {
          id: 'build',
          text: 'Add the refund limits and write some tests for them.',
          correct: false,
          feedback: 'Tests written after the code tend to test what the code does, bugs included.',
        },
        {
          id: 'no-tests',
          text: 'Add the refund limits. Skip tests, we’re in a hurry.',
          correct: false,
          feedback: 'The hurry is exactly when an unguarded money rule breaks.',
        },
        {
          id: 'tests-first',
          text: 'First write failing tests: full refund works, one cent more throws, day 60 works, day 61 throws. Show me them failing. Then make them pass without editing the tests.',
          correct: true,
          feedback: 'The tests state the rule before any code can bend it.',
        },
      ],
      explanation:
        'Have the agent write the tests first and show them failing. Then the tests describe the rule, not the code, and “make them pass without editing them” keeps it honest.',
    },
    {
      id: 'bent-test',
      kind: 'choose',
      situation: 'A test was failing. Otto says he fixed it.',
      artifact: {
        kind: 'diff',
        label: 'src/billing/tax.test.ts',
        text: [
          " it('adds 8% tax to a $100 order', () => {",
          '   const total = withTax(100);',
          '-  expect(total).toBe(108);',
          '+  expect(total).toBe(100);',
          ' });',
        ].join('\n'),
      },
      question: 'What did Otto actually do?',
      options: [
        {
          id: 'bent',
          text: 'Changed the test to agree with the bug. Tax is still missing.',
          correct: true,
          feedback: 'Yes. The test passes now, and it protects nothing.',
        },
        {
          id: 'fixed',
          text: 'Fixed an outdated test.',
          correct: false,
          feedback: 'Nobody changed the tax rule. $100 plus 8% is still $108.',
        },
        {
          id: 'rounding',
          text: 'Fixed a rounding problem.',
          correct: false,
          feedback: '108 to 100 isn’t rounding. It’s removing the tax.',
        },
      ],
      explanation:
        'When a test fails, either the code or the test is wrong, and that’s a decision for a human. An agent asked to “make it pass” may take the easy road and edit the test.',
    },
    {
      id: 'test-rule',
      kind: 'prompt',
      situation: 'You want to stop that happening again, in every session.',
      question: 'Which rule do you add to the repo’s CLAUDE.md?',
      options: [
        {
          id: 'careful',
          text: 'Be careful with tests.',
          correct: false,
          feedback: 'Careful how? It’s too vague to follow or check.',
        },
        {
          id: 'never-run',
          text: 'Never run the tests; I’ll run them myself.',
          correct: false,
          feedback: 'Then Otto can’t check his own work. You want more checking, not less.',
        },
        {
          id: 'ask-first',
          text: 'Never change an existing test’s expected values, or skip a test, to make it pass. If a test seems wrong, stop and explain why.',
          correct: true,
          feedback: 'Clear, checkable, and it brings the decision back to you.',
        },
        {
          id: 'delete',
          text: 'Delete flaky tests when they fail.',
          correct: false,
          feedback: 'That teaches Otto that a failing test is something to remove.',
        },
      ],
      explanation:
        'Good agent rules are specific and checkable: what never to do, and what to do instead. Put them in the repo so they apply every time, not just when you remember.',
    },
    {
      id: 'coverage-gap',
      kind: 'choose',
      situation: 'CI is green on Otto’s refund change. You open the coverage report.',
      artifact: {
        kind: 'log',
        label: 'coverage · src/billing',
        text: [
          'File          % Lines   Uncovered lines',
          'invoices.ts     96.2    41',
          'refund.ts       58.3    22-31, 47',
          'tax.ts         100.0',
        ].join('\n'),
      },
      question: 'What does this tell you?',
      options: [
        {
          id: 'fine',
          text: 'Green CI. Ship it.',
          correct: false,
          feedback: 'Green means the tests that exist pass. Lines 22-31 have none.',
        },
        {
          id: 'hundred',
          text: 'Every file must reach 100% before merging.',
          correct: false,
          feedback: 'A number to chase, not a reason. Cover what matters.',
        },
        {
          id: 'gap',
          text: 'The new refund logic, lines 22-31, never ran in a test. Ask Otto for tests that reach it.',
          correct: true,
          feedback: 'Yes. Untested money logic is unguarded money logic.',
        },
      ],
      explanation:
        'Coverage shows which lines no test ever ran. Use it to find gaps in important code, not as a score. A green CI says nothing about code no test touches.',
    },
    {
      id: 'why-evals',
      kind: 'choose',
      situation:
        'Quillwork’s “summarize this doc” feature uses an AI model. Marco rewrote its prompt and says the summaries feel better.',
      question: 'How do you know they are better?',
      options: [
        {
          id: 'vibes',
          text: 'Try three documents and compare.',
          correct: false,
          feedback: 'Three examples can’t show it got worse on the other two hundred kinds.',
        },
        {
          id: 'ship',
          text: 'Ship it and watch for complaints.',
          correct: false,
          feedback: 'Then your customers are your test suite.',
        },
        {
          id: 'trust',
          text: 'Trust Marco. He knows the customers.',
          correct: false,
          feedback: 'He does, but “feels better” isn’t something you can compare next month.',
        },
        {
          id: 'eval',
          text: 'Run an eval: the same 50 real documents, graded the same way, before and after.',
          correct: true,
          feedback: 'Measured, repeatable, comparable.',
        },
      ],
      explanation:
        'An eval is a test for AI behaviour: fixed inputs, a clear way to grade the outputs, and a score. Run it before and after every prompt or model change.',
    },
    {
      id: 'build-an-eval',
      kind: 'order',
      situation: 'You’re setting up that eval for the summarizer.',
      question: 'Put the steps in order.',
      steps: [
        { id: 'collect', text: 'Collect real documents, including hard ones' },
        { id: 'criteria', text: 'Write how each summary is graded' },
        { id: 'baseline', text: 'Score the current prompt as a baseline' },
        { id: 'change', text: 'Change the prompt' },
        { id: 'compare', text: 'Score again, compare, and read the failures' },
      ],
      explanation:
        'Real inputs, clear grading, a baseline, then the change. Without a baseline you can’t say “better”, and reading the failures tells you why the score moved.',
    },
    {
      id: 'noisy-scores',
      kind: 'choose',
      situation: 'Same prompt, same 50 documents. You run the eval three times.',
      artifact: {
        kind: 'log',
        label: 'eval runs · summarizer',
        text: [
          'run 1   41/50 passed   82%',
          'run 2   39/50 passed   78%',
          'run 3   42/50 passed   84%',
        ].join('\n'),
      },
      question: 'What does this mean?',
      options: [
        {
          id: 'broken',
          text: 'The eval is broken. Throw it out.',
          correct: false,
          feedback: 'It works. It’s showing you how much the model varies.',
        },
        {
          id: 'best',
          text: 'Report the best run, 84%.',
          correct: false,
          feedback: 'Picking the best run is fooling yourself, with numbers.',
        },
        {
          id: 'improved',
          text: 'The prompt got better between runs.',
          correct: false,
          feedback: 'Nothing changed between runs. Only chance did.',
        },
        {
          id: 'noise',
          text: 'Model output varies. Run several times, compare averages, and don’t trust a 2-point difference.',
          correct: true,
          feedback: 'Yes. Know your noise before you claim a win.',
        },
      ],
      explanation:
        'AI outputs vary from run to run, so one eval score is a sample, not a fact. Repeat runs and add cases until a real change stands out from the noise.',
    },
  ],
} satisfies LessonInput;
