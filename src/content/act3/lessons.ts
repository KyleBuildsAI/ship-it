import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Act 3: Branching (DESIGN.md section 11), taught as lessons: Kyle decides what should
 * happen to branches and tells his agent, rather than typing every git command himself.
 */

export const branchesArePointers = {
  id: 'branches-are-pointers',
  act: 3,
  title: 'Branches Are Pointers',
  briefing: [
    'Dex wants a new login page without breaking main. Your agent will build it on a branch.',
    'A branch is just a name pointing at a commit. Cheap to make, cheap to throw away.',
  ],
  cards: [
    {
      id: 'what-a-branch-is',
      kind: 'choose',
      situation:
        'Your agent says: “Creating a branch copies the whole project, so I’ll avoid making too many.”',
      question: 'Is the agent right?',
      options: [
        {
          id: 'copy',
          text: 'Yes. Each branch is a full copy, so keep them few.',
          correct: false,
          feedback:
            'Git copies no files for a branch. It writes one tiny file holding a commit id.',
        },
        {
          id: 'pointer',
          text: 'No. A branch is a name pointing at one commit, so making one is nearly free.',
          correct: true,
          feedback: 'Right. That’s why teams make a branch for every change.',
        },
        {
          id: 'folder',
          text: 'No. A branch is a separate folder on disk.',
          correct: false,
          feedback: 'Branches share one folder. Switching changes the files in place.',
        },
      ],
      explanation:
        'A branch is a label on a commit. New commits move the label forward. Make one per change, and delete it once it’s merged.',
    },
    {
      id: 'start-the-work',
      kind: 'prompt',
      situation: 'You want the agent to build the login page safely, away from main.',
      question: 'Which instruction do you give?',
      options: [
        {
          id: 'just-do',
          text: 'Build the login page.',
          correct: false,
          feedback: 'It may commit straight onto main, where everyone’s work lands.',
        },
        {
          id: 'branch',
          text: 'Create a branch called feat/login from an up-to-date main, build the page there, and commit in small steps. Don’t touch main.',
          correct: true,
          feedback: 'It names the branch, where it starts, and the boundary: main stays untouched.',
        },
        {
          id: 'copy-folder',
          text: 'Copy the project into a new folder and build it there.',
          correct: false,
          feedback:
            'That loses history and makes merging back a manual mess. Branches exist for this.',
        },
      ],
      explanation:
        'Tell the agent where the work happens. “From an up-to-date main” means it starts from the latest code, and main only changes through a reviewed merge.',
    },
    {
      id: 'fast-forward',
      kind: 'choose',
      situation: 'Main hasn’t moved since feat/login branched off. You merge feat/login into main.',
      artifact: {
        kind: 'log',
        label: 'git log --graph',
        text: [
          '* c3 (feat/login) add login form',
          '* c2 add login route',
          '* c1 (main) initial page',
        ].join('\n'),
      },
      question: 'What does git do?',
      options: [
        {
          id: 'ff',
          text: 'Slides main forward to c3. No new commit is needed.',
          correct: true,
          feedback: 'Yes: a fast-forward. Main’s history already leads to c3.',
        },
        {
          id: 'merge-commit',
          text: 'Always makes a merge commit joining the two.',
          correct: false,
          feedback: 'Only when both sides have new commits. Here only one side moved.',
        },
        {
          id: 'conflict',
          text: 'Stops with a conflict.',
          correct: false,
          feedback: 'Conflicts need changes on both sides. Main has none.',
        },
      ],
      explanation:
        'When main hasn’t moved, merging just moves the main label forward. That’s a fast-forward: no new commit, and a straight-line history.',
    },
    {
      id: 'three-way',
      kind: 'choose',
      situation:
        'This time a teammate merged a fix into main while your agent worked on feat/login. Both now have new commits.',
      question: 'What happens when you merge feat/login into main?',
      options: [
        {
          id: 'three-way',
          text: 'Git combines both sides from their common ancestor and makes a merge commit.',
          correct: true,
          feedback: 'Right: a three-way merge uses the two tips plus the commit they share.',
        },
        {
          id: 'overwrite',
          text: 'Your branch overwrites the teammate’s fix.',
          correct: false,
          feedback: 'Merges combine work. Nothing is overwritten unless someone chooses it.',
        },
        {
          id: 'ff',
          text: 'Main fast-forwards to your branch.',
          correct: false,
          feedback:
            'It can’t: main has a commit your branch lacks, and moving the label would lose it.',
        },
      ],
      explanation:
        'When both sides moved, git compares each to their common ancestor, keeps both sets of changes, and records a merge commit with two parents.',
    },
    {
      id: 'switch-safely',
      kind: 'order',
      situation:
        'You’re on feat/login with unfinished edits. A bug report needs a quick fix on main.',
      question: 'Put the safe steps in order.',
      steps: [
        { id: 'stash', text: 'Stash or commit the unfinished edits' },
        { id: 'switch-main', text: 'Switch to main' },
        { id: 'pull', text: 'Pull the latest main' },
        { id: 'fix-branch', text: 'Create a fix branch from main' },
        { id: 'back', text: 'Later, switch back and restore the edits' },
      ],
      explanation:
        'Leave nothing loose before switching. Start every fix from the latest main, on its own branch, then come back to your work.',
    },
    {
      id: 'delete-merged',
      kind: 'choose',
      situation: 'feat/login was merged into main yesterday. The agent asks whether to delete it.',
      question: 'What do you say?',
      options: [
        {
          id: 'delete',
          text: 'Delete it. Its commits are safe in main’s history.',
          correct: true,
          feedback: 'Yes: deleting a merged branch removes only the label.',
        },
        {
          id: 'keep',
          text: 'Keep it forever as a backup.',
          correct: false,
          feedback: 'Merged branches just clutter the list. Main already holds every commit.',
        },
        {
          id: 'never',
          text: 'Never delete branches: it deletes their commits.',
          correct: false,
          feedback: 'Deleting a label doesn’t delete commits that main can still reach.',
        },
      ],
      explanation:
        'Once merged, a branch’s commits are part of main. Deleting the branch removes a name, not work, and git branch -d refuses to delete an unmerged one.',
    },
  ],
} satisfies LessonInput;

export const conflictsWithoutPanic = {
  id: 'conflicts-without-panic',
  act: 3,
  title: 'Conflicts Without Panic',
  briefing: [
    'Two people changed the same lines. Git can’t guess which is right, so it stops and asks.',
    'A conflict isn’t an error. It’s a question only someone who knows the code can answer.',
  ],
  cards: [
    {
      id: 'read-markers',
      kind: 'choose',
      situation: 'Merging feat/slow-network into main stopped with this file.',
      artifact: {
        kind: 'file',
        label: 'src/config.ts',
        text: [
          'export const config = {',
          '<<<<<<< HEAD',
          '  timeoutSeconds: 30,',
          '=======',
          '  timeoutSeconds: 60,',
          '>>>>>>> feat/slow-network',
          '};',
        ].join('\n'),
      },
      question: 'What do the markers mean?',
      options: [
        {
          id: 'sides',
          text: 'Above ======= is the branch you’re on (HEAD). Below is the branch being merged in.',
          correct: true,
          feedback: 'Right. HEAD is where you are; the other side is named at the bottom.',
        },
        {
          id: 'old-new',
          text: 'Above is the old code, below is the new code.',
          correct: false,
          feedback: 'Both sides are new. Each branch changed the same line differently.',
        },
        {
          id: 'broken',
          text: 'The file is corrupted. Restore it.',
          correct: false,
          feedback: 'It isn’t broken. Git wrote both versions so you can choose.',
        },
      ],
      explanation:
        'Between <<<<<<< and ======= is your side; between ======= and >>>>>>> is theirs. Resolve by editing to the right result and deleting all three markers.',
    },
    {
      id: 'resolve-right',
      kind: 'choose',
      situation:
        'Main set 30 seconds on purpose: a test proves slow requests fail fast. The branch wants 60 for slow networks.',
      question: 'How should this conflict be resolved?',
      options: [
        {
          id: 'theirs',
          text: 'Always take the incoming side. It’s newer.',
          correct: false,
          feedback: 'Newer isn’t the same as right. Both changes had a reason.',
        },
        {
          id: 'understand',
          text: 'Find out why each side changed, then choose or combine, and run the tests.',
          correct: true,
          feedback:
            'Yes. A resolution is a decision about behaviour, so check the reasons and prove it.',
        },
        {
          id: 'both',
          text: 'Keep both lines. The second one wins anyway.',
          correct: false,
          feedback: 'A duplicate key hides one value and confuses the next reader.',
        },
      ],
      explanation:
        'Resolving a conflict means deciding what the code should do. Understand both intents, write the result, and run the tests before committing.',
    },
    {
      id: 'agent-resolves',
      kind: 'prompt',
      situation: 'Your agent hit 14 conflicts while merging main into its branch.',
      question: 'Which instruction do you give?',
      options: [
        {
          id: 'ours',
          text: 'Resolve them all by keeping your side.',
          correct: false,
          feedback: 'That silently throws away 14 changes your teammates made.',
        },
        {
          id: 'explain',
          text: 'For each conflict, show both sides and what each was for. Resolve only the clear ones, list the rest for me, then run the tests.',
          correct: true,
          feedback: 'It keeps you in charge of the hard calls and asks for proof.',
        },
        {
          id: 'restart',
          text: 'Delete your branch and start over from main.',
          correct: false,
          feedback: 'Losing all that work costs far more than reading the conflicts.',
        },
      ],
      explanation:
        'Agents resolve conflicts fast but can’t know intent. Ask what each side was for, keep the judgment calls for yourself, and require a green test run.',
    },
    {
      id: 'conflict-steps',
      kind: 'order',
      situation: 'A merge stopped with conflicts in two files.',
      question: 'Put the steps in order.',
      steps: [
        { id: 'status', text: 'Run git status to see the conflicted files' },
        { id: 'edit', text: 'Edit each file to the right result, markers removed' },
        { id: 'test', text: 'Run the tests' },
        { id: 'add', text: 'git add the resolved files' },
        { id: 'commit', text: 'Commit to finish the merge' },
      ],
      explanation:
        'Status lists what’s conflicted. Edit, prove it works, then stage. The commit completes the merge.',
    },
    {
      id: 'abort',
      kind: 'choose',
      situation: 'Halfway through resolving, you realise you merged the wrong branch.',
      question: 'What’s the clean way out?',
      options: [
        {
          id: 'abort',
          text: 'git merge --abort, which puts everything back as it was before the merge.',
          correct: true,
          feedback: 'Yes: it’s the undo button for a merge in progress.',
        },
        {
          id: 'delete-files',
          text: 'Delete the conflicted files.',
          correct: false,
          feedback: 'That deletes files from the project, and the merge is still in progress.',
        },
        {
          id: 'commit-anyway',
          text: 'Commit what you have and fix it later.',
          correct: false,
          feedback: 'That records a wrong merge, markers and all, in history.',
        },
      ],
      explanation:
        'A merge in progress can always be abandoned with git merge --abort. Nothing is recorded until you commit.',
    },
    {
      id: 'prevent',
      kind: 'choose',
      situation: 'Your team gets painful conflicts every week from long-lived branches.',
      question: 'What reduces them most?',
      options: [
        {
          id: 'small',
          text: 'Small branches that merge within a day or two, and pulling main often.',
          correct: true,
          feedback: 'Yes: less time apart means fewer overlapping edits.',
        },
        {
          id: 'lock',
          text: 'One person edits each file, forever.',
          correct: false,
          feedback: 'It blocks the team and doesn’t scale.',
        },
        {
          id: 'big',
          text: 'Bigger branches, merged once a month.',
          correct: false,
          feedback: 'The longer branches live apart, the more they collide.',
        },
      ],
      explanation:
        'Conflicts grow with time apart. Keep branches short-lived, bring main into them often, and split big work into small PRs.',
    },
  ],
} satisfies LessonInput;

export const conflictStorm = {
  id: 'conflict-storm',
  act: 3,
  title: 'Conflict Storm',
  kind: 'final',
  timeLimitSeconds: 300,
  xp: 150,
  briefing: [
    'Release day. Three branches must land on main, and they collide.',
    'Five minutes on one clock for every card. A wrong first answer costs stars, not time.',
  ],
  cards: [
    {
      id: 'rebase-or-merge',
      kind: 'choose',
      situation:
        'Your agent’s branch is behind main. You want a straight history before its PR merges, and nobody else uses the branch.',
      question: 'What fits?',
      options: [
        {
          id: 'rebase',
          text: 'Rebase the branch onto main, then push with --force-with-lease.',
          correct: true,
          feedback:
            'Yes. Rebase replays your commits on top, and it’s safe because the branch is yours.',
        },
        {
          id: 'rebase-main',
          text: 'Rebase main onto your branch.',
          correct: false,
          feedback: 'Never rewrite main. Everyone’s history depends on it.',
        },
        {
          id: 'reset',
          text: 'Reset the branch to main and redo the work.',
          correct: false,
          feedback: 'That throws the work away.',
        },
      ],
      explanation:
        'Rebase rewrites a branch’s commits onto a new base: fine for your own branch, never for shared ones like main. Merge keeps history exactly as it happened.',
    },
    {
      id: 'shared-rebase',
      kind: 'choose',
      situation:
        'A teammate rebased the shared release branch and force-pushed. Now everyone’s pulls fail.',
      question: 'Which rule was broken?',
      options: [
        {
          id: 'rewrite',
          text: 'Don’t rewrite history that others have already pulled.',
          correct: true,
          feedback: 'Right. Rebasing a shared branch changes commit ids under everyone.',
        },
        {
          id: 'pull',
          text: 'Others should never pull.',
          correct: false,
          feedback: 'Pulling is normal. Rewriting shared history is the problem.',
        },
        {
          id: 'never-rebase',
          text: 'Rebase should never be used.',
          correct: false,
          feedback: 'Rebase is great on your own branch. It only hurts on shared ones.',
        },
      ],
      explanation:
        'Rebased commits are new commits with new ids, so anyone holding the old ones now has a diverged copy. Rebase private branches; merge shared ones.',
    },
    {
      id: 'cherry-pick',
      kind: 'choose',
      situation:
        'Production crashes on empty searches. feat/search isn’t ready, but its commit f3 fixes the crash.',
      artifact: {
        kind: 'log',
        label: 'git log --oneline',
        text: [
          'f4 (feat/search) tweak search colours',
          'f3 fix crash on empty query',
          'f2 new search page',
          'm1 (main) release 2.3',
        ].join('\n'),
      },
      question: 'How do you get just the fix onto main?',
      options: [
        {
          id: 'cherry',
          text: 'Cherry-pick f3 onto a fix branch made from main, and open a PR.',
          correct: true,
          feedback: 'Yes: cherry-pick copies one commit’s change onto another branch.',
        },
        {
          id: 'merge-all',
          text: 'Merge feat/search into main now.',
          correct: false,
          feedback: 'That ships the unfinished search page too.',
        },
        {
          id: 'retype',
          text: 'Retype the fix by hand on main.',
          correct: false,
          feedback: 'Possible, but cherry-pick does it exactly and keeps the message.',
        },
      ],
      explanation:
        'Cherry-pick applies one commit’s change to your current branch as a new commit. Use it to carry a single fix across, then review it like any change.',
    },
    {
      id: 'bisect',
      kind: 'choose',
      situation: 'Search got slow somewhere in the last 200 commits. Nobody knows which one.',
      question: 'What’s the fastest way to find it?',
      options: [
        {
          id: 'bisect',
          text: 'git bisect: mark one good and one bad commit, and test the middle until it’s found.',
          correct: true,
          feedback: 'About 8 tests for 200 commits: it halves the range every time.',
        },
        {
          id: 'read-all',
          text: 'Read all 200 diffs.',
          correct: false,
          feedback: 'Hours of reading, and slowness is hard to spot by eye.',
        },
        {
          id: 'revert-all',
          text: 'Revert the last 200 commits.',
          correct: false,
          feedback: 'That undoes weeks of good work to remove one bad change.',
        },
      ],
      explanation:
        'Bisect is a binary search through history. Given a good and a bad commit, it checks out the middle until it names the first bad one. An agent can drive it with a test.',
    },
    {
      id: 'stash-agent',
      kind: 'prompt',
      situation: 'The agent is mid-change when main needs an urgent hotfix.',
      question: 'Which instruction keeps both pieces of work safe?',
      options: [
        {
          id: 'stash',
          text: 'Stash your changes with a message, switch to main, branch hotfix/crash, fix and commit it, then come back and pop the stash.',
          correct: true,
          feedback: 'Nothing is lost, and the hotfix starts clean from main.',
        },
        {
          id: 'drop',
          text: 'Throw away what you’re doing and fix main.',
          correct: false,
          feedback: 'It wastes the work in progress for no reason.',
        },
        {
          id: 'same-branch',
          text: 'Fix the crash on your current branch too.',
          correct: false,
          feedback: 'The fix would be stuck behind unfinished work.',
        },
      ],
      explanation:
        'Stash shelves uncommitted changes so you can switch cleanly. A message makes the stash easy to find again. Pop it when you’re back.',
    },
    {
      id: 'tag',
      kind: 'choose',
      situation: 'Version 2.4 is merged and deployed. For years, support will ask what was in 2.4.',
      question: 'What do you add?',
      options: [
        {
          id: 'tag',
          text: 'A tag, v2.4.0, on the release commit.',
          correct: true,
          feedback: 'Yes: a tag is a permanent name for one commit.',
        },
        {
          id: 'branch',
          text: 'A branch called release-2.4 that nobody commits to.',
          correct: false,
          feedback: 'Branches are meant to move. A tag is meant to stay put.',
        },
        {
          id: 'note',
          text: 'A note in the README.',
          correct: false,
          feedback: 'Notes drift. A tag points at the exact commit.',
        },
      ],
      explanation:
        'Tags mark releases. Unlike branches, they don’t move when new commits arrive, so v2.4.0 always means the same code.',
    },
  ],
} satisfies LessonInput;

/** Act 3's lessons in play order, final last. */
export const act3Lessons: readonly LessonInput[] = [
  branchesArePointers,
  conflictsWithoutPanic,
  conflictStorm,
];
