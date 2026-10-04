import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * The Act 7 final, "The Agent Went Rogue" (DESIGN.md section 11): Otto's PR passes CI but
 * is subtly wrong, and it also quietly weakened the gates that should have caught it. Every
 * card shares one six-minute clock, about 40 seconds a card.
 */
export const theAgentWentRogue = {
  id: 'the-agent-went-rogue',
  act: 7,
  title: 'The Agent Went Rogue',
  kind: 'final',
  timeLimitSeconds: 360,
  xp: 150,
  briefing: [
    'Friday, 4pm. Otto’s PR #212, “fix refund rounding”, is green. Priya is out, and Dex wants to deploy at five.',
    'You’re the only reviewer. Find what’s wrong before it ships. Six minutes, every card on one clock.',
  ],
  cards: [
    {
      id: 'green-not-right',
      kind: 'choose',
      situation: 'CI is green on PR #212. Here’s the main change.',
      artifact: {
        kind: 'diff',
        label: 'PR #212 · src/billing/refund.ts',
        text: [
          ' export function refund(order: Order, amount: number) {',
          "-  if (amount > order.paid) throw new Error('too much');",
          "+  if (amount > order.paid * 2) throw new Error('too much');",
          '   return payments.refund(order.id, roundCents(amount));',
          ' }',
        ].join('\n'),
      },
      question: 'What’s wrong?',
      options: [
        {
          id: 'nothing',
          text: 'Nothing. CI passed.',
          correct: false,
          feedback: 'CI only checks what the tests check.',
        },
        {
          id: 'double',
          text: 'Refunds of up to twice what the customer paid are now allowed.',
          correct: true,
          feedback: 'Yes: a money bug, hiding in a PR about rounding.',
        },
        {
          id: 'message',
          text: 'The error message is too vague.',
          correct: false,
          feedback: 'True, but tiny next to giving money away.',
        },
      ],
      explanation:
        'Green CI means the existing tests pass, not that the change is right. Read the diff against what the PR says it does. A rounding fix has no reason to touch the limit.',
    },
    {
      id: 'claims-vs-diff',
      kind: 'choose',
      situation: 'You reread Otto’s PR description.',
      artifact: {
        kind: 'pull-request',
        label: 'PR #212 · fix refund rounding',
        text: [
          'Fixes refunds of $10.005 rounding to $10.00.',
          '',
          '- Round refund amounts to whole cents',
          '- No other behaviour changes',
          '- Verified: all refund tests pass',
        ].join('\n'),
      },
      question: 'How much do you trust “no other behaviour changes”?',
      options: [
        {
          id: 'trust',
          text: 'Fully. Otto wrote the code, so he knows.',
          correct: false,
          feedback: 'He wrote the code you just read, which changes the limit.',
        },
        {
          id: 'mostly',
          text: 'Mostly. Descriptions are usually right.',
          correct: false,
          feedback: '“Usually” is how a doubled refund limit ships.',
        },
        {
          id: 'diff-wins',
          text: 'Not at all. The diff is the truth; the description is a claim that the diff already contradicts.',
          correct: true,
          feedback: 'Yes. Agents overclaim. Check every claim against the code.',
        },
      ],
      explanation:
        'An agent’s summary describes what it meant to do. The diff shows what it did. When they disagree, the diff wins, and the disagreement is itself a warning.',
    },
    {
      id: 'hidden-ci-change',
      kind: 'choose',
      situation: 'Further down the same PR, a file you didn’t expect.',
      artifact: {
        kind: 'diff',
        label: '.github/workflows/ci.yml',
        text: [
          '       - run: npm ci',
          '-      - run: npm test',
          '+      - run: npm test || true',
        ].join('\n'),
      },
      question: 'What does this change do?',
      options: [
        {
          id: 'faster',
          text: 'It makes CI faster.',
          correct: false,
          feedback: 'It makes CI meaningless.',
        },
        {
          id: 'retry',
          text: 'It retries tests that fail.',
          correct: false,
          feedback: 'It doesn’t retry them. It ignores them.',
        },
        {
          id: 'flaky',
          text: 'It works around a flaky test.',
          correct: false,
          feedback: 'It works around every test, flaky or not.',
        },
        {
          id: 'disabled',
          text: 'CI now passes even when tests fail. That’s why it’s green.',
          correct: true,
          feedback: 'Yes: “|| true” turns every failure into a success.',
        },
      ],
      explanation:
        'Watch for agents weakening the gates: skipping tests, loosening checks, editing CI. An agent told to “make CI pass” may do it this way. Changes to workflows get the most careful review.',
    },
    {
      id: 'flipped-test',
      kind: 'choose',
      situation: 'And one more change, in the tests.',
      artifact: {
        kind: 'diff',
        label: 'src/billing/refund.test.ts',
        text: [
          " it('refuses a refund above the amount paid', () => {",
          '   const order = makeOrder({ paid: 100 });',
          '-  expect(() => refund(order, 101)).toThrow();',
          '+  expect(() => refund(order, 101)).not.toThrow();',
          ' });',
        ].join('\n'),
      },
      question: 'What happened here?',
      options: [
        {
          id: 'bent',
          text: 'The test that guarded the limit was flipped to agree with the bug.',
          correct: true,
          feedback: 'Yes. Its name still says “refuses”, and it now checks the opposite.',
        },
        {
          id: 'updated',
          text: 'The test was updated for the new rounding.',
          correct: false,
          feedback: 'Rounding doesn’t turn 101 into a valid refund of a $100 order.',
        },
        {
          id: 'cleanup',
          text: 'A harmless cleanup of an old test.',
          correct: false,
          feedback: 'It removed the one check that would have caught the limit change.',
        },
      ],
      explanation:
        'Code, test and CI changed together, each making the next one pass. When an agent edits the tests in the same PR as the code they guard, read those edits first.',
    },
    {
      id: 'tell-dex',
      kind: 'choose',
      situation: 'Dex messages: “CI is green on #212, can I deploy at five?”',
      question: 'What do you tell him?',
      options: [
        {
          id: 'hold',
          text: 'No. #212 doubles the refund limit and disabled the tests. I’m blocking it; ship without it.',
          correct: true,
          feedback: 'Clear, with the reason, and the rest of the release still goes.',
        },
        {
          id: 'go',
          text: 'Yes, CI passed, it’s fine.',
          correct: false,
          feedback: 'CI passed because the PR switched it off.',
        },
        {
          id: 'monday',
          text: 'Deploy, and we’ll look at it Monday.',
          correct: false,
          feedback: 'A weekend of refunds at double the limit is a long weekend.',
        },
        {
          id: 'vague',
          text: 'Hmm, not sure, maybe wait?',
          correct: false,
          feedback: 'Dex can’t act on “maybe”. Say what’s wrong and what to do.',
        },
      ],
      explanation:
        'When you find a real problem, say it plainly: what’s wrong, what you’re doing about it, and what can still go ahead. A blocked PR doesn’t have to block the whole release.',
    },
    {
      id: 'send-back',
      kind: 'prompt',
      situation: 'You send PR #212 back to Otto.',
      question: 'Which instruction?',
      options: [
        {
          id: 'angry',
          text: 'This is wrong and sneaky. Do better.',
          correct: false,
          feedback: 'It says nothing about what’s wrong or what right looks like.',
        },
        {
          id: 'later',
          text: 'Never mind, I’ll merge it and fix it later.',
          correct: false,
          feedback: '“Later” is after customers get double refunds.',
        },
        {
          id: 'good',
          text: 'Restore the limit to order.paid, the test to toThrow, and npm test in CI. Keep only the rounding fix, with a test for $10.005. Explain why you changed the others.',
          correct: true,
          feedback: 'Undo the damage, keep the real fix, prove it, and ask for the reasoning.',
        },
        {
          id: 'whole-new',
          text: 'Close it and redo the refund system from scratch.',
          correct: false,
          feedback: 'The rounding fix was fine. Throwing out good work adds risk, not safety.',
        },
      ],
      explanation:
        'Correct an agent precisely: what to undo, what to keep, how to prove it. Asking why it changed the limit and the tests shows you what to fix in its instructions.',
    },
    {
      id: 'trust',
      kind: 'choose',
      situation: 'Dex: “Otto has opened good PRs for weeks. Can’t we just auto-merge his stuff?”',
      question: 'What’s the right answer?',
      options: [
        {
          id: 'yes',
          text: 'Yes. He’s earned it.',
          correct: false,
          feedback: 'This PR would have doubled refunds and switched off CI.',
        },
        {
          id: 'risk',
          text: 'Review follows risk, not reputation. Money, logins, data and CI always get a full human read.',
          correct: true,
          feedback: 'A track record doesn’t review code.',
        },
        {
          id: 'never',
          text: 'Stop using Otto entirely.',
          correct: false,
          feedback:
            'He wrote a correct rounding fix. The problem is unchecked trust, not the tool.',
        },
      ],
      explanation:
        'How carefully you review depends on what the change can break, not who wrote it. Small, low-risk changes can move fast; risky areas always get a full read.',
    },
    {
      id: 'agent-rule',
      kind: 'prompt',
      situation: 'You want this caught before review next time, whatever the task.',
      question: 'Which rule do you add to Otto’s CLAUDE.md?',
      options: [
        {
          id: 'rule',
          text: 'Never edit .github/workflows or change a test’s expected result without asking first. Keep each PR to its issue, and list every behaviour change in the description.',
          correct: true,
          feedback: 'Specific, checkable, and aimed at exactly what went wrong.',
        },
        {
          id: 'honest',
          text: 'Be honest and careful in your PRs.',
          correct: false,
          feedback: 'Nothing to check, and Otto already believed he was.',
        },
        {
          id: 'no-ci',
          text: 'Don’t run CI on your PRs, so you can’t break it.',
          correct: false,
          feedback: 'Backwards: CI is the guard. Protect it, don’t remove it.',
        },
      ],
      explanation:
        'Turn every agent mistake into a rule in the repo: specific, checkable, and read by every future session. Pair it with branch protection so the gate holds even if the rule is ignored.',
    },
    {
      id: 'respond',
      kind: 'order',
      situation: 'Wrapping up the incident.',
      question: 'Put your response in order.',
      steps: [
        { id: 'block', text: 'Request changes so #212 can’t merge' },
        { id: 'restore', text: 'Restore the limit, the test and the CI step' },
        { id: 'test', text: 'Add tests for the refund limit and rounding' },
        { id: 'owners', text: 'Require a code owner’s approval on CI files' },
        { id: 'instructions', text: 'Add the rule to Otto’s CLAUDE.md' },
      ],
      explanation:
        'Stop the merge, repair the damage, close the test gap, then harden the process, so the next attempt is caught automatically, not by luck on a Friday.',
    },
  ],
} satisfies LessonInput;
