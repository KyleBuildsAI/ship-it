import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * 4.3: reviewing, the skill that matters most once an agent writes the code. Kyle reads
 * diffs for what they do rather than what they claim, comments like a good teammate, and
 * learns the guard rails (protected branches, CODEOWNERS) that make review unskippable.
 */
export const reviewingPullRequests = {
  id: 'reviewing-pull-requests',
  act: 4,
  title: 'Reviewing Pull Requests',
  briefing: [
    'When an agent writes the code, reviewing it is the job. The diff is the truth; the description is a claim.',
    'Quillwork’s main branch is protected, so every change waits for checks and an approval. Yours counts.',
  ],
  cards: [
    {
      id: 'agent-skipped-test',
      kind: 'choose',
      situation: 'Otto’s PR says it fixed the autosave bug. Here is part of the diff.',
      artifact: {
        kind: 'diff',
        label: 'PR #70 · src/editor/autosave.test.ts',
        text: [
          '@@ -22,7 +22,7 @@ describe("autosave", () => {',
          '-  it("saves within 2 seconds of the last keystroke", async () => {',
          '+  it.skip("saves within 2 seconds of the last keystroke", async () => {',
          '     typeInto(editor, "Dear Marco,");',
          '     await clock.advance(2000);',
          '     expect(store.saved).toContain("Dear Marco,");',
        ].join('\n'),
      },
      question: 'What do you do?',
      options: [
        {
          id: 'approve',
          text: 'Approve. CI is green and Otto says it’s fixed.',
          correct: false,
          feedback: 'CI is green because the test that catches the bug no longer runs.',
        },
        {
          id: 'request-changes',
          text: 'Request changes: the failing test was skipped, not fixed.',
          correct: true,
          feedback: 'Yes. A skipped test hides the bug instead of proving it’s gone.',
        },
        {
          id: 'fix-yourself',
          text: 'Approve, then fix the test yourself later.',
          correct: false,
          feedback: '“Later” usually means never, and the bug ships meanwhile.',
        },
      ],
      explanation:
        'Green checks only prove the tests that ran. Read what an agent changed in the tests as carefully as the code: skipping or loosening a test is a common way to fake a fix.',
    },
    {
      id: 'redirect-otto',
      kind: 'prompt',
      situation: 'You’ve requested changes on PR #70. Now you reply to Otto.',
      question: 'Which instruction gets a real fix?',
      options: [
        {
          id: 'try-again',
          text: 'That’s wrong. Try again.',
          correct: false,
          feedback: 'Otto doesn’t learn what was wrong, so the next try may be the same.',
        },
        {
          id: 'delete-test',
          text: 'Delete the test if it’s too strict.',
          correct: false,
          feedback: 'The test describes what users need. Deleting it deletes the promise.',
        },
        {
          id: 'longer-timeout',
          text: 'Raise the test’s wait from 2 to 10 seconds so it passes.',
          correct: false,
          feedback: 'That changes the promise to users instead of keeping it.',
        },
        {
          id: 'root-cause',
          text: 'Unskip the test and keep it as it is. Find why autosave misses the 2 second window, fix the code, and show me the test output.',
          correct: true,
          feedback: 'It names the rule, the goal, and the proof you want back.',
        },
      ],
      explanation:
        'Tell the agent what’s off limits (the test), what to find (the cause) and what proof to return (the output). Vague pushback just gets another guess.',
    },
    {
      id: 'review-comment',
      kind: 'choose',
      situation: 'You’re reviewing Dex’s PR titled “tidy billing code”.',
      artifact: {
        kind: 'diff',
        label: 'PR #72 · src/billing/invoice.ts',
        text: [
          '@@ -8,5 +8,5 @@',
          ' export function monthlyTotal(plan: Plan, seats: number) {',
          '-  return plan.pricePerSeat * seats;',
          '+  return plan.pricePerSeat;',
          ' }',
        ].join('\n'),
      },
      question: 'Which review comment is best?',
      options: [
        {
          id: 'harsh',
          text: 'This is wrong. Did you even test it?',
          correct: false,
          feedback: 'Right worry, but it attacks Dex and doesn’t say what’s wrong.',
        },
        {
          id: 'lgtm',
          text: 'LGTM!',
          correct: false,
          feedback: 'Approving without reading lets a billing bug into main.',
        },
        {
          id: 'specific',
          text: 'This drops seats, so a 10-seat team pays for one. Intended? A test with 10 seats would catch it.',
          correct: true,
          feedback: 'Specific and kind: it names the effect and suggests the proof.',
        },
        {
          id: 'rewrite',
          text: 'Push your own fix onto Dex’s branch without saying anything.',
          correct: false,
          feedback: 'Dex never learns why, and may undo it. Comment first.',
        },
      ],
      explanation:
        'A good review comment points at the line, says the effect, and suggests a fix or a test. Review the code, never the person.',
    },
    {
      id: 'nit',
      kind: 'choose',
      situation:
        'Priya’s PR works and is well tested. You’d have named one variable `draftCount` instead of `n`.',
      question: 'How do you say so?',
      options: [
        {
          id: 'nit',
          text: '“nit: `draftCount` might read clearer than `n`. Not blocking.” Then approve.',
          correct: true,
          feedback: 'Yes. She knows it’s a preference and the PR isn’t held up.',
        },
        {
          id: 'block',
          text: 'Request changes until it’s renamed.',
          correct: false,
          feedback: 'Blocking a working PR over a name costs a day for a small gain.',
        },
        {
          id: 'silent',
          text: 'Say nothing. Names don’t matter.',
          correct: false,
          feedback: 'Names do matter to the next reader. Just don’t block on them.',
        },
      ],
      explanation:
        'Label how much a comment matters. “nit” or “non-blocking” means a preference; request changes only for bugs, risks or missing tests. Reviewers who block on taste slow everyone down.',
    },
    {
      id: 'protected-main',
      kind: 'choose',
      situation: 'Priya tried to push a one-line typo fix straight to main.',
      artifact: {
        kind: 'terminal',
        text: [
          'PS> git push origin main',
          'remote: error: GH006: Protected branch update failed for refs/heads/main.',
          'remote: error: Changes must be made through a pull request.',
          ' ! [remote rejected] main -> main (protected branch hook declined)',
        ].join('\n'),
      },
      question: 'Why did GitHub refuse?',
      options: [
        {
          id: 'admin',
          text: 'Priya needs admin rights to push code.',
          correct: false,
          feedback: 'Admins go through PRs too. The rule is about process, not rank.',
        },
        {
          id: 'size',
          text: 'Pushes to main must be bigger than one line.',
          correct: false,
          feedback: 'Size has nothing to do with it. Read the second error line.',
        },
        {
          id: 'protected',
          text: 'Main is protected: every change needs a pull request, passing checks and an approval.',
          correct: true,
          feedback: 'Yes, set in the repo’s branch protection rules.',
        },
      ],
      explanation:
        'Branch protection makes the pull request the only door into main. Even a typo fix gets checks and a second pair of eyes, so main stays ready to ship.',
    },
    {
      id: 'codeowners',
      kind: 'choose',
      situation:
        'Dex approved Otto’s PR, which changes src/billing/refund.ts. The merge button is still blocked.',
      artifact: {
        kind: 'file',
        label: '.github/CODEOWNERS',
        text: ['/src/billing/   @priya', '/docs/          @marco', '*               @dex'].join(
          '\n',
        ),
      },
      question: 'Why is it blocked?',
      options: [
        {
          id: 'ci',
          text: 'CI must be failing.',
          correct: false,
          feedback: 'Maybe, but this file says something more specific about billing.',
        },
        {
          id: 'otto',
          text: 'GitHub won’t merge PRs written by an AI agent.',
          correct: false,
          feedback: 'Who wrote it doesn’t matter. Which files it touches does.',
        },
        {
          id: 'owner',
          text: 'Priya owns src/billing/, so her approval is required.',
          correct: true,
          feedback: 'Yes. CODEOWNERS plus protection means billing changes need Priya.',
        },
        {
          id: 'dex-blocked',
          text: 'Dex isn’t allowed to approve anything.',
          correct: false,
          feedback: 'Dex owns everything else (*). The billing line is more specific.',
        },
      ],
      explanation:
        'CODEOWNERS maps paths to the people who know them. With branch protection, a change to those paths can’t merge until an owner approves, however many others did.',
    },
    {
      id: 'self-review',
      kind: 'prompt',
      situation: 'Otto finished a refund change and wants to request Priya’s review.',
      question: 'What do you ask Otto to do first?',
      options: [
        {
          id: 'skeptic',
          text: 'Review your own diff like a sceptical senior: list risky changes, anything untested, and anything outside the issue’s scope. Don’t change code yet; report back.',
          correct: true,
          feedback: 'A self-review catches the obvious, so Priya spends time on the hard parts.',
        },
        {
          id: 'confirm',
          text: 'Confirm that everything is correct.',
          correct: false,
          feedback: 'Asked to confirm, an agent usually confirms. Ask it to look for problems.',
        },
        {
          id: 'approve-self',
          text: 'Approve your own PR so Priya has less to do.',
          correct: false,
          feedback: 'An author’s approval doesn’t count, and shouldn’t. Review needs other eyes.',
        },
      ],
      explanation:
        'Agents agree with the question they’re asked. Ask one to hunt for risk, gaps and scope creep, and you get a useful list instead of reassurance.',
    },
    {
      id: 'review-routine',
      kind: 'order',
      situation: 'Sage shows you how the team reviews any PR, from a person or from Otto.',
      question: 'Put the review in order.',
      steps: [
        { id: 'why', text: 'Read the description and the linked issue' },
        { id: 'ci', text: 'Check that CI passed' },
        { id: 'tests', text: 'Read the test changes' },
        { id: 'code', text: 'Read the code changes' },
        { id: 'run', text: 'Try the change if behaviour changed' },
        { id: 'verdict', text: 'Comment, then approve or request changes' },
      ],
      explanation:
        'Know the goal before the code. Reading tests first shows what the author claims to prove, so you can judge whether the code really does it.',
    },
  ],
} satisfies LessonInput;
