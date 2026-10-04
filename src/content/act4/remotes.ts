import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * 4.1: how work travels between a laptop and GitHub. The habits it builds are "look
 * before you merge" (fetch), "a rejected push is protecting someone" and "never let an
 * agent force-push a shared branch".
 */
export const remotesAndPushing = {
  id: 'remotes-and-pushing',
  act: 4,
  title: 'Remotes and Pushing',
  briefing: [
    'Welcome to Quillwork. Your laptop has a copy of the repo, GitHub has another, and they only sync when someone says so.',
    'Otto, the team’s AI agent, can run every git command. Your job is knowing which one to ask for, and when to say no.',
  ],
  cards: [
    {
      id: 'what-is-origin',
      kind: 'choose',
      situation: 'First morning. Sage asks Otto to show where the repo syncs to.',
      artifact: {
        kind: 'terminal',
        text: [
          'PS> git remote -v',
          'origin  https://github.com/quillwork/quillwork-app.git (fetch)',
          'origin  https://github.com/quillwork/quillwork-app.git (push)',
        ].join('\n'),
      },
      question: 'What is origin?',
      options: [
        {
          id: 'first-commit',
          text: 'The repo’s first commit, where history begins.',
          correct: false,
          feedback: 'Commits have hashes, not names like origin. This line is a web address.',
        },
        {
          id: 'nickname',
          text: 'A nickname for the Quillwork repo on GitHub, the copy yours syncs with.',
          correct: true,
          feedback: 'Yes. A remote is a named address, and origin is the usual name.',
        },
        {
          id: 'main-branch',
          text: 'Another name for the main branch.',
          correct: false,
          feedback: 'Branches live inside a repo. origin is a whole other copy of the repo.',
        },
        {
          id: 'backup',
          text: 'A backup GitHub keeps for you automatically.',
          correct: false,
          feedback: 'Nothing reaches GitHub until you push. It’s a shared copy, not a backup.',
        },
      ],
      explanation:
        'A remote is a name for another copy of the repo. origin is the one you cloned from. Your commits stay on your laptop until you push them there.',
    },
    {
      id: 'committed-not-pushed',
      kind: 'choose',
      situation:
        'You committed the new font picker an hour ago. Priya opens GitHub and says she can’t see it anywhere.',
      artifact: {
        kind: 'terminal',
        text: [
          'PS> git status',
          'On branch feat/font-picker',
          "Your branch is ahead of 'origin/feat/font-picker' by 1 commit.",
          '  (use "git push" to publish your local commits)',
          '',
          'nothing to commit, working tree clean',
        ].join('\n'),
      },
      question: 'Why not?',
      options: [
        {
          id: 'slow',
          text: 'GitHub takes a while to show new commits.',
          correct: false,
          feedback: 'Pushed commits show up within seconds. Something never left your laptop.',
        },
        {
          id: 'wrong-branch',
          text: 'She’s looking at the wrong branch on GitHub.',
          correct: false,
          feedback:
            'Possible, but check the simpler thing first: did the commit ever leave your laptop?',
        },
        {
          id: 'not-pushed',
          text: 'A commit is local until it’s pushed. You never pushed it.',
          correct: true,
          feedback: 'Right. Commit saves on your laptop; push sends it to GitHub.',
        },
      ],
      explanation:
        'Committing and sharing are two separate steps. Commit records the change in your copy. Push uploads it to the remote, where teammates can see it.',
    },
    {
      id: 'fetch-before-pull',
      kind: 'choose',
      situation:
        'Dex says he pushed a big change to the editor. You want to see what it is before it touches your files.',
      artifact: {
        kind: 'agent-message',
        label: 'Dex in #engineering',
        text: 'Pushed the new editor toolbar to main. Heads up: it moves a lot of files around.',
      },
      question: 'What should Otto run?',
      options: [
        {
          id: 'pull',
          text: 'git pull, so you have it.',
          correct: false,
          feedback: 'Pull downloads and merges at once, so your files change before you look.',
        },
        {
          id: 'clone',
          text: 'Clone the repo again into a new folder.',
          correct: false,
          feedback:
            'That works, but it’s a second copy to keep in sync. Fetch updates the one you have.',
        },
        {
          id: 'fetch',
          text: 'git fetch, then compare main with origin/main.',
          correct: true,
          feedback: 'Yes. Fetch downloads Dex’s commits without changing your branch.',
        },
      ],
      explanation:
        'Fetch updates your view of GitHub, called origin/main, and leaves your work alone. Pull is fetch plus merge. Fetch first when you want to look before you leap.',
    },
    {
      id: 'brief-a-sync',
      kind: 'prompt',
      situation:
        'You’re about to start a task, but you’ve been away two days and main has surely moved.',
      question: 'Which instruction do you give Otto?',
      options: [
        {
          id: 'look-first',
          text: 'Fetch from origin. Tell me how many commits main is behind origin/main and summarise what they change. Don’t merge anything until I say so.',
          correct: true,
          feedback: 'You learn what changed before it lands, and Otto waits for you.',
        },
        {
          id: 'reset',
          text: 'Reset my main to match GitHub exactly.',
          correct: false,
          feedback: 'A hard reset throws away anything you hadn’t pushed, with no undo.',
        },
        {
          id: 'just-pull',
          text: 'Pull and start the task.',
          correct: false,
          feedback: 'It probably works, but you skip knowing what changed under you.',
        },
        {
          id: 'reclone',
          text: 'Delete the folder and clone it fresh.',
          correct: false,
          feedback: 'Any local branches or unpushed commits go with the folder.',
        },
      ],
      explanation:
        'A good sync instruction says what to look at, what to report, and where to stop. Asking an agent to wait before merging keeps you in charge of your own branch.',
    },
    {
      id: 'push-rejected',
      kind: 'choose',
      situation: 'Otto tried to push your branch and reports this.',
      artifact: {
        kind: 'terminal',
        text: [
          'PS> git push',
          'To https://github.com/quillwork/quillwork-app.git',
          ' ! [rejected]        feat/font-picker -> feat/font-picker (fetch first)',
          "error: failed to push some refs to 'github.com/quillwork/quillwork-app.git'",
          'hint: Updates were rejected because the remote contains work that you do',
          'hint: not have locally. Integrate the remote changes (e.g.',
          "hint: 'git pull ...') before pushing again.",
        ].join('\n'),
      },
      question: 'What does this mean?',
      options: [
        {
          id: 'broken',
          text: 'GitHub is down. Try again later.',
          correct: false,
          feedback: 'GitHub answered, and said exactly what’s wrong. Read the hint lines.',
        },
        {
          id: 'permissions',
          text: 'You don’t have permission to push this branch.',
          correct: false,
          feedback: 'A permission problem says “denied” or 403. This one says “fetch first”.',
        },
        {
          id: 'conflict-files',
          text: 'Your files have merge conflicts.',
          correct: false,
          feedback: 'Not yet. Conflicts only show up once you bring the other commits in.',
        },
        {
          id: 'someone-pushed',
          text: 'Someone pushed to this branch after you last synced, so GitHub has commits you don’t.',
          correct: true,
          feedback: 'Yes. Bring those commits in, check it still works, then push.',
        },
      ],
      explanation:
        'Git refuses a push that would lose commits it has and you don’t. That refusal protects a teammate’s work. The fix is to integrate their commits first.',
    },
    {
      id: 'agent-wants-force',
      kind: 'prompt',
      situation: 'Otto replies to the rejected push.',
      artifact: {
        kind: 'agent-message',
        label: 'Otto',
        text: 'The push was rejected. I can fix this quickly with `git push --force`. Shall I?',
      },
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'yes',
          text: 'Yes, go ahead. Speed matters today.',
          correct: false,
          feedback: 'Force replaces GitHub’s copy with yours, deleting whoever pushed in between.',
        },
        {
          id: 'lease',
          text: 'Use --force-with-lease instead. That one is always safe.',
          correct: false,
          feedback: 'Safer, not safe: it still overwrites a shared branch once you’ve fetched.',
        },
        {
          id: 'integrate',
          text: 'No force on a shared branch. Fetch, merge origin’s version of this branch into ours, show me any conflicts before resolving them, run the tests, then push normally.',
          correct: true,
          feedback: 'Their work is kept, you see the conflicts, and the push is normal.',
        },
        {
          id: 'new-branch',
          text: 'Push to a brand new branch so it can’t be rejected.',
          correct: false,
          feedback: 'That dodges the problem. Now the work is split across two branches.',
        },
      ],
      explanation:
        'Agents reach for the fastest command that makes an error go away. A force push makes it go away by deleting history. Tell the agent the rule and the safe path.',
    },
    {
      id: 'fork-a-library',
      kind: 'choose',
      situation:
        'Quillwork uses an open-source markdown library with a bug you can fix. You can’t push to its repo.',
      question: 'How do you send the fix?',
      options: [
        {
          id: 'ask-access',
          text: 'Ask the maintainers for write access first.',
          correct: false,
          feedback: 'Not needed, and rarely given to strangers. GitHub has a path for outsiders.',
        },
        {
          id: 'fork',
          text: 'Fork it, push a branch to your fork, and open a PR to the original.',
          correct: true,
          feedback: 'Yes. A fork is your own copy on GitHub, and PRs can come from it.',
        },
        {
          id: 'email',
          text: 'Email the maintainers the fixed file.',
          correct: false,
          feedback: 'They’d have to work out what changed. A PR shows the exact diff.',
        },
        {
          id: 'vendor',
          text: 'Copy the library into Quillwork and fix it there.',
          correct: false,
          feedback: 'Now you own a copy that never gets their updates. Send the fix upstream.',
        },
      ],
      explanation:
        'A fork lets anyone propose a change without write access. You push to your fork, and the maintainers review your pull request and decide whether to merge it.',
    },
    {
      id: 'morning-sync',
      kind: 'order',
      situation: 'Sage shows you the start-of-task routine the team uses.',
      question: 'Put it in order.',
      steps: [
        { id: 'fetch', text: 'Fetch from origin' },
        { id: 'review', text: 'Look at what changed on origin/main' },
        { id: 'update-main', text: 'Update your local main from origin' },
        { id: 'branch', text: 'Create a feature branch from main' },
        { id: 'push-branch', text: 'Push the branch to GitHub early' },
      ],
      explanation:
        'Look, then update, then branch from the fresh main. Pushing the branch early means your work is backed up and teammates can see it.',
    },
  ],
} satisfies LessonInput;
