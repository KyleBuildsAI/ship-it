import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * 4.2: how a request becomes merged work. Issues record why, pull requests propose how,
 * and a good description is what lets a human review an agent's work in minutes.
 */
export const issuesAndPullRequests = {
  id: 'issues-and-pull-requests',
  act: 4,
  title: 'Issues and Pull Requests',
  briefingBeat: 'issue-pinned',
  briefing: [
    'At Quillwork every change starts as an issue and reaches main through a pull request.',
    'Otto writes most of the code. You decide what gets asked for, and what a reviewer gets to read.',
  ],
  cards: [
    {
      id: 'issue-first',
      beat: 'issue-pinned',
      kind: 'choose',
      situation:
        'Marco messages in chat: “Customers keep asking to export to PDF. Can we do it this sprint?”',
      question: 'Before Otto writes any code, what comes first?',
      options: [
        {
          id: 'start',
          text: 'Start now. Marco’s message says what he wants.',
          correct: false,
          feedback: 'Chat scrolls away, and nobody agreed what “done” means.',
        },
        {
          id: 'issue',
          text: 'Open an issue with the goal and what “done” looks like.',
          correct: true,
          feedback: 'Yes. The issue is the record of why the work exists.',
        },
        {
          id: 'branch',
          text: 'Create a branch called feat/pdf-export, and have Otto put the plan in its first commit message.',
          correct: false,
          feedback:
            'A branch says where the work goes, and a commit comes after the work. Neither records why, or what done means.',
        },
      ],
      explanation:
        'An issue holds the request, the reasoning and the definition of done in one place. Pull requests link to it, so months later anyone can trace why a change was made.',
    },
    {
      id: 'brief-the-issue',
      beat: 'issue-pinned',
      kind: 'prompt',
      situation: 'You ask Otto to draft the issue from Marco’s message.',
      question: 'Which instruction gets an issue the team can actually work from?',
      options: [
        {
          id: 'short',
          text: 'Make an issue about PDF export.',
          correct: false,
          feedback: 'You’ll get a title and a guess. Nobody can tell when it’s done.',
        },
        {
          id: 'and-build',
          text: 'Draft an issue for PDF export: the user’s problem, a checklist of what done looks like, and what’s out of scope. Then open a branch and start building it.',
          correct: false,
          feedback:
            'A good issue, but building starts before Marco reads it, so nobody asks the open questions. Draft, then stop.',
        },
        {
          id: 'structured',
          text: 'Draft an issue for PDF export: the user’s problem, a checklist of what done looks like, what’s out of scope, and questions for Marco. Don’t write code yet.',
          correct: true,
          feedback: 'Problem, done, scope and open questions: everything a plan needs.',
        },
        {
          id: 'paste',
          text: 'Paste Marco’s chat message into a new issue.',
          correct: false,
          feedback: 'It records the request but not what done means or what’s left out.',
        },
      ],
      explanation:
        'Agents fill gaps with guesses. Asking for scope, a done checklist and open questions turns a vague request into something you can check, before any code is written.',
    },
    {
      id: 'bad-bug-report',
      beat: 'issue-pinned',
      kind: 'choose',
      situation: 'Dex filed this issue. Otto asks what to do with it.',
      artifact: {
        kind: 'pull-request',
        label: 'Issue #61',
        text: ['Title: export broken', '', 'its broken pls fix asap'].join('\n'),
      },
      question: 'What’s missing before anyone can fix it?',
      options: [
        {
          id: 'repro',
          text: 'Steps to reproduce, what was expected, what happened instead, and which version.',
          correct: true,
          feedback: 'Yes. Without those, the fixer has to guess which bug this is.',
        },
        {
          id: 'priority',
          text: 'A priority label, so people know it’s urgent.',
          correct: false,
          feedback: 'Labels help sorting, but urgency doesn’t tell anyone what’s broken.',
        },
        {
          id: 'assignee',
          text: 'An assignee, so someone owns it.',
          correct: false,
          feedback: 'Owning it doesn’t help if nobody can reproduce it.',
        },
      ],
      explanation:
        'A useful bug report lets a stranger see the bug: the steps, what you expected, what actually happened, and the version. Agents need this even more than people do.',
    },
    {
      id: 'pr-lifecycle',
      beat: 'checks-gate',
      kind: 'order',
      situation: 'Otto is starting the PDF export from issue #57.',
      question: 'Put the work’s life in order.',
      steps: [
        { id: 'branch', text: 'Create a branch from an up-to-date main' },
        { id: 'commit', text: 'Commit the work in small steps' },
        { id: 'push', text: 'Push the branch to GitHub' },
        { id: 'open', text: 'Open a PR that links issue #57' },
        { id: 'checks', text: 'CI passes and a teammate approves' },
        { id: 'merge', text: 'Merge, then delete the branch' },
      ],
      explanation:
        'A pull request is a proposal. The branch holds the work, the PR explains it, CI and a reviewer check it, and only then does it reach main.',
    },
    {
      id: 'draft-pr',
      beat: 'pr-opened',
      kind: 'choose',
      situation:
        'Otto is halfway through PDF export and you want Priya’s opinion on the approach before it goes further.',
      question: 'What’s the best move?',
      options: [
        {
          id: 'wait',
          text: 'Wait until it’s finished, then open the PR.',
          correct: false,
          feedback: 'If the approach is wrong, you find out after all the work is done.',
        },
        {
          id: 'chat',
          text: 'Paste the code into a chat message for Priya.',
          correct: false,
          feedback: 'She loses the diff, the context and the place to leave line comments.',
        },
        {
          id: 'draft',
          text: 'Open a draft PR and ask Priya a specific question about the approach.',
          correct: true,
          feedback: 'Yes. A draft says “not ready to merge” but invites early feedback.',
        },
      ],
      explanation:
        'Draft pull requests can’t be merged by accident, but they show the diff and allow comments. Early feedback on direction is cheaper than late feedback on finished work.',
    },
    {
      id: 'mixed-pr',
      beat: 'review-changes',
      kind: 'choose',
      situation: 'Otto opened the PR. You’re reading its description.',
      artifact: {
        kind: 'pull-request',
        label: 'PR #64 · feat: add PDF export',
        text: [
          'Adds Export to PDF in the File menu.',
          '',
          'While I was there I also:',
          '- upgraded the editor library from v4 to v5',
          '- reformatted 41 files',
          '- renamed utils/ to helpers/',
          '',
          'Closes #57',
          'Files changed: 63   +2,140  -1,870',
        ].join('\n'),
      },
      question: 'What do you ask Otto to do?',
      options: [
        {
          id: 'approve',
          text: 'Approve. More improvements in one go saves time.',
          correct: false,
          feedback: 'Nobody can review 4,000 lines well, and one bad part blocks the rest.',
        },
        {
          id: 'reject',
          text: 'Close it and tell Otto not to touch the code again.',
          correct: false,
          feedback: 'The export work may be fine. The problem is the bundling, not Otto.',
        },
        {
          id: 'more-tests',
          text: 'Ask for more tests, then approve.',
          correct: false,
          feedback: 'Tests help, but a library upgrade still hides inside a feature PR.',
        },
        {
          id: 'split',
          text: 'Keep only the PDF export here, and open the upgrade, reformat and rename as separate PRs.',
          correct: true,
          feedback: 'Yes. One change per PR, so each can be reviewed and reverted alone.',
        },
      ],
      explanation:
        'A pull request should do one thing. Unrelated changes hide risk, make review slow, and mean a revert undoes good work along with bad. Agents love “while I was there”.',
    },
    {
      id: 'brief-the-description',
      beat: 'pr-opened',
      kind: 'prompt',
      situation: 'Otto is about to open the trimmed-down PR.',
      question: 'Which instruction gets a description a reviewer can work with?',
      options: [
        {
          id: 'structured',
          text: 'Write the PR description with what changed, why, step-by-step test instructions, and anything you weren’t sure about. Link the issue with “Closes #57”.',
          correct: true,
          feedback: 'The reviewer gets the purpose, the proof, and where to look hardest.',
        },
        {
          id: 'paste-code',
          text: 'Paste every changed file into the description so it’s all in one place.',
          correct: false,
          feedback: 'The diff already shows the code. The description should explain it.',
        },
        {
          id: 'title',
          text: 'Just give it a good title.',
          correct: false,
          feedback: 'A title can’t say how to test it or what Otto was unsure about.',
        },
        {
          id: 'confident',
          text: 'Write the PR description with what changed, why and step-by-step test instructions, and link it with “Closes #57”. Keep it confident: skip the parts you weren’t sure about.',
          correct: false,
          feedback:
            'Nearly, but the doubts are what the reviewer most needs to see. Hidden doubts become bugs.',
        },
      ],
      explanation:
        'A PR description answers what changed, why, and how to check it. Asking the agent to list what it wasn’t sure about tells the reviewer exactly where to look.',
    },
    {
      id: 'too-big',
      beat: 'review-changes',
      kind: 'prompt',
      situation:
        'Even trimmed, the PDF export PR is 1,800 lines. Priya says she can’t review it properly.',
      question: 'What do you tell Otto?',
      options: [
        {
          id: 'ask-anyway',
          text: 'Ask Priya to review it anyway; it’s all one feature.',
          correct: false,
          feedback: 'A tired reviewer skims, and skimming is how bugs get approved.',
        },
        {
          id: 'stack',
          text: 'Split this into 3-4 PRs under 400 lines each, in an order that merges cleanly. Each must pass the tests on its own. List the plan before you start.',
          correct: true,
          feedback: 'Small, ordered, each green on its own, and you approve the plan first.',
        },
        {
          id: 'by-file-type',
          text: 'Split this into 3-4 PRs under 400 lines each: one for the UI files, one for the export code, one for the tests. Open them all today so Priya can start.',
          correct: false,
          feedback:
            'Split by file type, the code lands without its tests and no PR works on its own. Split into working slices, in order.',
        },
        {
          id: 'squash',
          text: 'Squash it into one commit so it looks smaller.',
          correct: false,
          feedback: 'Squashing changes the history, not the size of the diff.',
        },
      ],
      explanation:
        'Reviews stay careful under about 400 lines. Splitting work into small PRs that each pass alone keeps review fast and main always working.',
    },
    {
      id: 'closes-keyword',
      beat: 'checks-gate',
      kind: 'choose',
      situation: 'Marco asks what “Closes #57” in the PR does.',
      question: 'What do you tell him?',
      options: [
        {
          id: 'now',
          text: 'It links the PR to issue #57 and closes the issue as soon as the PR is opened on GitHub.',
          correct: false,
          feedback: 'Opening a PR doesn’t finish the work. Only merging does.',
        },
        {
          id: 'comment',
          text: 'Nothing. It’s a note for humans.',
          correct: false,
          feedback: 'GitHub reads it. Look at the issue after the merge.',
        },
        {
          id: 'on-merge',
          text: 'It links the PR to issue #57 and closes the issue when the PR merges into main.',
          correct: true,
          feedback: 'Yes. The issue and the PR now point at each other.',
        },
      ],
      explanation:
        'Keywords like Closes, Fixes and Resolves link a PR to an issue. When the PR merges into the default branch, GitHub closes the issue, so the board stays honest.',
    },
  ],
} satisfies LessonInput;
