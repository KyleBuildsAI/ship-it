import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Act 4: GitHub Team Flow (DESIGN.md section 11), taught as lessons: how work travels
 * between laptops and GitHub, and how a team keeps main trustworthy with issues, pull
 * requests, reviews and releases.
 */

export const remotesAndPullRequests = {
  id: 'remotes-and-pull-requests',
  act: 4,
  title: 'Remotes and Pull Requests',
  briefing: [
    'Your laptop has a copy of the repo. GitHub has another. They only sync when you say so.',
    'On a team, changes reach main through pull requests: proposed, checked, reviewed, then merged.',
  ],
  cards: [
    {
      id: 'fetch-vs-pull',
      kind: 'choose',
      situation:
        'A teammate says they pushed a fix. You want to look at it before it touches your files.',
      question: 'Which command?',
      options: [
        {
          id: 'pull',
          text: 'git pull.',
          correct: false,
          feedback: 'Pull fetches and then merges into your branch, so it changes your files.',
        },
        {
          id: 'fetch',
          text: 'git fetch, then look at origin/main.',
          correct: true,
          feedback: 'Fetch downloads their commits without changing your branch.',
        },
        {
          id: 'clone',
          text: 'Clone the repo again.',
          correct: false,
          feedback: 'That makes a whole new copy. Fetch updates the one you have.',
        },
      ],
      explanation:
        'Fetch updates your view of the remote, origin/main. Pull is fetch plus merge. Fetch first when you want to look before you leap.',
    },
    {
      id: 'push-rejected',
      kind: 'choose',
      situation: 'Your push failed.',
      artifact: {
        kind: 'terminal',
        text: [
          'PS> git push',
          ' ! [rejected]        main -> main (fetch first)',
          "error: failed to push some refs to 'github.com/kyle/sandcastles'",
          'hint: Updates were rejected because the remote contains work',
          'hint: that you do not have locally.',
        ].join('\n'),
      },
      question: 'What do you do?',
      options: [
        {
          id: 'pull-first',
          text: 'Pull their work in, fix any conflicts, run the tests, then push.',
          correct: true,
          feedback: 'Yes: get their work, combine it with yours, then send it.',
        },
        {
          id: 'force',
          text: 'git push --force.',
          correct: false,
          feedback: 'That deletes your teammate’s commits from GitHub.',
        },
        {
          id: 'new-repo',
          text: 'Push to a new repository instead.',
          correct: false,
          feedback: 'That splits the team’s history in two.',
        },
      ],
      explanation:
        'A rejected push protects someone else’s work. Bring their commits in, check everything still works, then push. Force-pushing a shared branch erases what others pushed.',
    },
    {
      id: 'pr-lifecycle',
      kind: 'order',
      situation: 'Your agent finished a feature on a branch.',
      question: 'Put the pull request’s life in order.',
      steps: [
        { id: 'push', text: 'Push the branch to GitHub' },
        { id: 'open', text: 'Open a PR with a clear description' },
        { id: 'ci', text: 'CI runs the checks' },
        { id: 'review', text: 'A teammate reviews and approves' },
        { id: 'merge', text: 'Merge, then delete the branch' },
      ],
      explanation:
        'A PR is a proposal: push it, describe it, let CI check it, get a human review, then merge. Deleting the branch afterwards keeps the list tidy.',
    },
    {
      id: 'pr-description',
      kind: 'prompt',
      situation: 'Your agent is about to open the PR.',
      question: 'Which instruction gets a PR a reviewer can actually review?',
      options: [
        {
          id: 'short',
          text: 'Open a PR.',
          correct: false,
          feedback: 'You’ll get a title and nothing else for the reviewer to go on.',
        },
        {
          id: 'everything',
          text: 'Open a PR and paste every changed file into the description.',
          correct: false,
          feedback: 'The diff already shows the code. The description should explain it.',
        },
        {
          id: 'good',
          text: 'Open a PR with a Conventional Commit title. Say what changed and why, give step-by-step test instructions, and link the issue with “Closes #12”.',
          correct: true,
          feedback: 'The reviewer gets the purpose, the proof, and the issue it closes.',
        },
      ],
      explanation:
        'A PR description answers three things: what changed, why, and how to check it. “Closes #12” links the issue and closes it when the PR merges.',
    },
    {
      id: 'issue-first',
      kind: 'choose',
      situation:
        'Dex asks for dark mode in a chat message. You’re about to tell the agent to start.',
      question: 'What comes first?',
      options: [
        {
          id: 'code',
          text: 'Start coding. The chat message is enough.',
          correct: false,
          feedback: 'Chat scrolls away, and no PR can link to it.',
        },
        {
          id: 'issue',
          text: 'Create an issue with the goal and what “done” looks like.',
          correct: true,
          feedback: 'Yes: the issue is the record of why the work exists.',
        },
        {
          id: 'branch-name',
          text: 'Name a branch dark-mode and skip the issue.',
          correct: false,
          feedback: 'A branch name doesn’t say what “done” means.',
        },
      ],
      explanation:
        'An issue records the request, the reasoning and what counts as done. PRs link to it, so anyone can later trace why a change was made.',
    },
    {
      id: 'fork',
      kind: 'choose',
      situation:
        'You want to fix a typo in an open-source project, but you can’t push to its repo.',
      question: 'How does that work on GitHub?',
      options: [
        {
          id: 'fork',
          text: 'Fork it, push a branch to your fork, and open a PR to the original.',
          correct: true,
          feedback: 'Yes: a fork is your own copy on GitHub, and PRs can come from it.',
        },
        {
          id: 'ask-access',
          text: 'Ask the owners for write access first.',
          correct: false,
          feedback: 'Not needed: PRs from forks are how outsiders contribute.',
        },
        {
          id: 'email',
          text: 'Email them the fixed file.',
          correct: false,
          feedback: 'A fork and a PR give them a diff they can review and merge.',
        },
      ],
      explanation:
        'Forks let anyone propose a change without write access. The maintainers review the PR and decide whether to merge it.',
    },
  ],
} satisfies LessonInput;

export const reviewsAndReleases = {
  id: 'reviews-and-releases',
  act: 4,
  title: 'Reviews and Releases',
  briefing: [
    'Main is protected: nothing merges without passing checks and an approval.',
    'Reviewing well and releasing clearly are what let a team trust its main branch.',
  ],
  cards: [
    {
      id: 'review-comment',
      kind: 'choose',
      situation: 'You’re reviewing a teammate’s PR titled “tidy cart code”.',
      artifact: {
        kind: 'diff',
        label: 'PR #31 · src/cart.ts',
        text: [
          '@@ -8,5 +8,5 @@',
          ' export function total(items: Item[]) {',
          '-  return items.reduce((sum, item) => sum + item.price * item.qty, 0);',
          '+  return items.reduce((sum, item) => sum + item.price, 0);',
          ' }',
        ].join('\n'),
      },
      question: 'Which review comment is best?',
      options: [
        {
          id: 'harsh',
          text: 'This is wrong. Did you even test it?',
          correct: false,
          feedback: 'Right worry, but it attacks the person and doesn’t say what’s wrong.',
        },
        {
          id: 'lgtm',
          text: 'LGTM.',
          correct: false,
          feedback: 'Approving without reading lets a pricing bug into main.',
        },
        {
          id: 'specific',
          text: 'This drops item.qty, so three shirts cost the price of one. Intended? A test with qty 3 would catch it.',
          correct: true,
          feedback: 'Specific and kind: it names the impact and suggests the proof.',
        },
      ],
      explanation:
        'Good review comments point at the line, say the effect, and suggest a fix or a test. Review the code, never the person.',
    },
    {
      id: 'protected-branch',
      kind: 'choose',
      situation: 'A new teammate asks why GitHub won’t let them push straight to main.',
      question: 'What’s the reason?',
      options: [
        {
          id: 'bug',
          text: 'It’s a GitHub bug.',
          correct: false,
          feedback: 'It’s deliberate, and it protects everyone.',
        },
        {
          id: 'protect',
          text: 'Main is protected: changes need a PR, green checks and an approval.',
          correct: true,
          feedback: 'Yes, set in the repo’s branch protection rules.',
        },
        {
          id: 'admin',
          text: 'They need admin rights to push code.',
          correct: false,
          feedback: 'Even admins should go through PRs. The rule is about process.',
        },
      ],
      explanation:
        'Branch protection makes the PR the only door into main. Every change gets checks and a second pair of eyes, so main stays ready to deploy.',
    },
    {
      id: 'codeowners',
      kind: 'choose',
      situation: 'A PR changes src/payments/refund.ts.',
      artifact: {
        kind: 'file',
        label: '.github/CODEOWNERS',
        text: ['/src/payments/  @dana', '/docs/          @kyle'].join('\n'),
      },
      question: 'What does this file do here?',
      options: [
        {
          id: 'request',
          text: 'GitHub asks Dana to review, and can require her approval to merge.',
          correct: true,
          feedback: 'Right: owners are requested for the paths they own.',
        },
        {
          id: 'block',
          text: 'It stops anyone but Dana editing payments code.',
          correct: false,
          feedback: 'Anyone can propose a change. CODEOWNERS decides who reviews it.',
        },
        {
          id: 'nothing',
          text: 'Nothing. It’s documentation.',
          correct: false,
          feedback: 'GitHub reads it and requests reviewers from it.',
        },
      ],
      explanation:
        'CODEOWNERS maps paths to reviewers. With branch protection, a payments change can’t merge without the payments owner’s approval.',
    },
    {
      id: 'semver',
      kind: 'choose',
      situation:
        'This release removes an old API endpoint that some apps still call. The current version is 2.7.3.',
      question: 'What’s the next version?',
      options: [
        {
          id: 'minor',
          text: '2.8.0',
          correct: false,
          feedback: 'Minor is for new features that break nothing.',
        },
        {
          id: 'patch',
          text: '2.7.4',
          correct: false,
          feedback: 'Patch is for bug fixes only.',
        },
        {
          id: 'major',
          text: '3.0.0',
          correct: true,
          feedback: 'Removing something people use is a breaking change: major.',
        },
      ],
      explanation:
        'Semantic versioning: MAJOR for breaking changes, MINOR for new features that keep working code working, PATCH for fixes. The number tells users whether upgrading is safe.',
    },
    {
      id: 'changelog',
      kind: 'prompt',
      situation: 'You want the agent to write the changelog for 3.0.0.',
      question: 'Which instruction gets a useful changelog?',
      options: [
        {
          id: 'dump',
          text: 'Paste the git log into CHANGELOG.md.',
          correct: false,
          feedback: 'Commit messages are for developers, and “fix typo” tells users nothing.',
        },
        {
          id: 'good',
          text: 'Write the 3.0.0 entry from the merged PRs. Group it as Breaking, Added and Fixed, explain each in a user’s words, and give upgrade steps for the breaking change.',
          correct: true,
          feedback: 'Grouped, written for users, and the breaking change says what to do.',
        },
        {
          id: 'vague',
          text: 'Write “Bug fixes and improvements”.',
          correct: false,
          feedback: 'Users can’t tell whether they need to change anything.',
        },
      ],
      explanation:
        'A changelog is for the people upgrading. Breaking changes come first, with migration steps, then what’s new and what’s fixed.',
    },
    {
      id: 'release',
      kind: 'order',
      situation: 'Version 3.0.0 is merged to main.',
      question: 'Put the release steps in order.',
      steps: [
        { id: 'ci', text: 'Confirm main’s CI is green' },
        { id: 'changelog', text: 'Merge the CHANGELOG.md update through a PR' },
        { id: 'tag', text: 'Tag the release commit v3.0.0' },
        { id: 'release', text: 'Publish a GitHub release from the tag' },
        { id: 'announce', text: 'Tell users about the breaking change' },
      ],
      explanation:
        'Release from a green main, with the changelog merged first. The tag pins the exact commit, and the GitHub release gives users notes and downloads.',
    },
  ],
} satisfies LessonInput;

export const rejectedPush = {
  id: 'rejected-push',
  act: 4,
  title: 'Rejected Push',
  kind: 'final',
  timeLimitSeconds: 300,
  xp: 150,
  briefing: [
    '5pm on release day. Your push was rejected, and the team is waiting on you.',
    'Five minutes on one clock for every card. The right move is rarely the fastest-looking one.',
  ],
  cards: [
    {
      id: 'protected-reject',
      kind: 'choose',
      situation: 'You pushed the release fix straight to main.',
      artifact: {
        kind: 'terminal',
        text: [
          'PS> git push origin main',
          'remote: error: GH006: Protected branch update failed for refs/heads/main.',
          'remote: error: Changes must be made through a pull request.',
          ' ! [remote rejected] main -> main (protected branch hook declined)',
        ].join('\n'),
      },
      question: 'What now?',
      options: [
        {
          id: 'pr',
          text: 'Push to a branch, open a PR, and ask for a quick review.',
          correct: true,
          feedback: 'Yes: the protection is the process, even at 5pm.',
        },
        {
          id: 'disable',
          text: 'Turn off branch protection for a minute.',
          correct: false,
          feedback: 'That’s how broken code reaches production at 5pm.',
        },
        {
          id: 'force',
          text: 'Push again with --force.',
          correct: false,
          feedback: 'Force doesn’t get past protection, and shouldn’t.',
        },
      ],
      explanation:
        'Protection rules hold under pressure, which is exactly when they matter. A small PR with a clear description gets reviewed fast.',
    },
    {
      id: 'flaky-merge',
      kind: 'choose',
      situation:
        'Your PR’s CI fails on a test unrelated to your change. A reviewer says “just merge it, it’s flaky”.',
      question: 'What do you do?',
      options: [
        {
          id: 'override',
          text: 'Merge with an admin override.',
          correct: false,
          feedback: 'If it isn’t flaky, you just shipped a bug on release day.',
        },
        {
          id: 'delete-test',
          text: 'Delete the failing test.',
          correct: false,
          feedback: 'That hides the signal forever.',
        },
        {
          id: 'check',
          text: 'Read the log. If it really is flaky, re-run once and file an issue for the test.',
          correct: true,
          feedback: 'Evidence first. Flaky tests get tracked, not ignored.',
        },
      ],
      explanation:
        'Read a failure before calling it noise. A re-run is fine for a real flake, but write it down so someone fixes it.',
    },
    {
      id: 'agent-hotfix',
      kind: 'prompt',
      situation:
        'The review found a bug: refunds round down. You want the agent to fix it quickly but safely.',
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
          text: 'On this PR’s branch, make refunds round to the nearest cent. Add a test for 10.005. Change nothing else. Tell me when CI is green.',
          correct: true,
          feedback: 'One fix, one test, and a clear finish line.',
        },
        {
          id: 'main',
          text: 'Fix it directly on main to save time.',
          correct: false,
          feedback: 'Main is protected, and skipping review is the risk you’re avoiding.',
        },
      ],
      explanation:
        'Under time pressure, narrow the scope: one fix, one test, one branch. Tell the agent what not to touch.',
    },
    {
      id: 'pr-conflict',
      kind: 'choose',
      situation: 'GitHub says your PR has conflicts with main.',
      question: 'What’s the fix?',
      options: [
        {
          id: 'update',
          text: 'Merge main into your branch locally, resolve, test, and push.',
          correct: true,
          feedback: 'Yes: bring main in, settle it, prove it, push.',
        },
        {
          id: 'close',
          text: 'Close the PR and open a new one.',
          correct: false,
          feedback: 'The new one would have the same conflict.',
        },
        {
          id: 'keep-mine',
          text: 'Resolve on GitHub by keeping all of your lines.',
          correct: false,
          feedback: 'Keeping only yours throws away what landed on main.',
        },
      ],
      explanation:
        'A PR conflict means main moved. Update your branch from main, resolve deliberately, re-run the tests and push. The PR updates itself.',
    },
    {
      id: 'patch-version',
      kind: 'choose',
      situation: 'The fix only corrects refund rounding. Version 3.0.0 went out an hour ago.',
      question: 'Which version ships the fix?',
      options: [
        {
          id: 'minor',
          text: '3.1.0',
          correct: false,
          feedback: 'Nothing new was added.',
        },
        {
          id: 'major',
          text: '4.0.0',
          correct: false,
          feedback: 'Nothing breaks for users.',
        },
        {
          id: 'patch',
          text: '3.0.1',
          correct: true,
          feedback: 'A bug fix with nothing new: patch.',
        },
      ],
      explanation:
        'Fixes bump PATCH. Users can take 3.0.1 without reading anything, because the number promises that only the bug changed.',
    },
    {
      id: 'finish',
      kind: 'order',
      situation: 'The fix is approved and CI is green.',
      question: 'Put the rest in order.',
      steps: [
        { id: 'merge', text: 'Squash and merge the PR' },
        { id: 'pull', text: 'Pull main locally' },
        { id: 'tag', text: 'Tag v3.0.1' },
        { id: 'notes', text: 'Publish the release notes' },
        { id: 'delete', text: 'Delete the fix branch' },
      ],
      explanation:
        'Merge, sync, tag the exact commit, tell users, clean up. The same order every release keeps 5pm calm.',
    },
  ],
} satisfies LessonInput;

/** Act 4's lessons in play order, final last. */
export const act4Lessons: readonly LessonInput[] = [
  remotesAndPullRequests,
  reviewsAndReleases,
  rejectedPush,
];
