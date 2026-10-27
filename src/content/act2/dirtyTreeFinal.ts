import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * The Dirty Tree: Act 2's timed final, standing in for its boss (DESIGN.md section 11).
 * It used to be a typed boss fight; now, like every other Act's final, it's answered by
 * clicking. Dex deploys from a clean checkout, so only committed work ships. Otto does
 * the git work, and each card is a moment where Kyle picks his instruction or checks his
 * claim against real git output: staging, history, good commits, the ignore list, and
 * the safe undo for each room. The `log*` rule hiding src/logger.ts is still the twist.
 */
export const dirtyTreeFinal = {
  id: 'dirty-tree',
  act: 2,
  title: 'The Dirty Tree',
  kind: 'final',
  // Seven minutes for nine cards: about 45 seconds each, enough to read git's output.
  timeLimitSeconds: 420,
  xp: 150,
  briefing: [
    'Dex deploys Quillwork Web from a clean checkout in seven minutes. Only what is committed ships.',
    'Otto does the git work. You pick his instructions and check his claims against the real output. Some of his ideas are traps.',
  ],
  cards: [
    {
      id: 'only-commits-ship',
      kind: 'choose',
      situation:
        'Otto says: “Done, the search feature is saved. Ready for Dex.” You ask him for git status.',
      artifact: {
        kind: 'terminal',
        label: 'git status',
        text: [
          'otto › git status',
          'On branch main',
          'Changes not staged for commit:',
          '        modified:   src/app.ts',
          '        modified:   src/router.ts',
          '',
          'Untracked files:',
          '        src/search/',
        ].join('\n'),
      },
      question: 'Is the search feature ready for Dex?',
      options: [
        {
          id: 'listed',
          text: 'Yes. git status lists the files, so git has them.',
          correct: false,
          feedback: 'Listed isn’t committed. Dex’s clean checkout only gets what is in a commit.',
        },
        {
          id: 'on-disk',
          text: 'Yes. Every file is saved on disk, and Dex deploys this project, so the search feature goes out with it.',
          correct: false,
          feedback:
            'Saved on the Workbench isn’t in the Vault. A clean checkout starts from the last commit.',
        },
        {
          id: 'not-committed',
          text: 'No. The edits sit on the Workbench and src/search/ was never added, so none of it ships.',
          correct: true,
          feedback: 'Yes. Saved to disk and committed are different rooms.',
        },
      ],
      explanation:
        'Dex builds from commits, not from your folder. Modified means changed since the last commit; untracked means git has never stored it. Neither ships until it’s staged and committed.',
    },
    {
      id: 'stage-by-name',
      kind: 'prompt',
      situation:
        'The folder also holds .env, dist/ and npm-debug.log. Otto suggests: “I’ll git add . and commit it all. Quickest way.”',
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'by-name',
          text: 'Stage only the search work by name: src/search/, src/app.ts and src/router.ts. Leave .env, dist/ and the log where they are.',
          correct: true,
          feedback: 'Yes. Naming what goes on the Loading Dock keeps the junk off it.',
        },
        {
          id: 'fix-later',
          text: 'Go ahead. Remove anything wrong in a later commit.',
          correct: false,
          feedback:
            'A later commit doesn’t erase an earlier one. The .env values would stay readable in history.',
        },
        {
          id: 'commit-am',
          text: 'Use git commit -am “feat: add search” instead. It only commits files git already tracks, so .env, dist/ and the log stay out of it.',
          correct: false,
          feedback:
            '-am skips untracked files, so src/search/ is left out, and it still sweeps in every tracked edit.',
        },
        {
          id: 'tell-dex',
          text: 'Add everything, and ask Dex to skip .env and dist/ when he deploys.',
          correct: false,
          feedback:
            'Dex builds what the commit holds. Once .env is committed, its values are in history for everyone.',
        },
      ],
      explanation:
        'git add . loads every changed and new file onto the Loading Dock, secrets and build output too. Check git status, then stage by name. What reaches the Vault is hard to take back.',
    },
    {
      id: 'ignore-the-junk',
      kind: 'choose',
      situation:
        'The junk keeps showing up in git status, and the next git add . would grab it again. Otto offers three ways to deal with it.',
      question: 'Which do you approve?',
      options: [
        {
          id: 'delete',
          text: 'Delete .env, dist/ and the log so status is clean.',
          correct: false,
          feedback:
            '.env holds your local settings, and dist/ comes back with the next build. Deleting hides the problem once.',
        },
        {
          id: 'gitignore',
          text: 'Add .env, dist/ and *.log to .gitignore, and commit the .gitignore.',
          correct: true,
          feedback: 'Yes. Ignored files grey out and can’t be staged by accident.',
        },
        {
          id: 'commit-then-ignore',
          text: 'Commit them now, then add them to .gitignore afterwards, so nothing is lost.',
          correct: false,
          feedback:
            '.gitignore only hides files git isn’t tracking. Committed first, git keeps tracking them, and .env sits in history.',
        },
      ],
      explanation:
        '.gitignore is the blocklist: build output, logs and secrets stay on your machine and never reach the Vault. It only works on files git isn’t already tracking.',
    },
    {
      id: 'one-idea-each',
      kind: 'prompt',
      situation:
        'On the Loading Dock: the search feature, plus a README typo fix that was also waiting. Otto drafts one commit, “update stuff”.',
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'fine',
          text: 'Fine. The message doesn’t matter for a deploy.',
          correct: false,
          feedback: 'The log is how the team finds what broke. “update stuff” tells them nothing.',
        },
        {
          id: 'one-commit',
          text: 'Keep it one commit, but type the message: “feat: add search and fix README typo”, so the log says exactly what changed.',
          correct: false,
          feedback: 'Two ideas in one commit. Undoing the search would undo the typo fix too.',
        },
        {
          id: 'split',
          text: 'Unstage README.md with git restore --staged. Commit “feat: add search”, then stage README.md and commit “docs: fix typo in README”.',
          correct: true,
          feedback: 'Yes. One idea per commit, each labelled with its kind.',
        },
        {
          id: 'wip',
          text: 'Commit it as “WIP” and tidy the history after the deploy.',
          correct: false,
          feedback:
            'Dex ships it as it is, and tidying shared history later is the risky kind of undo.',
        },
      ],
      explanation:
        'A good commit is one idea with a typed message: feat:, fix:, docs:. Small labelled commits are easy to review and safe to undo one at a time.',
    },
    {
      id: 'hidden-logger',
      kind: 'choose',
      situation:
        'Dex’s deploy fails. Otto insists src/logger.ts is committed: “It’s right there in the folder.” You check.',
      artifact: {
        kind: 'terminal',
        label: 'deploy',
        text: [
          'dex › build failed: src/app.ts imports ./logger, but src/logger.ts is missing',
          '',
          'otto › git status',
          'On branch main',
          'nothing to commit, working tree clean',
          '',
          'otto › git check-ignore -v src/logger.ts',
          '.gitignore:2:log*\tsrc/logger.ts',
        ].join('\n'),
      },
      question: 'Why did git status never show it?',
      options: [
        {
          id: 'dex-broken',
          text: 'Dex’s checkout is broken. It works on our machine.',
          correct: false,
          feedback:
            'Your machine has the file on disk. Dex only has commits, and this file was never in one.',
        },
        {
          id: 'too-broad',
          text: 'Line 2 of .gitignore, log*, meant for log files, also matches logger.ts, so git hides it.',
          correct: true,
          feedback: 'Yes. A rule that is too broad hides real code, silently.',
        },
        {
          id: 'lost-commit',
          text: 'Otto committed it, but the commit was lost.',
          correct: false,
          feedback:
            'git log would show that commit. check-ignore names the real cause: a .gitignore rule.',
        },
        {
          id: 'new-files',
          text: 'git status only shows modified files, never new ones.',
          correct: false,
          feedback: 'It shows untracked files too, unless .gitignore hides them.',
        },
      ],
      explanation:
        'A clean status means nothing changed or new that git can see, and ignored files are invisible to it. Narrow the rule to *.log, then stage and commit the hidden file.',
    },
    {
      id: 'which-commit',
      kind: 'choose',
      situation:
        'Deployed. Now the login page is blank. Otto says the newest commit must be to blame. You read the history.',
      artifact: {
        kind: 'log',
        label: 'git log',
        text: [
          'otto › git log --oneline -3',
          'e5f6a7b docs: fix typo in README',
          'a1b2c3d feat: add search',
          '7c8d9e0 chore: scaffold quillwork web app',
          '',
          'otto › git show --stat a1b2c3d',
          'commit a1b2c3d',
          '    feat: add search',
          '',
          ' src/app.ts          | 2 ++',
          ' src/login.ts        | 4 ++--',
          ' src/search/index.ts | 5 +++++',
        ].join('\n'),
      },
      question: 'Which commit do you look at first?',
      options: [
        {
          id: 'newest',
          text: 'e5f6a7b, the newest. The latest change is always the cause, so start there.',
          correct: false,
          feedback:
            'It only touched README.md. Newest isn’t guilty; read what each commit changed.',
        },
        {
          id: 'oldest',
          text: '7c8d9e0, the scaffold. That’s where the login page was first built, so its bug starts there.',
          correct: false,
          feedback: 'Login worked before today’s deploy. Look at what changed since.',
        },
        {
          id: 'search',
          text: 'a1b2c3d. Its git show lists src/login.ts, the page that broke.',
          correct: true,
          feedback: 'Yes. Match the broken page to the commit that touched it.',
        },
      ],
      explanation:
        'git log lists the commits; git show says what one of them changed. Match what broke to the commit that touched it, instead of trusting a guess about which is newest.',
    },
    {
      id: 'undo-shared',
      kind: 'prompt',
      situation:
        'Teammates already pulled a1b2c3d, and users can’t log in. Otto offers git reset --hard HEAD~2, then a force push, to wipe it from main.',
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'reset',
          text: 'Do it: reset --hard HEAD~2 and force push main, then tell the team to delete their copies and clone again.',
          correct: false,
          feedback:
            'Rewriting shared history breaks everyone who pulled it, and deleting their copies loses their unpushed work. HEAD~2 throws away the README fix too.',
        },
        {
          id: 'restore',
          text: 'Run git restore src/login.ts to undo the change.',
          correct: false,
          feedback:
            'restore rewinds your Workbench to the last commit, which already holds the bug. The commit stays.',
        },
        {
          id: 'wait',
          text: 'Leave it until the next deploy and fix it then.',
          correct: false,
          feedback: 'Users stay locked out until then. Undo now, and fix it calmly after.',
        },
        {
          id: 'revert',
          text: 'No reset. Run git revert a1b2c3d: a new commit that cancels it, so main’s history stays as everyone has it. Then Dex redeploys.',
          correct: true,
          feedback: 'Yes. revert is the undo for commits other people already have.',
        },
      ],
      explanation:
        'restore undoes edits that aren’t committed. reset moves your branch back, fine for commits only you have. revert adds a new commit that cancels an old one: the safe undo for shared history.',
    },
    {
      id: 'reflog-rescue',
      kind: 'choose',
      situation:
        'On a practice copy, Otto ran git reset --hard HEAD~2 by mistake. Two of your commits are gone from git log. He offers to rewrite them from memory.',
      artifact: {
        kind: 'log',
        label: 'git reflog',
        text: [
          'otto › git reflog -3',
          '9f8e7d6 HEAD@{0}: reset: moving to HEAD~2',
          '4c5d6e7 HEAD@{1}: commit: feat: add search filters',
          '3b4c5d6 HEAD@{2}: commit: feat: highlight search results',
        ].join('\n'),
      },
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'reset-back',
          text: 'Run git reset --hard 4c5d6e7, where HEAD stood before the mistake, then check git log.',
          correct: true,
          feedback: 'Yes. The reflog remembers every place HEAD has been.',
        },
        {
          id: 'rewrite',
          text: 'Rewrite them from memory, as he offers.',
          correct: false,
          feedback: 'Slow, and easy to get wrong. The commits still exist; the reflog shows where.',
        },
        {
          id: 'fresh-clone',
          text: 'They’re gone for good after reset --hard. Start over from a fresh clone and redo both commits by hand.',
          correct: false,
          feedback:
            'A fresh clone has only what was pushed. Your local commits are still in the reflog.',
        },
        {
          id: 'revert-reset',
          text: 'Undo the reset with git revert HEAD. revert is git’s safe undo, so it brings back what the reset removed.',
          correct: false,
          feedback:
            'revert cancels a commit, and a reset isn’t one. It would undo 9f8e7d6 instead.',
        },
      ],
      explanation:
        'reset --hard moves the branch back, but the commits stay in the repository for a while. git reflog lists where HEAD has been, so you can move it back.',
    },
    {
      id: 'deploy-routine',
      kind: 'order',
      situation:
        'Dex’s deploy is green. He asks for your routine, so Otto follows it before every deploy.',
      question: 'Put the steps in order.',
      steps: [
        { id: 'status', text: 'Read git status: what’s changed, new or ignored' },
        { id: 'ignore', text: 'Keep build output, logs and secrets in .gitignore' },
        { id: 'stage', text: 'Stage one change by name and check git diff --staged' },
        { id: 'commit', text: 'Commit it with a typed message, one idea each' },
        { id: 'prove', text: 'Prove it: a clean git status and every commit in git log' },
      ],
      explanation:
        'Look, keep the junk out, stage on purpose, commit one idea at a time, then prove it. A clean status and a full log are what Dex’s checkout will see.',
    },
  ],
} satisfies LessonInput;
