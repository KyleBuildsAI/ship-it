import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * 8.2 Debug From Symptoms: the debugging round. Real bugs arrive as symptoms (a
 * traceback, a slow log, “it fails sometimes”), and the skill is turning them into a
 * cause with evidence, then pointing Otto at the evidence instead of at a guess.
 */
export const debugFromSymptoms = {
  id: 'debug-from-symptoms',
  act: 8,
  title: 'Debug From Symptoms',
  briefing: [
    'The debugging round: Sage hands you real Quillwork bugs as they arrived, as symptoms.',
    'Find the cause with evidence before anyone changes code. Then point Otto at the evidence, not at a guess.',
  ],
  cards: [
    {
      id: 'read-traceback',
      kind: 'choose',
      situation: 'The nightly invoice export crashed. This is all Dex posted in the channel.',
      artifact: {
        kind: 'error',
        label: 'export-invoices.log',
        text: [
          'Traceback (most recent call last):',
          '  File "export.py", line 41, in <module>',
          '    rows = [build_row(c) for c in customers]',
          '  File "export.py", line 12, in build_row',
          '    return [c["name"], c["email"], c["vat_number"]]',
          "KeyError: 'vat_number'",
        ].join('\n'),
      },
      question: 'What’s going on?',
      options: [
        {
          id: 'line-41',
          text: 'Line 41 is broken: the list comprehension is wrong.',
          correct: false,
          feedback: 'Line 41 only made the call. Read from the bottom: line 12 is where it failed.',
        },
        {
          id: 'deleted',
          text: 'Someone deleted the vat_number column for every customer.',
          correct: false,
          feedback:
            'Maybe, but nothing here says every customer. The traceback only proves at least one is missing it. Check the data before assuming.',
        },
        {
          id: 'missing-key',
          text: 'At least one customer has no vat_number. Find who, then decide what an export row should show for them.',
          correct: true,
          feedback: 'You named the cause and the decision behind the fix.',
        },
      ],
      explanation:
        'Read a traceback from the bottom up: the error, the line that raised it, then the calls that led there. Then ask which input makes that line fail. The fix is a decision, not just a patch.',
    },
    {
      id: 'swallowed',
      kind: 'choose',
      situation: 'Otto pushes a fix for the export crash within a minute.',
      artifact: {
        kind: 'diff',
        label: 'export.py',
        text: [
          ' def build_row(c):',
          '-    return [c["name"], c["email"], c["vat_number"]]',
          '+    try:',
          '+        return [c["name"], c["email"], c["vat_number"]]',
          '+    except Exception:',
          '+        return ["", "", ""]',
        ].join('\n'),
      },
      question: 'Is this a fix?',
      options: [
        {
          id: 'yes',
          text: 'Yes. The export won’t crash any more.',
          correct: false,
          feedback: 'It won’t crash. It’ll quietly put blank rows in the file instead.',
        },
        {
          id: 'hides',
          text: 'No. It hides every error, and customers without a VAT number become blank rows nobody notices.',
          correct: true,
          feedback: 'Right. The symptom is gone and the bug got worse.',
        },
        {
          id: 'narrower',
          text: 'Nearly. It just needs “except KeyError” instead.',
          correct: false,
          feedback: 'Narrower, but still silent. The real question is what the row should contain.',
        },
      ],
      explanation:
        'Making the error go away isn’t fixing it. A catch-all that does nothing turns a loud crash into silent bad data, which is far harder to find later. Fix the cause and decide what missing data means.',
    },
    {
      id: 'what-changed',
      kind: 'choose',
      situation: 'At 14:05 Priya says the docs page feels slow. Here’s the API log.',
      artifact: {
        kind: 'log',
        label: 'api.log',
        text: [
          '13:58:02 GET /v1/docs/8812  200   48ms',
          '14:01:37 GET /v1/docs/1203  200   51ms',
          '14:02:00 deploy quillwork-api a91f3c2 by dex',
          '14:02:41 GET /v1/docs/8812  200 2210ms',
          '14:03:15 GET /v1/docs/5530  200 2480ms',
        ].join('\n'),
      },
      question: 'What do you look at first?',
      options: [
        {
          id: 'servers',
          text: 'The server’s CPU, to see if it needs more power.',
          correct: false,
          feedback:
            'Maybe later. Something specific happened at 14:02, and it’s right there in the log.',
        },
        {
          id: 'network',
          text: 'Priya’s Wi-Fi.',
          correct: false,
          feedback: 'The server’s own log shows slow responses, so it isn’t her network.',
        },
        {
          id: 'restart',
          text: 'Nothing. Restart the API and watch.',
          correct: false,
          feedback: 'A restart might hide it for an hour and lose the evidence.',
        },
        {
          id: 'deploy',
          text: 'The diff of a91f3c2, the deploy at 14:02, since the slowdown starts right after it.',
          correct: true,
          feedback: 'Yes. Ask what changed, and the log already answered.',
        },
      ],
      explanation:
        'When something worked and then didn’t, ask what changed: a deploy, a config, the data. Line the timeline up with the symptom. The cause is usually in the change.',
    },
    {
      id: 'method',
      kind: 'order',
      situation: 'Sage asks how you go after a bug you don’t understand yet.',
      question: 'Put the steps in order.',
      steps: [
        { id: 'reproduce', text: 'Reproduce it reliably' },
        { id: 'guess', text: 'Guess a cause you can test' },
        { id: 'test', text: 'Test the guess with logs, a debugger or a test' },
        { id: 'fix', text: 'Fix the cause, not the symptom' },
        { id: 'guard', text: 'Add a test so it stays fixed' },
      ],
      explanation:
        'Reproduce, guess, test, fix, guard. Without a reliable repro you can’t tell if a fix worked. Without the test at the end, the bug comes back the next time someone touches that code.',
    },
    {
      id: 'repro-first',
      kind: 'prompt',
      situation:
        'Priya forwards a support ticket: “Login fails sometimes on Safari.” Nobody can make it happen on purpose yet. You bring in Otto.',
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'fix-it',
          text: 'Fix the Safari login bug.',
          correct: false,
          feedback:
            'Nobody knows the bug yet. Otto will guess, change something, and say it’s fixed.',
        },
        {
          id: 'retry',
          text: 'Add a retry to login so it fails less often.',
          correct: false,
          feedback: 'That hides the symptom and doubles the requests. You still won’t know why.',
        },
        {
          id: 'evidence',
          text: 'Don’t change code yet. Pull today’s failed logins from the auth log, list what the Safari ones have in common, and suggest how to reproduce it.',
          correct: true,
          feedback:
            'Evidence first. Otto is fast at reading logs, and nothing breaks while he does.',
        },
        {
          id: 'new-library',
          text: 'Replace our auth library with a newer one.',
          correct: false,
          feedback: 'A huge change for an unknown cause, and the bug might come along with it.',
        },
      ],
      explanation:
        'An agent told to “fix it” will change something and claim success. Point it at the evidence first and keep it read-only until you know the cause. Searching logs is where agents shine.',
    },
    {
      id: 'case-sensitive',
      kind: 'choose',
      situation:
        'npm test passes on your Windows laptop. Dex’s CI runs the same npm test on Linux and fails on the same commit. src contains: logger.ts, routes/, server.ts.',
      artifact: {
        kind: 'log',
        label: 'CI · test',
        text: [
          '> quillwork-api@1.6.0 test',
          '> vitest run',
          '',
          'Error: Failed to resolve import "./Logger" from "src/server.ts". Does the file exist?',
          '',
          'Error: Process completed with exit code 1.',
        ].join('\n'),
      },
      question: 'Why does it only fail in CI?',
      options: [
        {
          id: 'rerun',
          text: 'CI is flaky. Run it again.',
          correct: false,
          feedback: 'It fails the same way every time. Rerunning won’t change a missing file.',
        },
        {
          id: 'case',
          text: 'The file is logger.ts but the import says Logger. Windows ignores case; Linux doesn’t.',
          correct: true,
          feedback: 'Yes. Match the import to the file’s real name.',
        },
        {
          id: 'node-modules',
          text: 'CI’s node_modules is out of date.',
          correct: false,
          feedback: './Logger is our own file, not a package. node_modules isn’t involved.',
        },
      ],
      explanation:
        '“Works on my machine” means the machines differ. Compare them: operating system, versions, files, environment variables. CI is the cleaner test, which is exactly why teams trust it.',
    },
    {
      id: 'bisect',
      kind: 'prompt',
      situation:
        'Invoice totals are off by a cent on some orders. v1.4.0 was right; main is wrong; 30 commits sit in between.',
      question: 'Which instruction gets you the culprit fastest?',
      options: [
        {
          id: 'read-all',
          text: 'Read all 30 commits and tell me which one you think did it.',
          correct: false,
          feedback:
            'Otto will guess confidently, and he may well be wrong. A guess isn’t evidence.',
        },
        {
          id: 'revert-all',
          text: 'Revert the last 30 commits.',
          correct: false,
          feedback: 'That throws away a month of good work to remove one bad line.',
        },
        {
          id: 'find-it',
          text: 'Find the rounding bug and fix it.',
          correct: false,
          feedback: 'Too open. Otto might “fix” a different rounding spot and say he’s done.',
        },
        {
          id: 'bisect',
          text: 'Write a test with an order that’s off by a cent. Run git bisect between v1.4.0 and main with that test. Report the first bad commit and its diff. Don’t fix it yet.',
          correct: true,
          feedback: 'A test plus bisect finds the exact commit in about five steps, with proof.',
        },
      ],
      explanation:
        'git bisect halves the range each step, so 30 commits take about five tests. Give the agent a test that shows the bug and a known good and bad point, and you get evidence instead of a guess.',
    },
    {
      id: 'flaky-clock',
      kind: 'choose',
      situation: 'One test fails about once a day, always just after midnight. Rerunning fixes it.',
      artifact: {
        kind: 'code',
        label: 'invoice.test.ts',
        text: [
          "it('is due in 30 days', () => {",
          "  // dueDate is stored as 'YYYY-MM-DD'",
          '  const invoice = createInvoice();',
          '  const due = toISODate(addDays(new Date(), 30));',
          '  expect(invoice.dueDate).toBe(due);',
          '});',
        ].join('\n'),
      },
      question: 'What’s the real problem?',
      options: [
        {
          id: 'retry',
          text: 'The test runner is flaky. Mark the test to retry three times.',
          correct: false,
          feedback: 'Retries hide it. It fails for a reason, at a time you can predict.',
        },
        {
          id: 'clock',
          text: 'It reads the real clock twice. If midnight passes between them, the dates differ. Freeze the clock in the test.',
          correct: true,
          feedback: 'Yes. Tests that read the real time can fail at the edges of a day.',
        },
        {
          id: 'delete',
          text: 'Delete it. A test that fails randomly is worse than none.',
          correct: false,
          feedback: 'It isn’t random. It’s pointing at a real timing bug in how it’s written.',
        },
      ],
      explanation:
        'A “flaky” test usually has a cause: the clock, the order tests run in, shared data, or the network. Look for the pattern in when it fails. Retrying or deleting it throws that clue away.',
    },
  ],
} satisfies LessonInput;
