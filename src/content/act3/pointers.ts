import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Lesson 3.1: why branches exist and what one really is. Kyle never types a git command
 * here: he reads what Otto did, decides what should happen, and tells Otto.
 */
export const branchesArePointers = {
  id: 'branches-are-pointers',
  act: 3,
  title: 'Branches Are Pointers',
  briefing: [
    'Marco wants a CSV export button in the Quillwork editor, and Otto will build it.',
    'Main is what ships. Every change gets its own branch: a cheap name pointing at a commit.',
  ],
  cards: [
    {
      id: 'why-branches',
      kind: 'choose',
      situation:
        'Dex, the deploy bot, ships main to customers every hour. Otto just committed a half-built export button straight to main.',
      question: 'Why is this a problem?',
      options: [
        {
          id: 'main-ships',
          text: 'Main is what ships. Unfinished work belongs on its own branch until it’s reviewed.',
          correct: true,
          feedback: 'Right. The next deploy puts a half-built button in front of customers.',
        },
        {
          id: 'slower',
          text: 'Commits on main are slower to push.',
          correct: false,
          feedback: 'Speed isn’t the issue. Anything on main goes out on the next deploy.',
        },
        {
          id: 'seniority',
          text: 'Only senior engineers may commit.',
          correct: false,
          feedback: 'Who commits isn’t the point. Where it lands is: main holds finished work.',
        },
        {
          id: 'dex-skips',
          text: 'It isn’t. Dex skips commits that look unfinished.',
          correct: false,
          feedback: 'Dex ships exactly what’s on main. He can’t tell finished from unfinished.',
        },
      ],
      explanation:
        'Branches let work in progress live apart from what ships. Main stays deployable, and each change joins it only after review, through a merge.',
    },
    {
      id: 'what-a-branch-is',
      kind: 'choose',
      situation:
        'Otto says: “Branches copy the whole repo, so I’ll reuse one branch for everything.” You check what git actually stored.',
      artifact: {
        kind: 'terminal',
        label: 'PowerShell',
        text: [
          'PS> git branch feat/csv-export',
          'PS> Get-Content .git/refs/heads/feat/csv-export',
          '7d02b8f4c1e9a3b6d5f2e8c0a7b4d1e6f3a9c2b5',
        ].join('\n'),
      },
      question: 'What does this show?',
      options: [
        {
          id: 'copy',
          text: 'A branch is a full copy of the project in a hidden folder.',
          correct: false,
          feedback: 'Git copied no files. The branch is that one line you just read.',
        },
        {
          id: 'pointer',
          text: 'A branch is one tiny file holding a commit id, so making one is nearly free.',
          correct: true,
          feedback: 'Yes. Otto’s worry is wrong, and reusing one branch mixes unrelated work.',
        },
        {
          id: 'changed-files',
          text: 'A branch is a list of the files that changed.',
          correct: false,
          feedback: 'It holds no file names at all, just the id of one commit.',
        },
      ],
      explanation:
        'A branch is a name pointing at one commit. Each new commit moves the name forward. Because branches are free, make one per change.',
    },
    {
      id: 'where-head-is',
      kind: 'choose',
      situation: 'Priya asks where your next commit will land. You check.',
      artifact: {
        kind: 'log',
        label: 'git log --oneline --decorate',
        text: [
          'a41c9e2 (HEAD -> feat/csv-export) add CSV export button',
          '7d02b8f (origin/main, main) fix typo in onboarding email',
          '3be11f0 add document sharing',
        ].join('\n'),
      },
      question: 'Where does your next commit go?',
      options: [
        {
          id: 'main',
          text: 'On main, because main is the default branch.',
          correct: false,
          feedback: 'Default only means where a fresh clone starts. HEAD says where you are now.',
        },
        {
          id: 'both',
          text: 'On both branches, since they share history.',
          correct: false,
          feedback: 'Shared history is the past. A new commit moves only the branch HEAD names.',
        },
        {
          id: 'head',
          text: 'On feat/csv-export. HEAD points at it, so that branch moves forward.',
          correct: true,
          feedback: 'Right. Main stays at 7d02b8f.',
        },
        {
          id: 'nowhere',
          text: 'Nowhere until you push.',
          correct: false,
          feedback: 'Commits are made on your machine. Pushing only copies them to GitHub.',
        },
      ],
      explanation:
        'HEAD is git’s “you are here”. It points at a branch, and each new commit moves that branch forward while every other branch stays put.',
    },
    {
      id: 'brief-the-branch',
      kind: 'prompt',
      situation:
        'Marco’s ticket: add a CSV export button to the documents page. You hand it to Otto.',
      question: 'Which instruction do you give Otto?',
      options: [
        {
          id: 'bare',
          text: 'Add the CSV export button.',
          correct: false,
          feedback: 'Otto builds on whatever is checked out: maybe main, maybe a stale branch.',
        },
        {
          id: 'careful',
          text: 'Make a branch and add the export button. Be careful.',
          correct: false,
          feedback:
            '“Be careful” can’t be checked. Which branch, starting where? Otto has to guess.',
        },
        {
          id: 'copy-folder',
          text: 'Copy the repo to a folder called export-test and build it there.',
          correct: false,
          feedback: 'A copied folder has no link to main, so getting the work back is manual.',
        },
        {
          id: 'scoped',
          text: 'Pull main, then create feat/csv-export from it. Build the button there in small commits and never commit to main. When done, run the tests and tell me the branch name.',
          correct: true,
          feedback: 'It names the branch, where it starts, the boundary, and the proof you want.',
        },
      ],
      explanation:
        'Tell the agent where work happens. Starting from a freshly pulled main means Otto builds on today’s code, and main only changes through a reviewed merge.',
    },
    {
      id: 'blocked-switch',
      kind: 'choose',
      situation:
        'You’re mid-edit on feat/csv-export when Priya asks you to check something on main.',
      artifact: {
        kind: 'terminal',
        label: 'PowerShell',
        text: [
          'PS> git switch main',
          'error: Your local changes to the following files would be overwritten by checkout:',
          '        src/export/csv.ts',
          'Please commit your changes or stash them before you switch branches.',
          'Aborting',
        ].join('\n'),
      },
      question: 'What’s the right move?',
      options: [
        {
          id: 'delete',
          text: 'Delete src/export/csv.ts so the switch works.',
          correct: false,
          feedback: 'That throws away your edits. Git stopped precisely to protect them.',
        },
        {
          id: 'force',
          text: 'Force it with git switch -f main.',
          correct: false,
          feedback: '-f discards your uncommitted changes. The warning was the safety net.',
        },
        {
          id: 'stash',
          text: 'Stash the edits, or commit them as work in progress, then switch.',
          correct: true,
          feedback: 'Yes. Either way the edits are safe, and the folder is clean to switch.',
        },
      ],
      explanation:
        'Switching rewrites your folder to match the other branch. Git refuses when that would wipe uncommitted edits. Stash shelves them; a commit saves them on the branch.',
    },
    {
      id: 'switch-safely',
      kind: 'order',
      situation:
        'You have unfinished edits on feat/csv-export. A customer bug needs a quick fix on main.',
      question: 'Put the safe steps in order.',
      steps: [
        { id: 'stash', text: 'Stash the unfinished edits with a message' },
        { id: 'switch-main', text: 'Switch to main and pull the latest' },
        { id: 'fix-branch', text: 'Create fix/empty-export from main' },
        { id: 'fix', text: 'Fix it, commit, and open a PR' },
        { id: 'back', text: 'Switch back to feat/csv-export and pop the stash' },
      ],
      explanation:
        'Leave nothing loose before switching. Start every fix from the latest main on its own branch, then come back and restore your work as you left it.',
    },
    {
      id: 'clean-up-branches',
      kind: 'prompt',
      situation:
        'Otto has 23 local branches. 21 were merged into main with merge commits weeks ago. These two never were:',
      artifact: {
        kind: 'terminal',
        label: 'PowerShell',
        text: ['PS> git branch --no-merged main', '  feat/pdf-export', '  spike/live-cursors'].join(
          '\n',
        ),
      },
      question: 'Which instruction do you give Otto?',
      options: [
        {
          id: 'delete-all',
          text: 'Delete every branch except main.',
          correct: false,
          feedback: 'That deletes feat/pdf-export and the spike, which hold work main lacks.',
        },
        {
          id: 'merged-only',
          text: 'Delete only branches already merged into main, with git branch -d. List the unmerged ones for me and leave them alone.',
          correct: true,
          feedback: 'Safe by design: -d refuses to delete a branch that isn’t merged.',
        },
        {
          id: 'keep-all',
          text: 'Keep them all. Deleting a branch deletes its commits.',
          correct: false,
          feedback: 'Deleting a merged branch removes only the name. Its commits live on in main.',
        },
        {
          id: 'force-unmerged',
          text: 'Force-delete the unmerged ones with git branch -D. They were never finished.',
          correct: false,
          feedback: 'Unfinished isn’t worthless. Ask whoever owns them before throwing work away.',
        },
      ],
      explanation:
        'A merged branch is a leftover label. git branch -d refuses unmerged ones; -D overrides that. Squash-merged branches look unmerged to git: check the PR shows Merged before force-deleting.',
    },
    {
      id: 'committed-not-merged',
      kind: 'choose',
      situation:
        'Otto reports: “Done. The CSV export is committed.” You check before telling Marco.',
      artifact: {
        kind: 'terminal',
        label: 'PowerShell',
        text: [
          'PS> git log --oneline -2 main',
          '7d02b8f fix typo in onboarding email',
          '3be11f0 add document sharing',
          'PS> git log --oneline -3 feat/csv-export',
          'c19e7a0 add CSV export tests',
          'b2f4d91 add CSV export button',
          '7d02b8f fix typo in onboarding email',
        ].join('\n'),
      },
      question: 'What’s true?',
      options: [
        {
          id: 'live',
          text: 'The export is on main, so it’s live.',
          correct: false,
          feedback: 'Main’s newest commit is the typo fix. The export commits aren’t there.',
        },
        {
          id: 'lost',
          text: 'Otto lost the work: it isn’t on main.',
          correct: false,
          feedback: 'It’s safe on its branch. Not on main only means not merged yet.',
        },
        {
          id: 'diverged',
          text: 'Main and the branch have diverged, so a conflict is certain.',
          correct: false,
          feedback: 'Main hasn’t moved since the branch began, so nothing has diverged.',
        },
        {
          id: 'ahead',
          text: 'The export is on feat/csv-export, two commits ahead of main, waiting for a PR.',
          correct: true,
          feedback: 'Yes. Tell Marco it’s ready for review, not that it shipped.',
        },
      ],
      explanation:
        '“Committed” and “merged” are different. A commit on a branch is saved but not shipped. Compare the branch to main to see what a merge would bring.',
    },
  ],
} satisfies LessonInput;
