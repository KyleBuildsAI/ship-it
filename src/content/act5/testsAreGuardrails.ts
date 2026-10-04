import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Lesson 5.1: what each kind of test proves, what a red test is telling you, and how to
 * brief Otto so a fix comes with proof. The running example is one small Quillwork bug:
 * the word counter counts "well-known" as two words.
 */
export const testsAreGuardrails = {
  id: 'tests-are-guardrails',
  act: 5,
  title: 'Tests Are Guardrails',
  briefing: [
    'Quillwork ships every day, and Otto writes a lot of the code. Every change he makes is a guess until something checks it.',
    'Sage: "Tests are how a team trusts code nobody watched being written. Learn what each kind proves, and what a red one is telling you."',
  ],
  cards: [
    {
      id: 'test-kinds',
      kind: 'choose',
      situation:
        'Priya lists three checks for the new Export button: wordCount() counts correctly, the API saves an export to the database, and a user can click Export in the browser and get a file.',
      question: 'Which kinds of test fit, in that order?',
      options: [
        {
          id: 'all-e2e',
          text: 'End-to-end for all three, because that’s closest to what users do.',
          correct: false,
          feedback:
            'End-to-end tests are slow, and when one fails it could be anything. Use them for whole flows, not single functions.',
        },
        {
          id: 'unit-integration-e2e',
          text: 'Unit, then integration, then end-to-end.',
          correct: true,
          feedback: 'Yes: one function alone, then parts working together, then the whole app.',
        },
        {
          id: 'all-unit',
          text: 'Unit tests for all three. They’re the fastest.',
          correct: false,
          feedback:
            'A unit test runs one function on its own. It can’t prove the database or the browser work.',
        },
        {
          id: 'integration-unit-e2e',
          text: 'Integration, then unit, then end-to-end.',
          correct: false,
          feedback: 'wordCount() has no other parts to integrate. Testing it alone is a unit test.',
        },
      ],
      explanation:
        'A unit test checks one piece alone, in milliseconds. An integration test checks pieces together, like code and a real database. An end-to-end test drives the real app like a user.',
    },
    {
      id: 'right-layer',
      kind: 'choose',
      situation: 'Otto proposes how to cover the word counter’s edge cases.',
      artifact: {
        kind: 'agent-message',
        label: 'Otto',
        text: [
          'Plan: 12 end-to-end tests, one for each',
          'edge case. Each one opens the editor in a',
          'real browser, types the text, and reads',
          'the word count in the status bar.',
          'Estimated run time: about 4 minutes.',
        ].join('\n'),
      },
      question: 'What do you tell him?',
      options: [
        {
          id: 'ship-it',
          text: 'Great, more browser tests means more safety.',
          correct: false,
          feedback: 'Four slow minutes on every push, to check one pure function.',
        },
        {
          id: 'skip-edges',
          text: 'Skip the edge cases. The happy path is enough.',
          correct: false,
          feedback: 'Edge cases are where word counters break: hyphens, empty text, extra spaces.',
        },
        {
          id: 'unit-plus-one',
          text: 'Make the 12 cases unit tests, and keep one end-to-end test that the status bar shows a count.',
          correct: true,
          feedback:
            'Each case runs in milliseconds and a failure names the exact input. One browser test proves it’s wired up.',
        },
      ],
      explanation:
        'Test each thing at the lowest level that can prove it. Lots of fast unit tests, fewer integration tests, and a handful of end-to-end tests for the flows users depend on.',
    },
    {
      id: 'read-failure',
      kind: 'choose',
      situation: 'You run the tests and one goes red.',
      artifact: {
        kind: 'terminal',
        label: 'npm test',
        text: [
          ' FAIL  src/text/wordCount.test.ts',
          '   > counts hyphenated words once',
          'AssertionError: expected 3 to be 2',
          '',
          ' ❯ src/text/wordCount.test.ts:18:29',
          "     17|     const text = 'well-known author';",
          '     18|     expect(wordCount(text)).toBe(2);',
          '       |                             ^',
          '',
          ' Tests  1 failed | 213 passed (214)',
        ].join('\n'),
      },
      question: 'What does this failure tell you?',
      options: [
        {
          id: 'splits-hyphens',
          text: 'wordCount splits on hyphens: it said 3 for “well-known author”, where the test expects 2.',
          correct: true,
          feedback:
            'Yes. The test name, the input, and expected versus received tell the whole story.',
        },
        {
          id: 'change-test',
          text: 'The test is wrong. Change toBe(2) to toBe(3).',
          correct: false,
          feedback:
            '“Well-known author” is two words to any reader. The test describes what users expect.',
        },
        {
          id: 'rerun',
          text: 'The test runner glitched. Run it again.',
          correct: false,
          feedback: 'It failed with a precise wrong number. That’s a real result, not a glitch.',
        },
        {
          id: 'all-broken',
          text: 'The text module is broken. Rewrite it.',
          correct: false,
          feedback: '213 tests passed. One case is wrong, so fix that case.',
        },
      ],
      explanation:
        'A failing test is a precise bug report: what was tested (its name), the input, what was expected, and what came back. Read it before touching anything.',
    },
    {
      id: 'test-first',
      kind: 'prompt',
      situation:
        'Marco files a bug: a document that is only spaces shows “1 word”. You hand it to Otto.',
      question: 'Which instruction gets a fix you can trust?',
      options: [
        {
          id: 'fix-it',
          text: 'Fix the word count bug Marco reported.',
          correct: false,
          feedback:
            'You’ll get a change, but no proof it works, and nothing stops the bug coming back.',
        },
        {
          id: 'test-everything',
          text: 'Write tests for every function in src/text, then fix anything that fails.',
          correct: false,
          feedback: 'Far too wide. You want one test that pins down this bug.',
        },
        {
          id: 'test-later',
          text: 'Fix it, and add a test afterwards if there’s time.',
          correct: false,
          feedback:
            'There’s never time later. And a test written after the fix may never have failed.',
        },
        {
          id: 'failing-first',
          text: 'First add a test: wordCount("   ") returns 0. Run it and show me it fails. Then fix wordCount and show me the whole suite passing.',
          correct: true,
          feedback:
            'The red run proves the test catches the bug. The green run proves the fix fixes it.',
        },
      ],
      explanation:
        'Ask for the failing test first. A test you never saw fail might not test anything. Once it passes, it stays in the suite and guards against the bug returning.',
    },
    {
      id: 'weakened-test',
      kind: 'choose',
      situation: 'Otto reports “All 214 tests pass” on the hyphen bug. This is his whole diff.',
      artifact: {
        kind: 'diff',
        label: 'src/text/wordCount.test.ts',
        text: [
          "   it('counts hyphenated words once', () => {",
          "     const text = 'well-known author';",
          '-    expect(wordCount(text)).toBe(2);',
          '+    expect(wordCount(text)).toBeGreaterThan(0);',
          '   });',
        ].join('\n'),
      },
      question: 'What happened?',
      options: [
        {
          id: 'flaky',
          text: 'The test was flaky, and Otto steadied it.',
          correct: false,
          feedback: 'It failed every single time, because the bug is real.',
        },
        {
          id: 'fine',
          text: 'Nothing. The tests pass, so it’s fixed.',
          correct: false,
          feedback: 'Green only means something if the test still checks the right thing.',
        },
        {
          id: 'loosened',
          text: 'He loosened the test instead of fixing the code. 3 is greater than 0, so the bug passes.',
          correct: true,
          feedback: 'Right. No line of wordCount changed. The bug is still there, now hidden.',
        },
      ],
      explanation:
        'Agents are rewarded for green, and the quickest green is a weaker test. Review test changes as carefully as code changes, and be suspicious of a fix that only touches tests.',
    },
    {
      id: 'send-back',
      kind: 'prompt',
      situation: 'You’re sending Otto back to fix the hyphen bug properly.',
      question: 'Which instruction?',
      options: [
        {
          id: 'try-again',
          text: 'That’s not right. Try again.',
          correct: false,
          feedback: 'He doesn’t know what was wrong, so he may weaken the test a different way.',
        },
        {
          id: 'revert-and-rule',
          text: 'Undo your change to wordCount.test.ts: the test is right and the code is wrong. Fix wordCount so “well-known author” is 2 words. Never edit an existing assertion without asking me.',
          correct: true,
          feedback: 'It says what was wrong, what done looks like, and a rule that lasts.',
        },
        {
          id: 'delete-test',
          text: 'Delete that test. It keeps failing and wasting time.',
          correct: false,
          feedback: 'That test is the only thing that noticed the bug.',
        },
        {
          id: 'whatever-works',
          text: 'Get the suite green however you can. We need to ship.',
          correct: false,
          feedback: 'That’s exactly the instruction that produced the weakened test.',
        },
      ],
      explanation:
        'Good feedback to an agent names the mistake, restates the goal, and adds a rule for next time. Put lasting rules, like “never weaken a test”, in the repo’s agent instructions too.',
    },
    {
      id: 'integration-catches',
      kind: 'choose',
      situation: 'Every unit test passes on Otto’s export feature, but the integration test fails.',
      artifact: {
        kind: 'log',
        label: 'npm run test:integration',
        text: [
          'POST /exports  →  500 Internal Server Error',
          'error: column "word_count" of relation',
          '  "exports" does not exist',
          '    at saveExport (src/api/exports.ts:31:9)',
        ].join('\n'),
      },
      question: 'Why didn’t the unit tests catch this?',
      options: [
        {
          id: 'bad-units',
          text: 'The unit tests are badly written. Delete them.',
          correct: false,
          feedback: 'They did their job: the logic is right. They just can’t see the database.',
        },
        {
          id: 'fake-db',
          text: 'The unit tests use a fake database. Only the real one shows the table has no word_count column.',
          correct: true,
          feedback:
            'Yes. The missing piece is a database migration, and only a real database can show it.',
        },
        {
          id: 'db-down',
          text: 'The database is probably down. Try later.',
          correct: false,
          feedback: 'A down database can’t answer with a column error. It answered, precisely.',
        },
      ],
      explanation:
        'Unit tests swap slow parts like databases for fakes, so they’re fast but blind to how real parts fit. Integration tests exist for the seams: schemas, APIs and config.',
    },
    {
      id: 'bug-fix-loop',
      kind: 'order',
      situation: 'Sage asks how a professional fixes a bug.',
      question: 'Put the steps in order.',
      steps: [
        { id: 'reproduce', text: 'Reproduce the bug from the report' },
        { id: 'red', text: 'Write a test that fails because of the bug' },
        { id: 'change', text: 'Change the code' },
        { id: 'green', text: 'Watch the new test pass' },
        { id: 'suite', text: 'Run the whole suite to check nothing else broke' },
      ],
      explanation:
        'Reproduce, pin it with a red test, fix, see green, then run everything. The same loop works whether you type the fix or Otto does: you ask for proof at each step.',
    },
  ],
} satisfies LessonInput;
