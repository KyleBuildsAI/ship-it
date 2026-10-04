import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * Act 3's final, "Conflict Storm" (DESIGN.md section 11): release day, three branches
 * colliding, and one clock for every card. It mixes the whole Act, so it comes last.
 */
export const conflictStorm = {
  id: 'conflict-storm',
  act: 3,
  title: 'Conflict Storm',
  kind: 'final',
  timeLimitSeconds: 360,
  xp: 150,
  briefing: [
    'Release day for Quillwork 2.5. Three branches must land on main before Dex deploys at 5pm, and they collide.',
    'Six minutes on one clock for every card. A wrong first answer costs stars, not time.',
  ],
  cards: [
    {
      id: 'storm-fast-forward',
      kind: 'choose',
      situation:
        'feat/templates is three commits ahead of main, and main hasn’t moved since it branched.',
      question: 'What will merging it into main do?',
      options: [
        {
          id: 'merge-commit',
          text: 'Make a merge commit with two parents.',
          correct: false,
          feedback: 'Only when both sides have new work. Main has none.',
        },
        {
          id: 'conflict',
          text: 'Stop with a conflict.',
          correct: false,
          feedback: 'A conflict needs edits on both sides. Only one side moved.',
        },
        {
          id: 'ff',
          text: 'Fast-forward: main’s label slides to the branch tip.',
          correct: true,
          feedback: 'Yes. No new commit, a straight line.',
        },
      ],
      explanation:
        'If main hasn’t moved, its history already leads to the branch tip, so the merge just moves the label. One down, two to go.',
    },
    {
      id: 'storm-resolve',
      kind: 'choose',
      situation:
        'Merging feat/collab stops. Main kept the 10-document limit; feat/collab added a collaborator limit the feature needs.',
      artifact: {
        kind: 'file',
        label: 'src/billing/plans.ts',
        text: [
          'export const PLAN_LIMITS = {',
          '<<<<<<< HEAD',
          '  free: { docs: 10 },',
          '=======',
          '  free: { docs: 10, collaborators: 2 },',
          '>>>>>>> feat/collab',
          '};',
        ].join('\n'),
      },
      question: 'What’s the right resolution?',
      options: [
        {
          id: 'combined',
          text: 'free: { docs: 10, collaborators: 2 }, with the markers removed and the tests run.',
          correct: true,
          feedback: 'Yes. It keeps main’s limit and the new one.',
        },
        {
          id: 'head',
          text: 'Keep HEAD’s line. Main wins on release day.',
          correct: false,
          feedback: 'That drops the collaborator limit the feature depends on.',
        },
        {
          id: 'leave',
          text: 'Leave the markers in and fix it after the release.',
          correct: false,
          feedback: 'Markers break the build. Dex would ship nothing at all.',
        },
      ],
      explanation:
        'Read what each side wanted. Here the incoming side already includes main’s value, so it serves both. Remove every marker and prove it with tests.',
    },
    {
      id: 'storm-otto-conflicts',
      kind: 'prompt',
      situation: 'It’s 4:40pm. Otto hit 9 conflicts merging main into feat/live-cursors.',
      question: 'Which instruction do you give Otto?',
      options: [
        {
          id: 'theirs',
          text: 'Take your side everywhere. We’re out of time.',
          correct: false,
          feedback: 'That silently drops teammates’ changes on the riskiest day of the month.',
        },
        {
          id: 'reasoned',
          text: 'Resolve the clear ones. For the rest, show me both sides and your reasoning. Run the tests, and don’t push until I’ve looked.',
          correct: true,
          feedback: 'Fast where it’s safe, and you keep the judgment calls.',
        },
        {
          id: 'skip-tests',
          text: 'Resolve them all and skip the tests this once.',
          correct: false,
          feedback: 'Release day is exactly when an untested merge hurts most.',
        },
      ],
      explanation:
        'Time pressure is when agents need the tightest brief. Let Otto do the obvious work, keep intent decisions for yourself, and never skip the proof.',
    },
    {
      id: 'storm-shared-rebase',
      kind: 'choose',
      situation:
        'Marco rebased the shared release/2.5 branch and force-pushed. Now Priya’s and Otto’s pulls fail.',
      question: 'Which rule was broken?',
      options: [
        {
          id: 'no-pull',
          text: 'Never pull on release day.',
          correct: false,
          feedback: 'Pulling is normal. Rewriting shared history is the problem.',
        },
        {
          id: 'never-rebase',
          text: 'Never use rebase.',
          correct: false,
          feedback: 'Rebase is fine on your own branch. It only hurts on shared ones.',
        },
        {
          id: 'announce',
          text: 'Announce force-pushes in chat first.',
          correct: false,
          feedback: 'An announcement doesn’t fix everyone’s diverged copies.',
        },
        {
          id: 'shared-history',
          text: 'Don’t rewrite history that others have already pulled.',
          correct: true,
          feedback: 'Right. Rebasing changed every commit id under them.',
        },
      ],
      explanation:
        'Rebased commits are new commits with new ids, so anyone holding the old ones has a diverged copy. Rebase private branches; merge shared ones.',
    },
    {
      id: 'storm-cherry-pick',
      kind: 'prompt',
      situation: 'The fix for blank PDF pages sits on feat/pdf-v2, which isn’t shipping today.',
      artifact: {
        kind: 'log',
        label: 'git log --oneline feat/pdf-v2',
        text: [
          'd9e4f02 (feat/pdf-v2) new PDF layout engine',
          '41b7a6c fix blank pages in PDF export',
          '88c2e1d (main) merge feat/collab',
        ].join('\n'),
      },
      question: 'Which instruction do you give Otto?',
      options: [
        {
          id: 'merge',
          text: 'Merge feat/pdf-v2 so the fix ships.',
          correct: false,
          feedback: 'That ships the unfinished layout engine too.',
        },
        {
          id: 'wrong-commit',
          text: 'Cherry-pick d9e4f02 onto main.',
          correct: false,
          feedback: 'That’s the layout engine, not the fix. Read the log.',
        },
        {
          id: 'pick-fix',
          text: 'Branch fix/blank-pdf from main, cherry-pick 41b7a6c only, run the tests, and open a PR.',
          correct: true,
          feedback: 'The exact commit, on its own branch, with proof and a review.',
        },
        {
          id: 'retype',
          text: 'Rewrite the fix from memory, straight on main.',
          correct: false,
          feedback: 'Slower, riskier, and it skips review. The exact change already exists.',
        },
      ],
      explanation:
        'Cherry-pick carries one commit across. Give the agent its exact id and make the fix travel through a PR like any other change.',
    },
    {
      id: 'storm-bisect',
      kind: 'choose',
      situation:
        'Priya: “Autosave broke somewhere in the last 64 commits.” A test catches the bug. You start git bisect.',
      question: 'About how many test runs will bisect need?',
      options: [
        {
          id: 'six',
          text: 'About 6.',
          correct: true,
          feedback: 'Yes: 64, 32, 16, 8, 4, 2, 1. Each run halves the suspects.',
        },
        {
          id: 'thirty-two',
          text: 'About 32, half of them.',
          correct: false,
          feedback: 'Bisect halves the range every run, not just once.',
        },
        {
          id: 'sixty-four',
          text: '64, one per commit.',
          correct: false,
          feedback: 'That’s checking one by one. Bisect is a binary search.',
        },
      ],
      explanation:
        'Bisect halves the suspects with every test, so the runs grow very slowly: 64 commits take about 6, and 1,000 take about 10.',
    },
    {
      id: 'storm-ship',
      kind: 'order',
      situation: 'Every branch is merged and CI is green. Time to ship 2.5.',
      question: 'Put the release steps in order.',
      steps: [
        { id: 'pull', text: 'Pull the merged main' },
        { id: 'test', text: 'Run the full test suite' },
        { id: 'tag', text: 'Tag the release commit v2.5.0' },
        { id: 'push', text: 'Push the tag (git push origin v2.5.0)' },
        { id: 'deploy', text: 'Let Dex deploy the tagged commit' },
      ],
      explanation:
        'Main already holds every merged PR, so only the tag is new. Git doesn’t push tags on its own, so push it on purpose, then deploy exactly that commit.',
    },
    {
      id: 'storm-hotfix',
      kind: 'prompt',
      situation:
        '5:05pm. A customer bug in 2.5 arrives while Otto is halfway through a 2.6 feature.',
      question: 'Which instruction do you give Otto?',
      options: [
        {
          id: 'bundle',
          text: 'Fix it on your 2.6 branch and ship it with the feature.',
          correct: false,
          feedback: 'The fix waits for an unfinished feature, and ships with it.',
        },
        {
          id: 'stash-hotfix',
          text: 'Stash your 2.6 work with a message. Branch hotfix/2.5.1 from the v2.5.0 tag, fix and test it, and open a PR. Then switch back to your 2.6 branch and pop the stash.',
          correct: true,
          feedback: 'The fix ships alone, and the feature work waits safely on the shelf.',
        },
        {
          id: 'discard',
          text: 'Discard your 2.6 work so you can focus.',
          correct: false,
          feedback: 'Throwing away work is never the price of a hotfix.',
        },
      ],
      explanation:
        'Shelve, branch from the tag that shipped, fix, prove, review, then switch back and pick your work up. The storm passes, and nothing was lost.',
    },
  ],
} satisfies LessonInput;
