import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Lesson 3.4: the tools for days that don't go to plan. Cherry-pick carries one fix
 * across, stash shelves half-done work, tags name a release, and bisect finds the commit
 * that broke something. Otto runs them; Kyle decides when, and asks for evidence.
 */
export const toolsForBadDays = {
  id: 'tools-for-bad-days',
  act: 3,
  title: 'Tools for Bad Days',
  briefing: [
    'Today a fix is stuck on an unfinished branch, a release needs a name, and something got slow.',
    'Four tools help: cherry-pick, stash, tags and bisect. Otto can run them all. You decide when.',
  ],
  cards: [
    {
      id: 'stuck-fix',
      kind: 'choose',
      situation:
        'Customers hit a crash on empty searches. feat/search isn’t ready to ship, but one of its commits fixes the crash.',
      artifact: {
        kind: 'log',
        label: 'git log --oneline feat/search',
        text: [
          'f41ab20 (feat/search) restyle search results',
          'c7d9e13 fix crash on empty search query',
          '9a20b6f add search page',
          'e8a1c44 (main) fix login redirect',
        ].join('\n'),
      },
      question: 'How do you get just the fix to main?',
      options: [
        {
          id: 'merge-all',
          text: 'Merge feat/search into main now.',
          correct: false,
          feedback: 'That ships the unfinished search page and the restyle too.',
        },
        {
          id: 'cherry',
          text: 'Cherry-pick c7d9e13 onto a fix branch made from main, then open a PR.',
          correct: true,
          feedback: 'Yes: cherry-pick copies one commit’s change onto another branch.',
        },
        {
          id: 'copy-folder',
          text: 'Copy the fixed search files onto main by hand and commit them with a message about the crash.',
          correct: false,
          feedback:
            'Those files also carry the unfinished page’s changes, and the copy loses the original commit.',
        },
      ],
      explanation:
        'Cherry-pick applies one commit’s change to your current branch as a new commit. Use it to carry a single fix across, then review it like any change.',
    },
    {
      id: 'brief-the-pick',
      kind: 'prompt',
      situation: 'You hand that cherry-pick to Otto.',
      question: 'Which instruction gets it done safely?',
      options: [
        {
          id: 'vague',
          text: 'Cherry-pick the search fix onto main.',
          correct: false,
          feedback: 'Which commit? And straight onto main skips the PR and its checks.',
        },
        {
          id: 'all-but-one',
          text: 'Cherry-pick every commit from feat/search except the restyle.',
          correct: false,
          feedback: 'That brings the unfinished search page too. You only want the fix.',
        },
        {
          id: 'straight-to-main',
          text: 'From the latest main, create fix/empty-search. Cherry-pick c7d9e13 only and run the tests. Since customers are crashing, push it straight to main.',
          correct: false,
          feedback:
            'Right commit, wrong road. Urgent fixes still go through a PR and CI, or they cause the next incident.',
        },
        {
          id: 'exact',
          text: 'From the latest main, create fix/empty-search. Cherry-pick c7d9e13 only, run the tests, and open a PR. Don’t merge or change feat/search.',
          correct: true,
          feedback: 'The exact commit, where it goes, the proof, and what to leave alone.',
        },
      ],
      explanation:
        'Name the exact commit and the boundary. A fix that skips its PR skips review and CI, which is how quick fixes cause second incidents.',
    },
    {
      id: 'what-stash-did',
      kind: 'choose',
      situation: 'Otto is mid-change on feat/sharing when Priya needs him on main. He stashes.',
      artifact: {
        kind: 'terminal',
        label: 'PowerShell',
        text: [
          'PS> git stash push -m "sharing: half-done invite dialog"',
          'Saved working directory and index state On feat/sharing: sharing: half-done invite dialog',
          'PS> git stash list',
          'stash@{0}: On feat/sharing: sharing: half-done invite dialog',
          'stash@{1}: WIP on main: 3be11f0 add document sharing',
        ].join('\n'),
      },
      question: 'What did the stash do?',
      options: [
        {
          id: 'committed',
          text: 'Committed the edits to feat/sharing.',
          correct: false,
          feedback: 'No commit was made. A stash sits on a shelf outside every branch.',
        },
        {
          id: 'deleted',
          text: 'Deleted the edits.',
          correct: false,
          feedback: 'They’re safe in stash@{0}, and git stash pop brings them back.',
        },
        {
          id: 'shelved',
          text: 'Shelved the uncommitted edits, leaving the folder clean so he can switch.',
          correct: true,
          feedback: 'Right. The message says exactly what’s on the shelf.',
        },
        {
          id: 'pushed',
          text: 'Pushed the edits to GitHub for safekeeping.',
          correct: false,
          feedback: 'Stashes stay on this machine. If the laptop dies, they’re gone.',
        },
      ],
      explanation:
        'A stash is a shelf for uncommitted work. A message makes it findable; stash@{1} shows how unlabelled ones pile up. Pop it when you come back.',
    },
    {
      id: 'brief-the-hotfix',
      kind: 'prompt',
      situation: 'Otto is mid-change when production needs an urgent fix on main.',
      question: 'Which instruction keeps both pieces of work safe?',
      options: [
        {
          id: 'stash-switch',
          text: 'Stash your changes with a clear message. Switch to main, pull, branch hotfix/crash, fix it and open a PR. Then switch back and pop the stash.',
          correct: true,
          feedback: 'Nothing is lost, and the fix starts clean from the latest main.',
        },
        {
          id: 'wip-main',
          text: 'Commit your half-done work to your branch as WIP so it’s safe. Then switch to main, pull, fix the crash right there, and push main.',
          correct: false,
          feedback:
            'The work is safe, but the fix skips its own branch and PR: no review and no checks, on production.',
        },
        {
          id: 'same-branch',
          text: 'Fix the crash on your current branch too.',
          correct: false,
          feedback: 'The fix gets stuck behind unfinished work and can’t ship alone.',
        },
      ],
      explanation:
        'Shelve, switch, start from the latest main, ship the fix on its own branch, then come back. A message on the stash means you find the right one later.',
    },
    {
      id: 'name-the-release',
      kind: 'choose',
      situation:
        'Version 2.4 of the Quillwork editor is merged and deployed. For years, support will ask what was in 2.4.',
      question: 'What do you add?',
      options: [
        {
          id: 'branch',
          text: 'A branch called release-2.4 that nobody commits to, protected on GitHub so it can’t change.',
          correct: false,
          feedback:
            'Branches are made to move, and protection rules get changed. A tag is built to stay put.',
        },
        {
          id: 'readme',
          text: 'A note in the README.',
          correct: false,
          feedback: 'Notes drift and don’t point at code. A tag points at the exact commit.',
        },
        {
          id: 'commit',
          text: 'An empty commit with the message “v2.4”.',
          correct: false,
          feedback: 'The next commit buries it. A tag stays attached to one commit.',
        },
        {
          id: 'tag',
          text: 'A tag, v2.4.0, on the release commit, pushed to GitHub.',
          correct: true,
          feedback: 'Yes: a permanent name for one exact commit.',
        },
      ],
      explanation:
        'Tags mark releases. Unlike branches, they never move when new commits arrive, so v2.4.0 always means the same code. Tags aren’t pushed by default, so push them on purpose.',
    },
    {
      id: 'find-the-slowdown',
      kind: 'choose',
      situation:
        'Since v2.4.0, exporting a long document takes 30 seconds instead of 2. 180 commits have landed since.',
      question: 'What’s the fastest way to find the culprit?',
      options: [
        {
          id: 'read',
          text: 'Read the diffs of all 180 commits, starting with the ones that touched files in the export folder.',
          correct: false,
          feedback:
            'Hours of reading, and slowness often comes from code outside the export folder.',
        },
        {
          id: 'bisect',
          text: 'git bisect: mark v2.4.0 good and main bad, then test the middle until it names the commit.',
          correct: true,
          feedback: 'About 8 tests for 180 commits: each one halves the suspects.',
        },
        {
          id: 'revert',
          text: 'Revert all 180 commits.',
          correct: false,
          feedback: 'That undoes weeks of good work to remove one bad change.',
        },
      ],
      explanation:
        'Bisect is a binary search through history. Each test halves the suspects, so 180 commits take about 8 tests instead of 180.',
    },
    {
      id: 'bisect-steps',
      kind: 'order',
      situation: 'You’re bisecting the slow export by hand.',
      question: 'Put the steps in order.',
      steps: [
        { id: 'start', text: 'Run git bisect start' },
        { id: 'mark-ends', text: 'Mark main bad and v2.4.0 good' },
        { id: 'try', text: 'Time the export on the commit git checks out' },
        { id: 'judge', text: 'Mark it good or bad, and repeat' },
        { id: 'reset', text: 'Note the first bad commit, then git bisect reset' },
      ],
      explanation:
        'Start, give bisect a known good and a known bad, then judge each commit it hands you. When it names the culprit, reset to return to where you were.',
    },
    {
      id: 'brief-the-bisect',
      kind: 'prompt',
      situation:
        'Otto wrote npm run perf:export yesterday: a script that fails when export is slow. He can drive bisect with it.',
      question: 'Which instruction do you give Otto?',
      options: [
        {
          id: 'fix-it',
          text: 'Find what made export slow and fix it.',
          correct: false,
          feedback: 'Too open. Otto may guess at a cause and “fix” something that wasn’t broken.',
        },
        {
          id: 'missing-script',
          text: 'Run git bisect with v2.4.0 good and main bad, using git bisect run npm run perf:export. Report the first bad commit and its diff. Change no code yet.',
          correct: false,
          feedback:
            'Older commits don’t have yesterday’s script, so each one fails, gets marked bad, and bisect names the wrong commit.',
        },
        {
          id: 'evidence',
          text: 'Copy the perf script outside the repo, since older commits lack it. Bisect with v2.4.0 good and main bad, running that copy at each step. Report the first bad commit and its diff. Change no code.',
          correct: true,
          feedback:
            'A test that exists at every commit, a clear search, and evidence before any fix.',
        },
        {
          id: 'one-by-one',
          text: 'Revert commits one at a time until export is fast again.',
          correct: false,
          feedback: 'Slow, and every revert is a new commit someone has to undo.',
        },
        {
          id: 'revert-on-main',
          text: 'Bisect it, then revert the culprit straight on main.',
          correct: false,
          feedback: 'Reverting on main skips review. Find it first, then decide the fix together.',
        },
      ],
      explanation:
        'Bisect checks out old commits, so the test must work at every one of them. Give the agent both ends and that test, and ask for evidence, not a fix.',
    },
  ],
} satisfies LessonInput;
