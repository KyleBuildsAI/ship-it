import { LessonSchema, type Lesson, type LessonInput } from './lessonSchema';
import { ActSchema, type Act, type ActInput } from './schema';

/*
 * Sample lessons for tests, modelled on the Act 4 lessons to come: Kyle directs an agent
 * through a pull request. They are test data, never shipped, and their ids start with
 * "sample-" so they can't collide with real content.
 */

/** A lesson with one card of each kind, plus choose cards to make up the six. */
export const sampleLessonInput = {
  id: 'sample-pr-review',
  act: 4,
  title: 'Review the Agent’s PR (sample)',
  briefing: [
    'Your agent opened a pull request to fix the login timeout.',
    'You decide what merges. Read what it changed, then direct it.',
  ],
  xp: 60,
  cards: [
    {
      id: 'read-the-diff',
      kind: 'choose',
      situation: 'The PR says it fixes the timeout. Here is the whole diff.',
      artifact: {
        kind: 'diff',
        label: 'src/auth/session.ts',
        text: [
          '@@ -12,7 +12,7 @@ export function startSession(user: User) {',
          '-  const ttlSeconds = 15 * 60;',
          '+  const ttlSeconds = 15 * 60 * 1000;',
          '   return store.save(user.id, { ttlSeconds });',
        ].join('\n'),
      },
      question: 'What do you do before approving?',
      options: [
        {
          id: 'approve',
          text: 'Approve. The agent said it fixed the timeout.',
          correct: false,
          feedback: 'Its claim is not proof. Sessions would now last over ten days.',
        },
        {
          id: 'ask-units',
          text: 'Ask why seconds were multiplied by 1000, and for a test that proves the length.',
          correct: true,
          feedback:
            'Yes: the variable is seconds, and multiplying by 1000 treats it as milliseconds.',
        },
        {
          id: 'rewrite',
          text: 'Close the PR and write the fix yourself.',
          correct: false,
          feedback:
            'You could, but directing a correction is faster and teaches the agent the rule.',
        },
      ],
      explanation:
        'Review the change, not the description. The name says seconds, so times 1000 makes a 15 minute session last 10 days.',
    },
    {
      id: 'brief-the-fix',
      kind: 'prompt',
      situation: 'The agent agrees the units are wrong and asks how you want it fixed.',
      question: 'Which instruction gets the best result?',
      options: [
        {
          id: 'vague',
          text: 'Fix it properly this time.',
          correct: false,
          feedback: 'It doesn’t say what "properly" means, so you may get the same mistake again.',
        },
        {
          id: 'specific',
          text: 'Keep ttlSeconds at 15 * 60. Add a test that a session expires after 15 minutes, not before. Run the tests and paste the output.',
          correct: true,
          feedback: 'It names the value, the proof, and the evidence you want back.',
        },
        {
          id: 'everything',
          text: 'Refactor the whole auth module so this can never happen again.',
          correct: false,
          feedback: 'A big rewrite hides the one-line fix inside a diff nobody can review.',
        },
      ],
      explanation:
        'A good instruction says what done looks like and how to prove it. Ask for a test and its output, not just a promise.',
    },
    {
      id: 'merge-steps',
      kind: 'order',
      situation: 'The fix is pushed and CI is running.',
      question: 'Put the rest of the PR’s life in order.',
      steps: [
        { id: 'ci-green', text: 'CI finishes green' },
        { id: 'review', text: 'You read the new diff and the test' },
        { id: 'approve', text: 'You approve the PR' },
        { id: 'merge', text: 'Squash and merge into main' },
      ],
      explanation:
        'Checks first, then a human review of what actually changed, then approval, then the merge. Main only gets reviewed, passing work.',
    },
    {
      id: 'red-ci',
      kind: 'choose',
      situation: 'CI fails on the new test.',
      artifact: {
        kind: 'log',
        label: 'CI · unit tests',
        text: [
          'FAIL src/auth/session.test.ts',
          '  ✕ a session expires after 15 minutes',
          '    Expected: 900',
          '    Received: 900000',
        ].join('\n'),
      },
      question: 'What does the log tell you?',
      options: [
        {
          id: 'flaky',
          text: 'CI is flaky. Re-run it until it passes.',
          correct: false,
          feedback: 'A flaky test fails at random. This one shows the exact wrong number.',
        },
        {
          id: 'still-wrong',
          text: 'The code still multiplies by 1000.',
          correct: true,
          feedback: 'Right: 900000 is 900 times 1000. The test caught the bug it was written for.',
        },
        {
          id: 'bad-test',
          text: 'The test is wrong. Delete it.',
          correct: false,
          feedback:
            'The test expects 15 minutes, which is the requirement. Deleting it hides the bug.',
        },
      ],
      explanation:
        'Expected and Received tell the story: the value is a thousand times too big. Tests are guardrails; listen to them.',
    },
    {
      id: 'scope-creep',
      kind: 'choose',
      situation: 'The agent’s next commit also renames twelve files in another folder.',
      question: 'What do you ask for?',
      options: [
        {
          id: 'split',
          text: 'Move the renames to their own PR.',
          correct: true,
          feedback: 'One PR, one purpose: small diffs get reviewed properly.',
        },
        {
          id: 'allow',
          text: 'Leave them. More cleanup is good.',
          correct: false,
          feedback: 'Unrelated changes make the review longer and the fix harder to find.',
        },
        {
          id: 'ignore',
          text: 'Approve, and skip reading the renamed files.',
          correct: false,
          feedback: 'Anything you approve without reading is something you can’t vouch for.',
        },
      ],
      explanation:
        'Keep a PR to one change. Mixed PRs are slow to review, and a revert would undo both.',
    },
    {
      id: 'secret',
      kind: 'choose',
      situation: 'The agent added a file to the PR.',
      artifact: {
        kind: 'file',
        label: '.env',
        text: 'SESSION_SECRET=sk_live_51Hx9',
      },
      question: 'What is the problem?',
      options: [
        {
          id: 'none',
          text: 'Nothing. The app needs that value.',
          correct: false,
          feedback: 'It needs it on the machine, not in the repo where everyone can read it.',
        },
        {
          id: 'leak',
          text: 'A secret is being committed. Remove it, rotate it, and gitignore .env.',
          correct: true,
          feedback: 'Yes. Once pushed, assume it is leaked: removing it is not enough.',
        },
        {
          id: 'format',
          text: 'The value should be in quotes.',
          correct: false,
          feedback: 'Quotes don’t matter here. Where the file lives does.',
        },
      ],
      explanation:
        'Secrets never go in git. .env stays on your machine, its names go in .env.example, and a leaked key is replaced.',
    },
  ],
} satisfies LessonInput;

export const sampleLesson: Lesson = LessonSchema.parse(sampleLessonInput);

/** The same cards as a timed final: two minutes for all six. */
export const sampleFinalInput = {
  ...sampleLessonInput,
  id: 'sample-final',
  title: 'Rejected Push (sample final)',
  kind: 'final',
  timeLimitSeconds: 120,
  xp: 150,
} satisfies LessonInput;

export const sampleFinal: Lesson = LessonSchema.parse(sampleFinalInput);

/** An early-access Act made of lessons only, ending in its final. */
export const lessonActInput = {
  act: 4,
  title: 'GitHub Team Flow (sample)',
  earlyAccess: true,
  missionIds: [sampleLesson.id, sampleFinal.id],
} satisfies ActInput;

export function sampleLessonAct(): { act: Act; missions: []; lessons: Lesson[] } {
  return {
    act: ActSchema.parse(lessonActInput),
    missions: [],
    lessons: [sampleLesson, sampleFinal],
  };
}
