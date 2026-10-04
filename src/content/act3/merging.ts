import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Lesson 3.2: the ways two lines of work become one. Fast-forward and three-way merges,
 * then rebase, and the one rule that keeps rebase safe: never rewrite shared history.
 */
export const twoWaysToMerge = {
  id: 'two-ways-to-merge',
  act: 3,
  title: 'Two Ways to Merge',
  briefing: [
    'Otto’s export branch is ready. Now it has to join main, and there’s more than one way in.',
    'Merging joins two lines of work. Rebasing replays one on top of the other. Each has its place.',
  ],
  cards: [
    {
      id: 'fast-forward',
      kind: 'choose',
      situation:
        'Nobody has changed main since Otto branched. You merge feat/csv-export into main.',
      artifact: {
        kind: 'log',
        label: 'git log --graph --oneline',
        text: [
          '* b2f4d91 (feat/csv-export) add CSV export tests',
          '* a17c0e3 add CSV export button',
          '* 7d02b8f (main) fix typo in onboarding email',
          '* 3be11f0 add document sharing',
        ].join('\n'),
      },
      question: 'What does git do?',
      options: [
        {
          id: 'merge-commit',
          text: 'Creates a merge commit with two parents.',
          correct: false,
          feedback: 'A merge commit is only needed when both sides have new work. Main has none.',
        },
        {
          id: 'conflict',
          text: 'Stops with a conflict.',
          correct: false,
          feedback: 'A conflict needs changes on both sides. Only one side moved.',
        },
        {
          id: 'ff',
          text: 'Slides the main label forward to b2f4d91. No new commit.',
          correct: true,
          feedback: 'Yes: a fast-forward. Main’s history already leads to the branch tip.',
        },
      ],
      explanation:
        'When main hasn’t moved, git just moves the main label forward to the branch tip. That’s a fast-forward: no new commit and a straight-line history.',
    },
    {
      id: 'three-way',
      kind: 'choose',
      situation: 'This time Priya merged a login fix into main while Otto worked.',
      artifact: {
        kind: 'log',
        label: 'git log --graph --oneline --all',
        text: [
          '* e8a1c44 (main) fix login redirect',
          '| * b2f4d91 (feat/csv-export) add CSV export tests',
          '| * a17c0e3 add CSV export button',
          '|/',
          '* 7d02b8f fix typo in onboarding email',
        ].join('\n'),
      },
      question: 'What happens when you merge feat/csv-export into main?',
      options: [
        {
          id: 'three-way',
          text: 'Git combines both sides from their shared commit, 7d02b8f, and records a merge commit with two parents.',
          correct: true,
          feedback: 'Right: the two tips plus their common ancestor make three.',
        },
        {
          id: 'overwrite',
          text: 'The export branch overwrites Priya’s login fix.',
          correct: false,
          feedback: 'Merges combine work. Nothing is overwritten unless someone chooses it.',
        },
        {
          id: 'ff',
          text: 'Main fast-forwards to b2f4d91.',
          correct: false,
          feedback: 'It can’t: that would drop e8a1c44, which the branch doesn’t contain.',
        },
        {
          id: 'refuse',
          text: 'Git refuses until Priya’s commit is removed.',
          correct: false,
          feedback: 'Diverged branches are normal. Merging exists to join them.',
        },
      ],
      explanation:
        'Three-way means three commits: the two tips and their common ancestor. Git keeps both sides’ changes and records a merge commit with two parents.',
    },
    {
      id: 'ff-only',
      kind: 'prompt',
      situation:
        'Quillwork keeps main’s history a straight line. You don’t want surprise merge commits from Otto.',
      question: 'Which instruction do you give Otto?',
      options: [
        {
          id: 'whatever',
          text: 'Merge your branch however works.',
          correct: false,
          feedback:
            'Otto may make a merge commit or force something. You never said what you want.',
        },
        {
          id: 'ff-only',
          text: 'First update your branch on top of the latest main. Then merge with git merge --ff-only. If it refuses, stop and tell me why.',
          correct: true,
          feedback: 'Clear goal, a command that can’t surprise you, and a stop rule.',
        },
        {
          id: 'no-ff',
          text: 'Always merge with git merge --no-ff so every merge is recorded.',
          correct: false,
          feedback: '--no-ff forces a merge commit every time: the opposite of a straight line.',
        },
      ],
      explanation:
        '--ff-only merges only when it can fast-forward and fails loudly otherwise. Telling the agent to stop and report on failure keeps a surprise from becoming a mess.',
    },
    {
      id: 'rebase-new-ids',
      kind: 'choose',
      situation: 'Otto rebased feat/csv-export onto main. The commit ids changed.',
      artifact: {
        kind: 'terminal',
        label: 'PowerShell',
        text: [
          'PS> git log --oneline -2',
          'b2f4d91 add CSV export tests',
          'a17c0e3 add CSV export button',
          'PS> git rebase main',
          'Successfully rebased and updated refs/heads/feat/csv-export.',
          'PS> git log --oneline -3',
          '5c3e9d7 add CSV export tests',
          '0f6a2b8 add CSV export button',
          'e8a1c44 fix login redirect',
        ].join('\n'),
      },
      question: 'Why did the ids change?',
      options: [
        {
          id: 'renumber',
          text: 'Git renumbers commits whenever you run log.',
          correct: false,
          feedback: 'Ids never change on their own. They’re fingerprints of a commit.',
        },
        {
          id: 'rewrote-code',
          text: 'Otto rewrote the code inside each commit.',
          correct: false,
          feedback: 'The changes are the same. Only the starting point moved.',
        },
        {
          id: 'replayed',
          text: 'Rebase replayed each commit on top of main, making new commits with new parents.',
          correct: true,
          feedback: 'Yes. Same changes, new parents, so new ids.',
        },
      ],
      explanation:
        'A commit’s id is a fingerprint of its content and its parent. Rebase gives each commit a new parent, so each becomes a new commit with a new id.',
    },
    {
      id: 'safe-to-rebase',
      kind: 'choose',
      situation:
        'Two branches are behind main: feat/csv-export, which only Otto uses, and release/2.4, which Marco, Priya and Dex all pull.',
      question: 'Which can you safely rebase?',
      options: [
        {
          id: 'both',
          text: 'Both. Rebase is always safe.',
          correct: false,
          feedback: 'Rebasing release/2.4 changes ids under three people, and their pulls break.',
        },
        {
          id: 'neither',
          text: 'Neither. Rebase loses work.',
          correct: false,
          feedback: 'Rebase keeps the changes. The danger is only in rewriting what others hold.',
        },
        {
          id: 'private',
          text: 'Only feat/csv-export, because nobody else has its commits.',
          correct: true,
          feedback: 'Right. A branch only you hold is yours to rewrite.',
        },
        {
          id: 'release',
          text: 'Only release/2.4, because it matters most to keep tidy.',
          correct: false,
          feedback: 'Backwards: the more people hold a branch, the more a rewrite hurts.',
        },
      ],
      explanation:
        'Rebase rewrites commits. That’s fine while you’re the only one holding them. Once others have pulled a branch, rewriting it splits their copies from yours. Merge shared branches.',
    },
    {
      id: 'push-after-rebase',
      kind: 'prompt',
      situation:
        'Otto rebased his own branch, which he’d already pushed. Now his push is rejected.',
      artifact: {
        kind: 'terminal',
        label: 'PowerShell',
        text: [
          'PS> git push',
          ' ! [rejected]        feat/csv-export -> feat/csv-export (non-fast-forward)',
          "error: failed to push some refs to 'github.com:quillwork/editor.git'",
          'hint: Updates were rejected because the tip of your current branch is behind',
        ].join('\n'),
      },
      question: 'Which instruction do you give Otto?',
      options: [
        {
          id: 'force',
          text: 'Run git push --force.',
          correct: false,
          feedback: 'Plain --force overwrites GitHub’s copy, even commits a teammate pushed since.',
        },
        {
          id: 'lease',
          text: 'Push with git push --force-with-lease, to feat/csv-export only. Never force-push main.',
          correct: true,
          feedback: 'It replaces the old commits only if nobody else pushed in the meantime.',
        },
        {
          id: 'pull',
          text: 'Run git pull, then push.',
          correct: false,
          feedback: 'Pulling merges the old copies back in, so every commit appears twice.',
        },
        {
          id: 'recreate',
          text: 'Delete the branch on GitHub and push it again.',
          correct: false,
          feedback: 'That closes the open PR and loses its review comments.',
        },
      ],
      explanation:
        'After a rebase, GitHub still holds the old commits, so a normal push is refused. --force-with-lease replaces them only if nobody else pushed meanwhile.',
    },
    {
      id: 'update-and-merge',
      kind: 'order',
      situation: 'Otto’s branch is behind main. You want a clean, reviewed merge.',
      question: 'Put the steps in order.',
      steps: [
        { id: 'fetch', text: 'Fetch the latest main' },
        { id: 'rebase', text: 'Rebase the branch onto main' },
        { id: 'test', text: 'Run the tests on the rebased branch' },
        { id: 'push', text: 'Push with --force-with-lease' },
        { id: 'merge', text: 'Merge the PR once checks are green' },
      ],
      explanation:
        'Update first, prove it still works, then publish. Tests matter after a rebase: each replayed commit now sits on code it never ran against.',
    },
    {
      id: 'merge-or-rebase',
      kind: 'choose',
      situation:
        'Priya says rebasing is always better because merge commits are ugly. Marco asks what you think.',
      question: 'What’s the honest answer?',
      options: [
        {
          id: 'always-rebase',
          text: 'She’s right: always rebase.',
          correct: false,
          feedback: 'Rebasing shared branches breaks teammates’ copies. Merge has its place.',
        },
        {
          id: 'both-tools',
          text: 'Rebase your own branch to tidy it; merge to join shared work.',
          correct: true,
          feedback: 'Yes. Each tool where it’s safe.',
        },
        {
          id: 'never-rebase',
          text: 'Never rebase. It’s dangerous.',
          correct: false,
          feedback: 'On your own branch it’s safe and keeps history readable.',
        },
      ],
      explanation:
        'Rebase gives a straight, readable history but rewrites commits. Merge keeps history exactly as it happened. Most teams rebase privately and merge publicly.',
    },
  ],
} satisfies LessonInput;
