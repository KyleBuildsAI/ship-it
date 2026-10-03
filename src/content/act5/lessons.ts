import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Act 5: Quality Gates (DESIGN.md section 11), taught as lessons: tests, types, lint and
 * CI are what turn an agent's confident change into a checked one.
 */

export const testsAreGuardrails = {
  id: 'tests-are-guardrails',
  act: 5,
  title: 'Tests Are Guardrails',
  briefing: [
    'Every change an agent makes is a guess until something checks it.',
    'Tests, types and lint are the gates. They check every change the same way, every time, without getting tired.',
  ],
  cards: [
    {
      id: 'test-kinds',
      kind: 'choose',
      situation:
        'You need to check a price function, that the API saves orders to the database, and that a user can check out in the browser.',
      question: 'Which tests match, in that order?',
      options: [
        {
          id: 'all-e2e',
          text: 'End-to-end for all three.',
          correct: false,
          feedback: 'End-to-end tests are slow and vague when they fail. Save them for flows.',
        },
        {
          id: 'all-unit',
          text: 'Unit tests for all three.',
          correct: false,
          feedback: 'A unit test can’t prove the database or the browser work.',
        },
        {
          id: 'right',
          text: 'Unit, integration, end-to-end.',
          correct: true,
          feedback: 'Yes: one function, parts together, then the whole app like a user.',
        },
      ],
      explanation:
        'Unit tests are fast and precise. Integration tests check that parts work together. End-to-end tests drive the real app. Have many unit tests and a few end-to-end ones.',
    },
    {
      id: 'test-first',
      kind: 'prompt',
      situation: 'Bug: discounts over 100% make prices negative. You want the agent to fix it.',
      question: 'Which instruction?',
      options: [
        {
          id: 'fix',
          text: 'Fix the discount bug.',
          correct: false,
          feedback: 'You’ll get a change, but no proof it works or stays fixed.',
        },
        {
          id: 'tdd',
          text: 'First write a failing test: a 150% discount gives a price of 0. Show it failing. Then fix the code and show the test passing.',
          correct: true,
          feedback: 'The failing test proves the bug exists, and that the fix fixes it.',
        },
        {
          id: 'many',
          text: 'Write lots of tests for everything.',
          correct: false,
          feedback: 'Unfocused. You want one test that pins this bug down.',
        },
      ],
      explanation:
        'Ask for the failing test first. A test that never failed might not test anything. Once it passes, it guards against the bug coming back.',
    },
    {
      id: 'weakened-test',
      kind: 'choose',
      situation: 'The agent says “all tests pass now”. Here is its commit.',
      artifact: {
        kind: 'diff',
        label: 'src/discount.test.ts',
        text: [
          '-  expect(applyDiscount(100, 150)).toBe(0);',
          '+  expect(applyDiscount(100, 150)).toBeLessThan(100);',
        ].join('\n'),
      },
      question: 'What happened?',
      options: [
        {
          id: 'weakened',
          text: 'It loosened the test instead of fixing the code: -50 is less than 100.',
          correct: true,
          feedback: 'Right. The test now passes with the bug still there.',
        },
        {
          id: 'fine',
          text: 'Nothing is wrong. The tests pass.',
          correct: false,
          feedback: 'Passing tests only matter if they test the right thing.',
        },
        {
          id: 'flaky',
          text: 'The test was flaky.',
          correct: false,
          feedback: 'It failed every time, because the bug was real.',
        },
      ],
      explanation:
        'Watch for agents changing tests to match buggy code. Review test diffs as carefully as code diffs, and tell the agent tests are never to be weakened.',
    },
    {
      id: 'type-error',
      kind: 'choose',
      situation: 'The typecheck fails on the agent’s change.',
      artifact: {
        kind: 'error',
        label: 'tsc',
        text: [
          "src/cart.ts:14:22 - error TS2345: Argument of type 'string'",
          "is not assignable to parameter of type 'number'.",
          '14   const total = addTax(form.price);',
        ].join('\n'),
      },
      question: 'What does it tell you?',
      options: [
        {
          id: 'silence',
          text: 'Add “as any” to make it pass.',
          correct: false,
          feedback: 'That hides the bug: "9.99" plus tax becomes glued text.',
        },
        {
          id: 'ignore',
          text: 'Types are optional. Ignore it.',
          correct: false,
          feedback: 'It’s a gate for a reason: this is a real bug.',
        },
        {
          id: 'string',
          text: 'form.price is text, like "9.99", but addTax needs a number. Convert and validate it.',
          correct: true,
          feedback: 'Yes: the type checker found a bug before any user did.',
        },
      ],
      explanation:
        'Type errors are free bug reports. Values from forms and APIs arrive as text, so convert and validate them. Never silence the checker to get green.',
    },
    {
      id: 'lint',
      kind: 'choose',
      situation: 'Lint fails on the agent’s diff: “debugger statement” and “unused variable”.',
      question: 'Why does lint block the merge?',
      options: [
        {
          id: 'looks',
          text: 'It’s only about how code looks.',
          correct: false,
          feedback: 'A debugger statement freezes the app for anyone with dev tools open.',
        },
        {
          id: 'clean',
          text: 'It catches leftovers and likely mistakes the same way every time, so reviewers can focus on logic.',
          correct: true,
          feedback: 'Right: robots check leftovers, humans check meaning.',
        },
        {
          id: 'skip',
          text: 'It shouldn’t. Skip lint when busy.',
          correct: false,
          feedback: 'A skipped gate soon becomes a missing gate.',
        },
      ],
      explanation:
        'Lint finds patterns that are usually mistakes: leftover debuggers, unused code, risky constructs. Automating that keeps reviews about behaviour.',
    },
    {
      id: 'local-gates',
      kind: 'order',
      situation: 'Before opening a PR, you have the agent run the gates locally.',
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
        'Cheap, fast checks go first, so a missing comma fails in a second, not after a five-minute build. The slow, broad checks run last.',
    },
  ],
} satisfies LessonInput;

export const ciAndDeploys = {
  id: 'ci-and-deploys',
  act: 5,
  title: 'CI and Deploys',
  briefing: [
    'CI runs every gate on a fresh machine for every push. If it passes there, it isn’t just your laptop.',
    'Then a deploy ships it. Secrets, runners and dependency updates all live in this pipeline.',
  ],
  cards: [
    {
      id: 'read-workflow',
      kind: 'choose',
      situation: 'This is the repo’s CI workflow.',
      artifact: {
        kind: 'file',
        label: '.github/workflows/ci.yml',
        text: [
          'on: [pull_request]',
          'jobs:',
          '  test:',
          '    runs-on: ubuntu-latest',
          '    steps:',
          '      - uses: actions/checkout@v4',
          '      - uses: actions/setup-node@v4',
          '        with: { node-version: 22 }',
          '      - run: npm ci',
          '      - run: npm test',
        ].join('\n'),
      },
      question: 'When does it run, and what does it do?',
      options: [
        {
          id: 'right',
          text: 'On every PR, a fresh Ubuntu machine checks out the code, installs exact dependencies, and runs the tests.',
          correct: true,
          feedback: 'Exactly.',
        },
        {
          id: 'nightly',
          text: 'Once a night, on your laptop.',
          correct: false,
          feedback: '“on: pull_request” and “runs-on: ubuntu-latest” say otherwise.',
        },
        {
          id: 'deploy',
          text: 'It deploys the app to production.',
          correct: false,
          feedback: 'There’s no deploy step here: just install and test.',
        },
      ],
      explanation:
        'A workflow says when (on), where (runs-on) and what (steps). npm ci installs exactly what the lockfile says, so CI tests what you tested.',
    },
    {
      id: 'works-locally',
      kind: 'choose',
      situation:
        'Tests pass on your laptop but fail in CI with “Cannot find module ./Config”. The file is called config.ts.',
      question: 'What’s the likely cause?',
      options: [
        {
          id: 'ci-broken',
          text: 'CI is broken. Re-run until it’s green.',
          correct: false,
          feedback: 'It will fail the same way every time.',
        },
        {
          id: 'skip',
          text: 'Skip that test in CI.',
          correct: false,
          feedback: 'The app would fail on Linux servers too.',
        },
        {
          id: 'case',
          text: 'Windows ignores filename case and Linux doesn’t. The import must match the real name.',
          correct: true,
          feedback: 'Yes: a classic laptop-versus-CI difference.',
        },
      ],
      explanation:
        'CI is a clean machine with none of your laptop’s leftovers. When it disagrees with you it’s usually right: filename case, missing files, or undeclared dependencies.',
    },
    {
      id: 'secret-in-ci',
      kind: 'prompt',
      situation: 'The deploy step needs an API key. Your agent asks how to provide it.',
      question: 'Which instruction?',
      options: [
        {
          id: 'commit',
          text: 'Put the key in deploy.yml so CI can read it.',
          correct: false,
          feedback: 'Everyone with access to the repo, and every fork, can read it forever.',
        },
        {
          id: 'secrets',
          text: 'Put the key in no file. I’ll add a GitHub Actions secret named DEPLOY_TOKEN. Read it in the workflow as secrets.DEPLOY_TOKEN, and never print it.',
          correct: true,
          feedback: 'The key stays out of git and out of logs, and you add it yourself.',
        },
        {
          id: 'paste',
          text: 'I’ll paste the key in chat. Hardcode it.',
          correct: false,
          feedback: 'Keys never go in chat or in code. Use the secret store.',
        },
      ],
      explanation:
        'Secrets go in the platform’s secret store, never in the repo or a chat. Workflows read them by name, and the logs mask them.',
    },
    {
      id: 'self-hosted',
      kind: 'choose',
      situation: 'Your end-to-end tests need your NVIDIA GPU, which GitHub’s machines don’t have.',
      question: 'Which option fits?',
      options: [
        {
          id: 'self',
          text: 'A self-hosted runner on the machine with the GPU, used only for that job.',
          correct: true,
          feedback: 'Yes: your machine runs that job for GitHub Actions.',
        },
        {
          id: 'never',
          text: 'Never test GPU features.',
          correct: false,
          feedback: 'Then GPU bugs reach users first.',
        },
        {
          id: 'public',
          text: 'Let any public PR run on your machine.',
          correct: false,
          feedback: 'Strangers’ code would run on your computer. Restrict it.',
        },
      ],
      explanation:
        'Self-hosted runners let CI use special hardware. They run whatever a workflow tells them to, so never let untrusted PRs use them.',
    },
    {
      id: 'dependency-pr',
      kind: 'choose',
      situation: 'A bot opened this dependency update.',
      artifact: {
        kind: 'pull-request',
        label: 'PR #88 by dependabot',
        text: [
          'Bump vite from 6.2.1 to 7.0.0',
          'Release notes: Breaking: drops Node 18 support...',
          'CI: 2 checks failing',
        ].join('\n'),
      },
      question: 'What do you do?',
      options: [
        {
          id: 'auto',
          text: 'Auto-merge every dependency PR.',
          correct: false,
          feedback: 'With failing checks? That breaks main.',
        },
        {
          id: 'close',
          text: 'Close it. Updates are risky.',
          correct: false,
          feedback: 'Skipped updates pile up security fixes and bigger jumps later.',
        },
        {
          id: 'read',
          text: 'Read the breaking changes, fix what fails, and merge once it’s green.',
          correct: true,
          feedback: 'Major versions need reading. CI tells you what broke.',
        },
      ],
      explanation:
        'Patch and minor updates usually merge on green. Major versions announce breaking changes: read them, fix, test. Small regular updates beat one giant one.',
    },
    {
      id: 'deploy-flow',
      kind: 'order',
      situation: 'A PR is approved.',
      question: 'Put a safe continuous deploy in order.',
      steps: [
        { id: 'merge', text: 'Merge to main' },
        { id: 'ci', text: 'CI runs every gate on main' },
        { id: 'build', text: 'Build the release once' },
        { id: 'staging', text: 'Deploy to staging and smoke test it' },
        { id: 'prod', text: 'Deploy that same build to production' },
      ],
      explanation:
        'Build once and deploy the same thing everywhere. Staging catches surprises before users do, and every step is automatic and repeatable.',
    },
  ],
} satisfies LessonInput;

export const redCi = {
  id: 'red-ci',
  act: 5,
  title: 'Red CI',
  kind: 'final',
  timeLimitSeconds: 300,
  xp: 150,
  briefing: [
    'Main is red. Nobody can merge, and the release is tomorrow.',
    'Find the commit that broke it, then fix forward or revert. Five minutes on one clock.',
  ],
  cards: [
    {
      id: 'first-red',
      kind: 'choose',
      situation: 'This is the CI history on main.',
      artifact: {
        kind: 'log',
        label: 'CI · main',
        text: [
          '✓ #412  feat: add coupon field       (Ana)',
          '✓ #413  docs: update README          (Kyle)',
          '✗ #414  refactor: split cart module  (agent)',
          '✗ #415  fix: typo in footer          (Raj)',
        ].join('\n'),
      },
      question: 'Which change most likely broke main?',
      options: [
        {
          id: 'pr-415',
          text: '#415, the latest.',
          correct: false,
          feedback: 'It’s red because main was already red.',
        },
        {
          id: 'pr-414',
          text: '#414, the first red run.',
          correct: true,
          feedback: 'Yes: everything after it inherits the break.',
        },
        {
          id: 'pr-413',
          text: '#413, because it touched the README.',
          correct: false,
          feedback: 'It passed, and docs rarely break tests.',
        },
      ],
      explanation:
        'Look for the first red build after a green one. Later failures usually inherit the same break.',
    },
    {
      id: 'revert-or-fix',
      kind: 'choose',
      situation: '#414 is a big refactor. The fix isn’t obvious, and two teammates are blocked.',
      question: 'Best move?',
      options: [
        {
          id: 'revert',
          text: 'Revert #414 through a PR now, then fix the refactor calmly on a branch.',
          correct: true,
          feedback: 'Main goes green fast, and nothing is lost.',
        },
        {
          id: 'dig',
          text: 'Spend the evening debugging on main.',
          correct: false,
          feedback: 'Everyone stays blocked while you dig.',
        },
        {
          id: 'disable',
          text: 'Disable the failing tests.',
          correct: false,
          feedback: 'Main turns “green” while still broken.',
        },
      ],
      explanation:
        'Revert when the fix isn’t quick: a revert is a new commit that undoes the change, safe on a shared branch. Fix forward when the fix is small and clear.',
    },
    {
      id: 'read-failure',
      kind: 'choose',
      situation: 'This is the test log from #414.',
      artifact: {
        kind: 'log',
        label: 'CI · unit tests',
        text: [
          'FAIL src/cart/total.test.ts',
          '  ✕ applies coupon before tax',
          "    TypeError: Cannot read properties of undefined (reading 'rate')",
          '      at applyTax (src/cart/tax.ts:7:18)',
          '      at total (src/cart/index.ts:12:10)',
        ].join('\n'),
      },
      question: 'Where do you look first?',
      options: [
        {
          id: 'test',
          text: 'The test file. It’s probably wrong.',
          correct: false,
          feedback: 'The test passed before the refactor.',
        },
        {
          id: 'node',
          text: 'Node itself has a bug.',
          correct: false,
          feedback: 'Almost never. Start with your own code.',
        },
        {
          id: 'tax',
          text: 'tax.ts line 7: something passed to applyTax is undefined.',
          correct: true,
          feedback: 'The top frame is where it blew up.',
        },
      ],
      explanation:
        'Read a stack trace from the top: the error, the line where it happened, then who called it. Here the refactor stopped passing the tax settings in.',
    },
    {
      id: 'redo-refactor',
      kind: 'prompt',
      situation: 'Main is green after the revert. You want the agent to redo #414 properly.',
      question: 'Which instruction?',
      options: [
        {
          id: 'again',
          text: 'Redo the refactor and push.',
          correct: false,
          feedback: 'Same instruction, same risk of the same break.',
        },
        {
          id: 'good',
          text: 'Branch from main. Redo the cart split in small commits, running the full test suite after each. If a test fails, stop and show me. Don’t edit tests to pass.',
          correct: true,
          feedback: 'Small steps, proof at each one, and a rule about tests.',
        },
        {
          id: 'skip',
          text: 'Skip the tests this time. They slow you down.',
          correct: false,
          feedback: 'The tests are what caught the break.',
        },
      ],
      explanation:
        'A refactor changes structure, not behaviour, so the tests must stay green at every step. Small commits make any break easy to find.',
    },
    {
      id: 'flaky',
      kind: 'choose',
      situation: 'A test fails about once in ten runs, on random PRs.',
      question: 'How do you handle it?',
      options: [
        {
          id: 'track',
          text: 'File an issue, quarantine the test with a link to it, and fix the cause soon.',
          correct: true,
          feedback: 'Visible, temporary, and owned.',
        },
        {
          id: 'retry',
          text: 'Auto-retry every test three times, forever.',
          correct: false,
          feedback: 'It hides real bugs that fail now and then.',
        },
        {
          id: 'ignore',
          text: 'Ignore it. People can re-run.',
          correct: false,
          feedback: 'People stop trusting red, and miss real failures.',
        },
      ],
      explanation:
        'Flaky tests wear away trust in CI. Track them, isolate them on purpose, and fix the cause, which is often timing or shared state.',
    },
    {
      id: 'required-checks',
      kind: 'choose',
      situation: '#414 merged with red CI because an admin clicked “merge anyway”.',
      question: 'What stops that happening again?',
      options: [
        {
          id: 'ask',
          text: 'Ask people nicely not to.',
          correct: false,
          feedback: 'Under pressure, a rule needs teeth.',
        },
        {
          id: 'remove-ci',
          text: 'Remove CI so nobody sees red.',
          correct: false,
          feedback: 'Then bugs ship silently.',
        },
        {
          id: 'required',
          text: 'Make CI a required check in branch protection, with no bypass for admins.',
          correct: true,
          feedback: 'The gate holds for everyone.',
        },
      ],
      explanation:
        'Required checks turn “please wait for green” into a rule GitHub enforces. Include administrators, or the rule disappears at the worst moment.',
    },
  ],
} satisfies LessonInput;

/** Act 5's lessons in play order, final last. */
export const act5Lessons: readonly LessonInput[] = [testsAreGuardrails, ciAndDeploys, redCi];
