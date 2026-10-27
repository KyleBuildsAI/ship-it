import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Lesson 5.3: CI as a clean machine that runs the gates for everyone. Most of the cards
 * are about reading what CI says (a workflow file, an Actions log) and turning that into
 * a brief Otto can act on.
 */
export const readingCi = {
  id: 'reading-ci',
  act: 5,
  title: 'Reading CI',
  briefingBeat: 'change-passes',
  briefing: [
    'Continuous integration, CI, runs every gate on a fresh machine for every push. Your laptop can’t hide anything from it.',
    'Dex: "When CI goes red, nobody guesses. We read the log, find the first failure, and hand Otto exactly that."',
  ],
  cards: [
    {
      id: 'read-workflow',
      beat: 'change-passes',
      kind: 'choose',
      situation: 'This is Quillwork’s CI workflow.',
      artifact: {
        kind: 'file',
        label: '.github/workflows/ci.yml',
        text: [
          'name: CI',
          'on: [pull_request]',
          'jobs:',
          '  gates:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - uses: actions/checkout@v4',
          '      - uses: actions/setup-node@v4',
          '        with: { node-version: 22 }',
          '      - run: npm ci',
          '      - run: npm run lint',
          '      - run: npm run typecheck',
          '      - run: npm test',
        ].join('\n'),
      },
      question: 'When does it run, and what does it do?',
      options: [
        {
          id: 'nightly',
          text: 'Once a night, on whoever’s laptop is on.',
          correct: false,
          feedback: '“on: pull_request” and “runs-on: ubuntu-latest” say otherwise.',
        },
        {
          id: 'deploy',
          text: 'On every PR it deploys Quillwork to production.',
          correct: false,
          feedback: 'There’s no deploy step: it installs and checks, nothing more.',
        },
        {
          id: 'gates',
          text: 'On every PR, a fresh Linux machine checks out the code, installs exact dependencies, then runs lint, typecheck and tests.',
          correct: true,
          feedback: 'Exactly. Trigger, machine, steps.',
        },
      ],
      explanation:
        'A workflow says when (on), where (runs-on) and what (steps). Steps run top to bottom, and the job stops at the first one that fails.',
    },
    {
      id: 'actions-log',
      beat: 'gate-blocks',
      kind: 'choose',
      situation: 'CI is red on Otto’s PR #57. This is the job log.',
      artifact: {
        kind: 'log',
        label: 'CI / gates (pull_request)',
        text: [
          '✓ Set up job',
          '✓ Run actions/checkout@v4',
          '✓ Run actions/setup-node@v4',
          '✓ Run npm ci',
          '    added 812 packages in 21s',
          '✓ Run npm run lint',
          '✗ Run npm run typecheck',
          '    src/editor/toolbar.ts(41,7):',
          "    error TS2322: Type 'undefined' is",
          "    not assignable to type 'Shortcut'.",
          '    Error: Process completed with',
          '    exit code 2.',
          '○ Run npm test  (skipped)',
        ].join('\n'),
      },
      question: 'What does the log tell you?',
      options: [
        {
          id: 'reinstall',
          text: 'npm ci didn’t install the packages properly, so typecheck couldn’t find the types. Clear the cache and reinstall.',
          correct: false,
          feedback: 'npm ci has a tick. It installed 812 packages fine.',
        },
        {
          id: 'typecheck',
          text: 'Typecheck failed at toolbar.ts line 41. The tests were skipped, so they haven’t told us anything yet.',
          correct: true,
          feedback: 'Yes: the first ✗ is the real failure, and everything after it never ran.',
        },
        {
          id: 'github-down',
          text: 'Exit code 2 means the runner itself crashed, likely a GitHub outage. Our code didn’t change, so re-run the job.',
          correct: false,
          feedback: 'Exit code 2 is just the typecheck saying “I found errors”.',
        },
        {
          id: 'tests-fail',
          text: 'Typecheck and the tests both failed, so the change is badly broken. Close PR #57 and start over.',
          correct: false,
          feedback: 'Look again: the tests were skipped, not failed.',
        },
      ],
      explanation:
        'Read a CI log top down, find the first failing step, and read its own output. Steps after it were skipped, so their silence means nothing yet.',
    },
    {
      id: 'works-locally',
      beat: 'gate-blocks',
      kind: 'choose',
      situation:
        'Priya’s tests pass on her Windows laptop but fail in CI with “Cannot find module ./Config”. The file on disk is config.ts.',
      question: 'What’s the likely cause?',
      options: [
        {
          id: 'case',
          text: 'Windows ignores the case of file names and Linux doesn’t. The import must match the real name exactly.',
          correct: true,
          feedback: 'Yes. A classic laptop-versus-CI difference, and CI is right.',
        },
        {
          id: 'rerun',
          text: 'CI’s runner must have a stale cache, since the same code passes on her laptop. Clear the Actions cache and re-run until it passes.',
          correct: false,
          feedback:
            'No cache changes how a file is named. It will fail the same way every time: nothing about it is random.',
        },
        {
          id: 'skip',
          text: 'Skip that test in CI, since it works on her machine.',
          correct: false,
          feedback: 'Quillwork’s servers run Linux too. It would crash in production.',
        },
      ],
      explanation:
        'CI is a clean machine with none of your laptop’s leftovers. When it disagrees with you, it’s usually right: file name case, files you forgot to commit, or packages you never declared.',
    },
    {
      id: 'wait-for-ci',
      beat: 'change-passes',
      kind: 'choose',
      situation:
        'Dex: “It passes on my laptop. Can I merge while CI is still running? The fix is tiny.”',
      question: 'Why wait for CI?',
      options: [
        {
          id: 'rules',
          text: 'Because the rules say so.',
          correct: false,
          feedback: 'True, but Dex deserves the reason, not just the rule.',
        },
        {
          id: 'slow',
          text: 'He doesn’t need to. Small fixes can skip it.',
          correct: false,
          feedback: 'Small fixes break main too, and a broken main blocks everyone.',
        },
        {
          id: 'clean-and-merged',
          text: 'CI checks his change on a clean machine, combined with today’s main, which his laptop can’t do.',
          correct: true,
          feedback: 'Yes. It catches what his machine hides and what someone else just merged.',
        },
      ],
      explanation:
        'On a PR, CI tests your branch merged with the latest main. Two changes that each pass alone can break together. Waiting minutes for green saves the whole team hours.',
    },
    {
      id: 'flaky',
      beat: 'flaky-check',
      kind: 'choose',
      situation:
        'A test about autosave fails about one run in ten, on random PRs. People have started clicking “Re-run jobs” without reading.',
      question: 'How do you handle it?',
      options: [
        {
          id: 'retry-forever',
          text: 'Turn on automatic retries: every test gets three tries in CI, so a one-in-ten blip never blocks a PR again.',
          correct: false,
          feedback: 'That also hides real bugs that only fail sometimes.',
        },
        {
          id: 'ignore',
          text: 'Leave it. Re-running is quick.',
          correct: false,
          feedback: 'Soon people re-run real failures too, and stop trusting red.',
        },
        {
          id: 'delete',
          text: 'Delete the test. Autosave works most of the time.',
          correct: false,
          feedback: '“Most of the time” is what users lose their work to.',
        },
        {
          id: 'track',
          text: 'File an issue, quarantine the test with a link to it, and fix the cause soon.',
          correct: true,
          feedback: 'Visible, temporary, and owned by someone.',
        },
      ],
      explanation:
        'A flaky test teaches people to ignore red. Track it, set it aside on purpose, and fix the cause. It’s often timing, like waiting a fixed second for autosave, or tests sharing data.',
    },
    {
      id: 'brief-from-log',
      beat: 'red-to-green',
      kind: 'prompt',
      situation: 'CI is red on Otto’s PR #57 with the toolbar type error. You want him to fix it.',
      question: 'Which instruction?',
      options: [
        {
          id: 'vague',
          text: 'CI is red. Fix it.',
          correct: false,
          feedback: 'He’ll have to guess which step, and he may “fix” CI instead of the code.',
        },
        {
          id: 'change-workflow',
          text: 'CI is red on #57 at the typecheck step. Get it green whatever it takes, and edit the workflow or tsconfig.json if that’s quicker.',
          correct: false,
          feedback: 'The quickest edit is deleting the typecheck step. You just allowed it.',
        },
        {
          id: 'rerun',
          text: 'Re-run CI a few times until it goes green.',
          correct: false,
          feedback: 'A type error isn’t random. It will be red every time.',
        },
        {
          id: 'log-and-limits',
          text: 'CI fails at typecheck on #57: toolbar.ts(41,7), undefined isn’t a Shortcut. Reproduce it with npm run typecheck, fix our code, and push. Don’t touch the CI config.',
          correct: true,
          feedback: 'He gets the exact failure, how to reproduce it, and what not to touch.',
        },
      ],
      explanation:
        'Give the agent the evidence: which step failed and its error. Ask it to reproduce locally first, so it can test its own fix, and rule out editing the gate itself.',
    },
    {
      id: 'claims-green',
      beat: 'change-passes',
      kind: 'prompt',
      situation: 'Otto replies: “Fixed! CI should pass now.” He hasn’t shown any output.',
      question: 'What do you send back?',
      options: [
        {
          id: 'merge',
          text: 'Great, thanks. You’ve fixed type errors like this before, so I trust it. Merge as soon as you’ve pushed, and we’ll keep an eye on main.',
          correct: false,
          feedback:
            '“Should pass” is a guess. You haven’t seen anything run, and main is where everyone pays.',
        },
        {
          id: 'show-me',
          text: 'Show me: paste the output of npm run typecheck and npm test from your run, and link the CI run for your new commit.',
          correct: true,
          feedback: 'Evidence you can check in ten seconds, from his machine and from CI.',
        },
        {
          id: 'sure',
          text: 'Are you sure it passes? Double-check your change, and tell me again once you’re confident.',
          correct: false,
          feedback: 'He’ll say yes. Agents are confident. Ask for proof, not confidence.',
        },
      ],
      explanation:
        'An agent’s “done” is a claim. Ask for the evidence: the command output and the CI run. If it can’t show green, it isn’t green yet.',
    },
    {
      id: 'push-to-check',
      beat: 'change-passes',
      kind: 'order',
      situation: 'You push a commit to an open PR.',
      question: 'Put what happens next in order.',
      steps: [
        { id: 'trigger', text: 'GitHub sees the push and starts the workflow' },
        { id: 'runner', text: 'A runner starts a fresh machine' },
        { id: 'install', text: 'It checks out the code and runs npm ci' },
        { id: 'steps', text: 'It runs each step, stopping at the first failure' },
        { id: 'report', text: 'The result shows as a check on the PR' },
      ],
      explanation:
        'Every push repeats this from scratch. That’s why CI is trustworthy: nothing from the last run or from anyone’s laptop leaks in.',
    },
  ],
} satisfies LessonInput;
