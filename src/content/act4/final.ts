import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Act 4's final, "Rejected Push" (DESIGN.md section 11): 5pm on release day, a refund bug
 * in 3.0.0, and every shortcut the act warned about is suddenly tempting. One clock for
 * all eight cards, so the habits have to hold under pressure.
 */
export const rejectedPush = {
  id: 'rejected-push',
  act: 4,
  title: 'Rejected Push',
  kind: 'final',
  // Six minutes for eight cards: 45 seconds each, enough to read every artifact once.
  timeLimitSeconds: 360,
  xp: 150,
  briefing: [
    '5pm on release day. Quillwork 3.0.0 went out at noon, and refunds are rounding down. Marco wants a fix tonight.',
    'One clock for every card. Under pressure, the right move is rarely the fastest-looking one.',
  ],
  cards: [
    {
      id: 'protected-reject',
      kind: 'choose',
      situation:
        'Dex fixed the rounding on his laptop and pushed straight to main. Panicking, he shows you this.',
      artifact: {
        kind: 'terminal',
        text: [
          'PS> git push origin main',
          'remote: error: GH006: Protected branch update failed for refs/heads/main.',
          'remote: error: Changes must be made through a pull request.',
          ' ! [remote rejected] main -> main (protected branch hook declined)',
        ].join('\n'),
      },
      question: 'What should Dex do?',
      options: [
        {
          id: 'pr',
          text: 'Push to a fix branch, open a small PR, and ask Priya for a quick review.',
          correct: true,
          feedback: 'Yes. The protection is the process, even at 5pm.',
        },
        {
          id: 'disable',
          text: 'Turn off branch protection for five minutes.',
          correct: false,
          feedback: 'That’s exactly how an unreviewed bug reaches users on release day.',
        },
        {
          id: 'force',
          text: 'Push again with --force.',
          correct: false,
          feedback: 'Force doesn’t get past protection, and it shouldn’t.',
        },
      ],
      explanation:
        'Protection rules matter most under pressure. A small PR with a clear description gets reviewed in minutes, and the fix still gets a second pair of eyes.',
    },
    {
      id: 'brief-the-hotfix',
      kind: 'prompt',
      situation: 'Dex’s fix turned out to be wrong. You hand the bug to Otto instead.',
      question: 'Which instruction?',
      options: [
        {
          id: 'broad',
          text: 'Fix all the rounding in the whole app while you’re there.',
          correct: false,
          feedback: 'On release day, a big diff is a big risk.',
        },
        {
          id: 'tight',
          text: 'On branch fix/refund-rounding, make refunds round to the nearest cent. Add a test for 10.005. Change nothing else. Open a PR closing #88 and tell me when CI is green.',
          correct: true,
          feedback: 'One fix, one test, one branch, and a clear finish line.',
        },
        {
          id: 'main',
          text: 'Fix it directly on main to save time.',
          correct: false,
          feedback: 'Main is protected, and skipping review is the risk you’re avoiding.',
        },
      ],
      explanation:
        'Under time pressure, narrow the scope: one fix, one test, one branch. Saying what not to touch matters as much as saying what to do.',
    },
    {
      id: 'otto-push-rejected',
      kind: 'choose',
      situation: 'Dex pushed a test to Otto’s fix branch to help. Now Otto’s next push fails.',
      artifact: {
        kind: 'terminal',
        text: [
          'PS> git push',
          ' ! [rejected]        fix/refund-rounding -> fix/refund-rounding (fetch first)',
          "error: failed to push some refs to 'github.com/quillwork/quillwork-app.git'",
        ].join('\n'),
      },
      question: 'What’s going on?',
      options: [
        {
          id: 'protected',
          text: 'The fix branch is protected like main.',
          correct: false,
          feedback: 'Protection says “protected branch”. This says “fetch first”.',
        },
        {
          id: 'broken',
          text: 'Otto’s commits are broken.',
          correct: false,
          feedback: 'Git hasn’t looked at the code. It’s only comparing histories.',
        },
        {
          id: 'behind',
          text: 'GitHub has Dex’s commit and Otto doesn’t. Otto must bring it in, then push.',
          correct: true,
          feedback: 'Yes. Two people on one branch means syncing before each push.',
        },
      ],
      explanation:
        'A “fetch first” rejection means the remote moved. Integrate the new commits, check everything still passes, then push. Never force over a teammate’s help.',
    },
    {
      id: 'scope-creep',
      kind: 'choose',
      situation: 'Otto opens PR #89. The fix looks right, but the diff has a second file.',
      artifact: {
        kind: 'diff',
        label: 'PR #89 · .github/CODEOWNERS',
        text: [
          '@@ -1,3 +1,2 @@',
          '-/src/billing/   @priya',
          ' /docs/          @marco',
          ' *               @dex',
        ].join('\n'),
      },
      question: 'What do you do?',
      options: [
        {
          id: 'approve',
          text: 'Approve. It gets the fix merged faster tonight.',
          correct: false,
          feedback: 'It also quietly removes Priya’s review from every future billing change.',
        },
        {
          id: 'later',
          text: 'Approve now and restore the line tomorrow.',
          correct: false,
          feedback: 'Tomorrow it’s forgotten, and billing has no owner.',
        },
        {
          id: 'ignore',
          text: 'Ignore it. CODEOWNERS isn’t code.',
          correct: false,
          feedback: 'It controls who must approve. That makes it one of the most important files.',
        },
        {
          id: 'revert',
          text: 'Request changes: put Priya’s line back and keep the PR to the fix.',
          correct: true,
          feedback: 'Yes. An agent weakening a guard rail to get unblocked is a red flag.',
        },
      ],
      explanation:
        'Read every file in an agent’s diff, especially ones that control process: CODEOWNERS, CI config, protection. Removing a reviewer to get a merge through is a shortcut, not a fix.',
    },
    {
      id: 'flaky-or-real',
      kind: 'choose',
      situation:
        'CI on PR #89 fails in a search test that the fix never touched. Dex says “just merge it, that test is flaky”.',
      question: 'What do you do?',
      options: [
        {
          id: 'override',
          text: 'Merge with an admin override.',
          correct: false,
          feedback: 'If it isn’t flaky, you just shipped a second bug on release day.',
        },
        {
          id: 'check',
          text: 'Read the log. If it really is flaky, re-run once and open an issue to fix the test.',
          correct: true,
          feedback: 'Evidence first. Flaky tests get tracked, not ignored.',
        },
        {
          id: 'delete',
          text: 'Ask Otto to delete the failing test.',
          correct: false,
          feedback: 'That hides the signal forever, flaky or not.',
        },
      ],
      explanation:
        'Read a failure before calling it noise. A re-run is fine for a real flake, but write it down so someone fixes it. Never merge past red checks.',
    },
    {
      id: 'brief-the-conflict',
      kind: 'prompt',
      situation:
        'Priya approves, but GitHub now says PR #89 has conflicts with main: another fix landed first.',
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'ours',
          text: 'Resolve the conflicts by keeping our side everywhere.',
          correct: false,
          feedback: 'That throws away the fix that just landed on main.',
        },
        {
          id: 'new-pr',
          text: 'Close the PR and open a new one.',
          correct: false,
          feedback: 'The new PR would have the same conflict, and lose Priya’s approval history.',
        },
        {
          id: 'merge-main',
          text: 'Merge main into the fix branch. Show me each conflict and which lines you kept and why. Run the tests, then push.',
          correct: true,
          feedback: 'Main’s fix survives, you see every decision, and the tests prove it.',
        },
      ],
      explanation:
        'A conflict means two changes touched the same lines. Ask the agent to explain each resolution, because a silent “keep ours” can undo someone else’s fix.',
    },
    {
      id: 'hotfix-version',
      kind: 'choose',
      situation: 'The fix only corrects refund rounding. 3.0.0 went out at noon.',
      question: 'Which version ships the fix?',
      options: [
        {
          id: 'minor',
          text: '3.1.0',
          correct: false,
          feedback: 'Nothing new was added.',
        },
        {
          id: 'patch',
          text: '3.0.1',
          correct: true,
          feedback: 'A bug fix with nothing new: PATCH.',
        },
        {
          id: 'retag',
          text: '3.0.0 again, with the tag moved.',
          correct: false,
          feedback: 'Users already have 3.0.0. One name must never mean two releases.',
        },
      ],
      explanation:
        'Fixes bump PATCH. Users can take 3.0.1 without reading anything, because the number promises only the bug changed.',
    },
    {
      id: 'ship-it',
      kind: 'order',
      situation: 'PR #89 is approved, conflict-free and green. Marco is watching.',
      question: 'Put the rest in order.',
      steps: [
        { id: 'merge', text: 'Squash and merge PR #89' },
        { id: 'ci', text: 'Wait for CI on main to go green' },
        { id: 'tag', text: 'Tag the merged commit v3.0.1' },
        { id: 'notes', text: 'Publish 3.0.1 release notes' },
        { id: 'cleanup', text: 'Delete the fix branch' },
      ],
      explanation:
        'Merge, prove main is green, tag that exact commit, tell users, clean up. Doing it in the same order every time is what keeps 5pm calm.',
    },
  ],
} satisfies LessonInput;
