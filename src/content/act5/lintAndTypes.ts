import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Lesson 5.2: the cheap, automatic gates. Type errors and lint warnings are free bug
 * reports, and the lesson is mostly about not letting Otto silence them to get green.
 */
export const lintAndTypes = {
  id: 'lint-and-types',
  act: 5,
  title: 'Lint and Types',
  briefing: [
    'Before a test even runs, two robots read every change: the type checker and the linter.',
    'Sage: "They never get tired and never skip a file. Your job is to listen to them, and to stop Otto from switching them off."',
  ],
  cards: [
    {
      id: 'type-error',
      kind: 'choose',
      situation: 'The typecheck fails on Otto’s change to team billing.',
      artifact: {
        kind: 'error',
        label: 'npm run typecheck',
        text: [
          'src/billing/seats.ts:14:26 - error TS2345:',
          "  Argument of type 'string' is not",
          "  assignable to parameter of type 'number'.",
          '',
          '14   const total = priceFor(form.seats);',
          '                            ~~~~~~~~~~',
          'Found 1 error in src/billing/seats.ts:14',
        ].join('\n'),
      },
      question: 'What is it telling you?',
      options: [
        {
          id: 'as-any',
          text: 'Add “as any” after form.seats so it compiles.',
          correct: false,
          feedback: 'That hides a real bug: "3" times a price makes text, not a total.',
        },
        {
          id: 'strict-off',
          text: 'Turn off strict mode in tsconfig.json.',
          correct: false,
          feedback: 'That silences this error and every future one like it.',
        },
        {
          id: 'text-not-number',
          text: 'form.seats is text from the form, like "3", but priceFor needs a number. Convert it and check it.',
          correct: true,
          feedback: 'Yes. The type checker found a billing bug before any customer did.',
        },
        {
          id: 'optional',
          text: 'Types are only hints. Ignore it and merge.',
          correct: false,
          feedback: 'It’s a gate because it catches real bugs, like this one.',
        },
      ],
      explanation:
        'A type error is a free bug report with a line number. Anything from a form, a URL or an API arrives as text. Convert it, check it, and never silence the checker to get green.',
    },
    {
      id: 'no-ts-ignore',
      kind: 'prompt',
      situation: 'Otto offers: “I can add // @ts-ignore above line 14 and CI will pass.”',
      question: 'What do you tell him?',
      options: [
        {
          id: 'sure',
          text: 'Sure, whatever gets us green fastest.',
          correct: false,
          feedback: 'Green with a known bug inside is worse than red: nobody is looking any more.',
        },
        {
          id: 'parse-and-test',
          text: 'No ts-ignore and no any. Turn form.seats into a whole number, show an error when it isn’t one, and add unit tests for "3", "0" and "abc".',
          correct: true,
          feedback: 'It bans the shortcut, says what correct means, and asks for proof.',
        },
        {
          id: 'widen',
          text: 'Change priceFor to accept any type so it stops complaining.',
          correct: false,
          feedback: 'Same bug, moved into priceFor, where every caller now gets it.',
        },
        {
          id: 'remove-ts',
          text: 'TypeScript keeps getting in the way. Convert the file to plain JavaScript.',
          correct: false,
          feedback: 'You’d delete the one check that found this bug.',
        },
      ],
      explanation:
        'Agents will offer the quickest route to green. Name the shortcuts that are off limits, describe what correct behaviour is, and ask for tests that prove it.',
    },
    {
      id: 'why-lint',
      kind: 'choose',
      situation:
        'Lint fails on Otto’s PR: “no-debugger: Unexpected debugger statement” and “no-unused-vars: oldTotal is defined but never used”.',
      question: 'Why should lint block the merge?',
      options: [
        {
          id: 'looks',
          text: 'It shouldn’t. Lint is only about how code looks.',
          correct: false,
          feedback: 'A debugger statement freezes the app for anyone with dev tools open.',
        },
        {
          id: 'busy',
          text: 'Lint matters, but skip it when the team is busy.',
          correct: false,
          feedback: 'A gate that’s skipped when busy is skipped exactly when mistakes happen.',
        },
        {
          id: 'leftovers',
          text: 'It catches leftovers and likely mistakes the same way every time, so reviewers can focus on the logic.',
          correct: true,
          feedback: 'Right: robots check the leftovers, humans check the meaning.',
        },
      ],
      explanation:
        'Lint rules describe patterns that are usually mistakes: leftover debuggers, unused code, promises nobody waits for. Automating them keeps reviews about behaviour, not crumbs.',
    },
    {
      id: 'eslint-disable',
      kind: 'choose',
      situation: 'To clear the lint errors, Otto pushes this.',
      artifact: {
        kind: 'diff',
        label: 'src/billing/seats.ts',
        text: [
          '+/* eslint-disable */',
          " import { priceFor } from './pricing';",
          ' ',
          ' export function seatTotal(form: SeatForm): number {',
        ].join('\n'),
      },
      question: 'What do you do?',
      options: [
        {
          id: 'approve',
          text: 'Approve. Lint passes now.',
          correct: false,
          feedback: 'Lint passes because it no longer reads this file at all.',
        },
        {
          id: 'push-back',
          text: 'Push back: that turns off every rule for the whole file. Fix the warnings, or disable one rule on one line with a reason.',
          correct: true,
          feedback: 'Yes. Exceptions should be narrow, rare, and explained.',
        },
        {
          id: 'repo-wide',
          text: 'Better: remove those two rules from the lint config for everyone.',
          correct: false,
          feedback: 'Now the next debugger statement anywhere ships too.',
        },
      ],
      explanation:
        'A blanket disable is a gate with the lock removed. Sometimes a rule really is wrong for one line: then disable that rule, on that line, with a comment saying why.',
    },
    {
      id: 'formatter',
      kind: 'choose',
      situation:
        'Priya’s review of Marco’s PR has 41 comments. 38 are about quotes, spacing and trailing commas.',
      question: 'What fixes this for good?',
      options: [
        {
          id: 'careful',
          text: 'Ask everyone to be more careful about style.',
          correct: false,
          feedback: 'People, and agents, will keep drifting. A rule nobody enforces fades.',
        },
        {
          id: 'reformat-each-pr',
          text: 'Have Otto reformat the whole repo in every PR.',
          correct: false,
          feedback: 'Every PR would touch hundreds of files, burying the real change.',
        },
        {
          id: 'no-comments',
          text: 'Ban style comments in reviews.',
          correct: false,
          feedback: 'The style still drifts. You’ve only stopped talking about it.',
        },
        {
          id: 'prettier-ci',
          text: 'Adopt a formatter like Prettier, format the repo once, and add a format check to CI.',
          correct: true,
          feedback: 'Style becomes automatic, and reviews go back to logic.',
        },
      ],
      explanation:
        'Settle style once, in a tool, then let CI enforce it. Formatting the whole repo once, in its own PR, keeps that noise out of every later diff.',
    },
    {
      id: 'brief-lint-fix',
      kind: 'prompt',
      situation: 'After a large change, lint reports 37 errors across the 6 files Otto touched.',
      question: 'Which instruction?',
      options: [
        {
          id: 'fix-lint',
          text: 'Fix lint.',
          correct: false,
          feedback: 'He might fix it by disabling rules, or reformat files he never touched.',
        },
        {
          id: 'turn-off',
          text: 'Turn off whichever rules are failing.',
          correct: false,
          feedback: 'That fixes the report, not the code.',
        },
        {
          id: 'scoped',
          text: 'Fix the lint errors in the files you changed. Don’t add eslint-disable comments or edit the lint config. Paste the clean npm run lint output when done.',
          correct: true,
          feedback: 'A clear scope, the shortcuts ruled out, and proof at the end.',
        },
        {
          id: 'fix-all-repo',
          text: 'Run lint --fix on the whole repo and commit everything it changes.',
          correct: false,
          feedback: 'A huge, unrelated diff in a feature PR is hard to review and easy to break.',
        },
      ],
      explanation:
        'A good brief has a scope (these files), limits (no disables, no config edits) and evidence (the clean output). Without limits, an agent picks the easiest path to “done”.',
    },
    {
      id: 'green-means',
      kind: 'choose',
      situation:
        'Every gate is green on Otto’s seat-pricing PR. Reading the diff, you notice it rounds prices down to whole dollars.',
      question: 'What did the green checks prove?',
      options: [
        {
          id: 'correct',
          text: 'That the feature is correct. Gates don’t lie.',
          correct: false,
          feedback: 'No test checked cents, so nothing could fail on them.',
        },
        {
          id: 'consistent',
          text: 'That the code compiles, follows the rules, and passes the tests that exist. Not that it does the right thing.',
          correct: true,
          feedback: 'Yes. Gates check what they were told to check. Your review covers the rest.',
        },
        {
          id: 'nothing',
          text: 'Nothing. Gates are useless if bugs get through.',
          correct: false,
          feedback: 'They caught a type bug and a debugger today. They’re a floor, not a ceiling.',
        },
      ],
      explanation:
        'Gates make sure known mistakes never come back. They can’t know what the feature should do. Reading the diff, and asking for a test for each new rule, is still your job.',
    },
    {
      id: 'local-gates',
      kind: 'order',
      situation: 'Before opening a PR, you have Otto run every gate locally.',
      question: 'Put them in order, fastest feedback first.',
      steps: [
        { id: 'format', text: 'Format check' },
        { id: 'lint', text: 'Lint' },
        { id: 'typecheck', text: 'Typecheck' },
        { id: 'unit', text: 'Unit tests' },
        { id: 'build', text: 'Build' },
        { id: 'e2e', text: 'End-to-end smoke test' },
      ],
      explanation:
        'Cheap checks go first, so a stray quote fails in one second, not after a five-minute build. Slow, broad checks run last, once the small stuff is known to be clean.',
    },
  ],
} satisfies LessonInput;
