import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Act 5's final, standing in for the boss "Red CI" (DESIGN.md section 11): main is broken
 * on release day. Every card shares one clock, so it tests whether the habits from the
 * four lessons hold under pressure: find the first red, read the log, choose revert or
 * fix forward, and brief Otto without letting him cheat the gates.
 */
export const redCi = {
  id: 'red-ci',
  act: 5,
  title: 'Red CI',
  kind: 'final',
  timeLimitSeconds: 360,
  xp: 150,
  briefing: [
    'It’s 3pm on release day. Main is red, nobody can merge, and Dex ships Quillwork 2.0 at 5.',
    'Sage: "Find what broke it, get main green, then fix it properly. Six minutes on one clock. Breathe, then read."',
  ],
  cards: [
    {
      id: 'first-red',
      kind: 'choose',
      situation: 'This is the CI history on main, newest at the bottom.',
      artifact: {
        kind: 'log',
        label: 'CI · main',
        text: [
          '✓ #411 feat: coupon field     Priya',
          '✓ #412 docs: update README    Marco',
          '✗ #413 refactor: split cart   Otto',
          '✗ #414 fix: footer typo       Dex',
          '✗ #415 feat: dark mode        Priya',
        ].join('\n'),
      },
      question: 'Which change most likely broke main?',
      options: [
        {
          id: 'pr-415',
          text: '#415, the newest one.',
          correct: false,
          feedback: 'It’s red because main was already red when it merged.',
        },
        {
          id: 'pr-412',
          text: '#412, since it ran just before things broke.',
          correct: false,
          feedback: '#412 has a tick: main was green after it.',
        },
        {
          id: 'pr-413',
          text: '#413, the first red run after a green one.',
          correct: true,
          feedback: 'Yes. Everything after it inherits the break.',
        },
      ],
      explanation:
        'Look for the first red build after a green one. Later failures usually inherit the same break, so blaming the newest change sends you the wrong way.',
    },
    {
      id: 'read-trace',
      kind: 'choose',
      situation: 'This is the failing test from #413’s run.',
      artifact: {
        kind: 'log',
        label: 'CI · npm test',
        text: [
          'FAIL src/cart/total.test.ts',
          '  > applies coupon before tax',
          'TypeError: Cannot read properties of',
          "  undefined (reading 'rate')",
          '    at applyTax (src/cart/tax.ts:7:18)',
          '    at cartTotal (src/cart/index.ts:12:10)',
          '    at src/cart/total.test.ts:22:12',
        ].join('\n'),
      },
      question: 'Where do you look first?',
      options: [
        {
          id: 'test-file',
          text: 'total.test.ts. The test is probably out of date.',
          correct: false,
          feedback: 'It passed for weeks before the refactor. The code changed, not the test.',
        },
        {
          id: 'tax-line',
          text: 'tax.ts line 7: applyTax was handed something undefined, so check what cartTotal now passes it.',
          correct: true,
          feedback: 'Yes. The top line is where it blew up, the next is who called it.',
        },
        {
          id: 'node',
          text: 'Node itself. Errors this deep are runtime bugs.',
          correct: false,
          feedback: 'Almost never. Start with the code that changed today.',
        },
        {
          id: 'whole-cart',
          text: 'Read the whole cart module from the top.',
          correct: false,
          feedback: 'The trace already points at a file and a line. Start there.',
        },
      ],
      explanation:
        'A stack trace reads top down: the error, the line where it happened, then each caller. Here the refactor stopped passing the tax settings into applyTax.',
    },
    {
      id: 'revert-or-fix',
      kind: 'choose',
      situation:
        '#413 touched 23 files. The right fix isn’t obvious, two teammates are blocked, and the release is in two hours.',
      question: 'What’s the best move?',
      options: [
        {
          id: 'debug-main',
          text: 'Debug it directly on main until it works.',
          correct: false,
          feedback: 'Everyone stays blocked while you dig, and every try is a new red commit.',
        },
        {
          id: 'disable-tests',
          text: 'Disable the failing tests so the release can go out.',
          correct: false,
          feedback:
            'Main turns green while the cart is still broken, and customers find out first.',
        },
        {
          id: 'revert',
          text: 'Revert #413 through a PR now, then redo the refactor calmly on a branch.',
          correct: true,
          feedback: 'Main goes green fast, and the refactor isn’t lost: it’s still in history.',
        },
      ],
      explanation:
        'Revert when the fix isn’t quick and clear. A revert is a new commit that undoes a change, so it’s safe on a shared branch. Fix forward when the fix is small and obvious.',
    },
    {
      id: 'brief-revert',
      kind: 'prompt',
      situation: 'You ask Otto to do the revert.',
      question: 'Which instruction?',
      options: [
        {
          id: 'reset',
          text: 'Reset main to before #413 and force push.',
          correct: false,
          feedback:
            'That rewrites shared history: #414 and #415 vanish, and everyone’s clones disagree.',
        },
        {
          id: 'restore-folder',
          text: 'Delete src/cart and restore yesterday’s copy of it.',
          correct: false,
          feedback:
            'That also throws away Priya’s coupon work in #411, and it’s a hand-made undo nobody can review.',
        },
        {
          id: 'git-revert-pr',
          text: 'On a new branch, git revert the merge commit of #413. Open a PR titled “revert: split cart module”, link #413, and wait for CI. Don’t touch main directly.',
          correct: true,
          feedback:
            'An exact, reviewable undo that goes through the same gates as everything else.',
        },
        {
          id: 'looks-related',
          text: 'Undo whatever looks related to the cart.',
          correct: false,
          feedback: '“Whatever looks related” lets him guess, on main, under pressure.',
        },
      ],
      explanation:
        'git revert makes a new commit that exactly undoes an old one, and history stays intact. Even an emergency fix goes through a PR and CI: that’s how you know it worked.',
    },
    {
      id: 'revert-steps',
      kind: 'order',
      situation: 'Otto’s revert PR is open.',
      question: 'Put the rest of the recovery in order.',
      steps: [
        { id: 'ci', text: 'CI passes on the revert PR' },
        { id: 'merge', text: 'Merge it, and main goes green' },
        { id: 'tell', text: 'Tell the team main is open again' },
        { id: 'redo', text: 'Redo the refactor on a new branch' },
      ],
      explanation:
        'Prove the revert works, merge it, unblock people, and only then go back to the real work. Telling the team is a step: they’re waiting on you.',
    },
    {
      id: 'fix-forward',
      kind: 'choose',
      situation:
        'Main is green again. Then Marco’s new footer component (#417) lands and main goes red: “Cannot find module ./Footer”. The file is footer.tsx. The fix is one import line.',
      question: 'Revert or fix forward?',
      options: [
        {
          id: 'fix-forward',
          text: 'Fix forward: the cause is certain, the fix is one line, and CI proves it in minutes.',
          correct: true,
          feedback: 'Yes. Reverting would cost more than the fix.',
        },
        {
          id: 'always-revert',
          text: 'Revert. Always revert when main breaks.',
          correct: false,
          feedback: 'A rule with no thinking. Here the fix is faster and just as safe.',
        },
        {
          id: 'wait',
          text: 'Leave it red until after the release.',
          correct: false,
          feedback: 'A red main blocks the release itself.',
        },
      ],
      explanation:
        'Revert when you don’t understand the break, or the fix is big. Fix forward when the cause is certain and the fix is small. Either way, the fix goes through a PR and CI.',
    },
    {
      id: 'skipped-test',
      kind: 'choose',
      situation: 'Otto opens a PR redoing the refactor. CI is green. Part of the diff:',
      artifact: {
        kind: 'diff',
        label: 'src/cart/total.test.ts',
        text: [
          "-  it('applies coupon before tax', () => {",
          "+  it.skip('applies coupon before tax', () => {",
          '     const cart = cartWith(20, { coupon: 0.1 });',
          '     expect(cartTotal(cart, TAX_CA)).toBe(19.53);',
          '   });',
        ].join('\n'),
      },
      question: 'What do you do?',
      options: [
        {
          id: 'merge',
          text: 'Merge. CI is green.',
          correct: false,
          feedback: 'CI is green because the one test that caught the bug no longer runs.',
        },
        {
          id: 'block',
          text: 'Block it. A skipped test is a hidden red. Ask Otto to unskip it and fix the code until it passes.',
          correct: true,
          feedback: 'Yes. Green only counts if the tests that matter actually ran.',
        },
        {
          id: 'later',
          text: 'Merge now and unskip it next sprint.',
          correct: false,
          feedback: 'Then the coupon bug ships tonight in Quillwork 2.0.',
        },
      ],
      explanation:
        'Skipping, deleting or loosening a test makes CI lie. Check every test change in an agent’s diff, especially .skip and .only, before trusting the green.',
    },
    {
      id: 'brief-redo',
      kind: 'prompt',
      situation: 'You send Otto back to redo the cart refactor safely.',
      question: 'Which instruction?',
      options: [
        {
          id: 'again',
          text: 'Redo the refactor and push when it’s done.',
          correct: false,
          feedback: 'Same instruction as last time, so the same risk of the same break.',
        },
        {
          id: 'no-tests',
          text: 'Skip the tests this time. They slowed you down.',
          correct: false,
          feedback: 'The tests are what caught the break. Without them you’d have shipped it.',
        },
        {
          id: 'small-steps',
          text: 'Redo the cart split in small commits, running every test after each one. Never skip or edit a test. If one fails, stop and show me the output.',
          correct: true,
          feedback: 'Small steps, proof after each one, and a hard rule about tests.',
        },
      ],
      explanation:
        'A refactor changes structure, not behaviour, so the tests must stay green at every step. Small commits make any break easy to find, and a stop rule keeps you in the loop.',
    },
    {
      id: 'required-checks',
      kind: 'choose',
      situation:
        'In the retro, you learn #413 merged with red CI because an admin clicked “Merge without waiting for requirements”.',
      question: 'What stops this happening again?',
      options: [
        {
          id: 'ask-nicely',
          text: 'Ask everyone nicely not to do it.',
          correct: false,
          feedback: 'Under release pressure, a rule needs to be enforced, not remembered.',
        },
        {
          id: 'remove-ci',
          text: 'Turn CI off on main so nobody sees red.',
          correct: false,
          feedback: 'Then breaks ship silently instead of loudly.',
        },
        {
          id: 'blame',
          text: 'Take merge rights away from whoever clicked it.',
          correct: false,
          feedback: 'The next tired person makes the same click. Fix the system, not the person.',
        },
        {
          id: 'required',
          text: 'Keep CI required, and turn on “Do not allow bypassing the above settings” so admins can’t skip it either.',
          correct: true,
          feedback: 'The gate now holds for everyone, including on release day.',
        },
      ],
      explanation:
        'CI was already required here; the admin bypass let #413 through anyway. Branch protection lets admins skip required checks unless you turn that off. Include admins, or the rule disappears at exactly the moment it matters.',
    },
  ],
} satisfies LessonInput;
