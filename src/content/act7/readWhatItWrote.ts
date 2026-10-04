import type { LessonInput } from '../../game/missions/lessonSchema';

/*
 * 7.2 Read What It Wrote. Otto's diffs look tidy and his descriptions sound sure. These
 * cards train the habit that matters most: read what the code does, not what it claims.
 */
export const readWhatItWrote = {
  id: 'read-what-it-wrote',
  act: 7,
  title: 'Read What It Wrote',
  xp: 70,
  briefing: [
    'Otto opens a PR. It compiles, the description sounds sure, and the code looks tidy.',
    'Your job is to read what the code actually does. Bugs in AI code are rarely loud; they’re small and confident.',
  ],
  cards: [
    {
      id: 'swallowed-error',
      kind: 'choose',
      situation: 'Otto’s PR description: “made getUser more robust.”',
      artifact: {
        kind: 'diff',
        label: 'PR #188 · src/users.ts',
        text: [
          ' export async function getUser(id: string) {',
          '-  const user = await db.users.find(id);',
          '-  if (!user) throw new NotFound();',
          '-  return user;',
          '+  try {',
          '+    return await db.users.find(id);',
          '+  } catch {',
          '+    return null;',
          '+  }',
          ' }',
        ].join('\n'),
      },
      question: 'What’s the real effect?',
      options: [
        {
          id: 'safer',
          text: 'It’s safer: no more crashes.',
          correct: false,
          feedback: 'Crashes became wrong answers, which are much harder to find.',
        },
        {
          id: 'same',
          text: 'It behaves the same as before.',
          correct: false,
          feedback: 'A missing user is no longer a NotFound error; it quietly comes back empty.',
        },
        {
          id: 'swallow',
          text: 'Errors are swallowed: a database outage now looks like “no such user”, and NotFound is gone.',
          correct: true,
          feedback: 'Right. “Robust” here means failing silently.',
        },
      ],
      explanation:
        'Read an AI diff for what changes in behaviour, not for what the description says. A catch that returns null hides failures. Ask: what happens now when the database is down?',
    },
    {
      id: 'auth-check',
      kind: 'choose',
      situation: 'Otto “simplified” the check for who can edit a document.',
      artifact: {
        kind: 'diff',
        label: 'PR #191 · src/docs/permissions.ts',
        text: [
          ' export function canEdit(user: User, doc: Doc) {',
          "-  return user.role === 'admin' || user.id === doc.ownerId;",
          "+  return user.role === 'admin' || Boolean(doc.ownerId);",
          ' }',
        ].join('\n'),
      },
      question: 'Who can edit a document now?',
      options: [
        {
          id: 'anyone',
          text: 'Any signed-in user can edit any document that has an owner, so nearly all of them.',
          correct: true,
          feedback: 'Yes. One changed comparison opened every document to everyone.',
        },
        {
          id: 'owner',
          text: 'Admins and the owner, same as before.',
          correct: false,
          feedback: 'Read it again: it no longer compares user.id to anything.',
        },
        {
          id: 'admins',
          text: 'Only admins.',
          correct: false,
          feedback: 'Boolean(doc.ownerId) is true for almost every document.',
        },
        {
          id: 'style',
          text: 'Nobody different. It’s a style cleanup.',
          correct: false,
          feedback: 'Two lines that look alike can mean very different things.',
        },
      ],
      explanation:
        'Changes to who can do what deserve a slow, line-by-line read. Agents “simplify” logic and lose a condition on the way. Say aloud what each line allows.',
    },
    {
      id: 'scope-drift',
      kind: 'choose',
      situation: 'You asked Otto to fix a typo on the pricing page.',
      artifact: {
        kind: 'pull-request',
        label: 'PR #193 · fix pricing typo',
        text: [
          'Files changed: 31',
          '  src/pages/pricing.tsx          +1 -1',
          '  src/api/billing.ts             +44 -12',
          '  src/lib/format.ts              +80 -31',
          '  package.json                   +2 -1',
          '  ...27 more files',
        ].join('\n'),
      },
      question: 'What do you do?',
      options: [
        {
          id: 'merge',
          text: 'Merge it. Extra cleanup is free.',
          correct: false,
          feedback: 'It isn’t free: 30 files of changes nobody asked for, and nobody reviewed.',
        },
        {
          id: 'split',
          text: 'Ask Otto why, and have him split the typo fix from everything else.',
          correct: true,
          feedback: 'One PR, one purpose. The rest can be proposed and reviewed on its own.',
        },
        {
          id: 'check-one',
          text: 'Check the pricing file and approve.',
          correct: false,
          feedback: 'Then billing changes reach main unread.',
        },
      ],
      explanation:
        'Agents drift past the task. Check that the diff matches the request. Anything extra is a separate change that needs its own reason and its own review.',
    },
    {
      id: 'ask-for-evidence',
      kind: 'prompt',
      situation: 'Otto: “Done! Everything works and all tests pass ✅”',
      question: 'Which reply gets you proof?',
      options: [
        {
          id: 'thanks',
          text: 'Great, thanks Otto!',
          correct: false,
          feedback: '“Works” is a claim. Nothing was proved.',
        },
        {
          id: 'sure',
          text: 'Are you sure?',
          correct: false,
          feedback: 'He’ll say yes. Ask for output, not confidence.',
        },
        {
          id: 'proof',
          text: 'Paste the full output of npm test and npm run build, and a screenshot of the export downloading on /billing.',
          correct: true,
          feedback: 'A claim becomes evidence you can check.',
        },
      ],
      explanation:
        'An agent’s confidence is not evidence. Ask for the real output: test runs, build logs, screenshots, responses. Then read it; agents sometimes report a pass that the log doesn’t show.',
    },
    {
      id: 'invented-api',
      kind: 'choose',
      situation: 'Otto says the export uses Stripe’s built-in CSV feature. You run the type check.',
      artifact: {
        kind: 'terminal',
        label: 'npm run typecheck',
        text: [
          'src/billing/export.ts:14:32 - error TS2339:',
          "  Property 'exportCsv' does not exist on type 'InvoicesResource'.",
          '',
          '14   const file = await stripe.invoices.exportCsv({ customer });',
          '',
          'Found 1 error.',
        ].join('\n'),
      },
      question: 'What happened?',
      options: [
        {
          id: 'outdated',
          text: 'Our Stripe library is out of date. Upgrade it.',
          correct: false,
          feedback: 'Maybe, but check first. Upgrading on a hunch is how you get two problems.',
        },
        {
          id: 'types-wrong',
          text: 'TypeScript is wrong. Add // @ts-ignore.',
          correct: false,
          feedback: 'That hides the error until it crashes in production.',
        },
        {
          id: 'retry',
          text: 'A glitch. Run it again.',
          correct: false,
          feedback: 'A type check gives the same answer every time.',
        },
        {
          id: 'invented',
          text: 'Otto likely invented a function that sounds right but doesn’t exist. Check Stripe’s real docs.',
          correct: true,
          feedback: 'Yes. Agents can make up plausible APIs. The type checker caught this one.',
        },
      ],
      explanation:
        'Agents sometimes call functions that don’t exist, because they sound like they should. Type checks, tests and the real docs are how you catch it. Never silence the checker.',
    },
    {
      id: 'new-dependency',
      kind: 'choose',
      situation: 'Otto’s PR to format phone numbers adds a package.',
      artifact: {
        kind: 'diff',
        label: 'package.json',
        text: [
          '   "dependencies": {',
          '     "date-fns": "^4.1.0",',
          '+    "phone-fmt-ultra": "^0.3.1",',
          '     "zod": "^4.1.5"',
        ].join('\n'),
      },
      question: 'What’s the right move?',
      options: [
        {
          id: 'fine',
          text: 'Fine. Packages save time.',
          correct: false,
          feedback: 'A 0.x package from nobody is code you now trust with your users’ data.',
        },
        {
          id: 'pin',
          text: 'Pin it to exactly 0.3.1 and merge.',
          correct: false,
          feedback: 'Pinning stops surprise updates. It doesn’t answer whether you need it at all.',
        },
        {
          id: 'ask',
          text: 'Ask why it’s needed, whether it’s maintained, and whether a tool you already use does this.',
          correct: true,
          feedback: 'Every dependency is code you run but didn’t write. Make it earn its place.',
        },
      ],
      explanation:
        'A new dependency is a long-term decision hidden in one line. Check that it’s needed, alive and trusted. Agents add packages freely, and some suggested names don’t even exist.',
    },
    {
      id: 'review-order',
      kind: 'order',
      situation: 'Priya asks how you review one of Otto’s PRs.',
      question: 'Put your review in order.',
      steps: [
        { id: 'issue', text: 'Read the linked issue: what was asked' },
        { id: 'scope', text: 'Check the files changed match the request' },
        { id: 'risky', text: 'Read risky lines slowly: auth, money, data' },
        { id: 'decide', text: 'Check tests cover it, then approve or request specific changes' },
      ],
      explanation:
        'Start from what was asked, so you can see drift. Spend your attention where mistakes hurt most. Then check the tests guard it before you decide.',
    },
    {
      id: 'review-comment',
      kind: 'prompt',
      situation: 'You found the canEdit bug in PR #191. You leave a review for Otto.',
      question: 'Which comment gets it fixed right?',
      options: [
        {
          id: 'vague',
          text: 'This is wrong. Please fix.',
          correct: false,
          feedback: 'Which part, and what does right look like? Otto will guess again.',
        },
        {
          id: 'specific',
          text: 'Line 2 lets any user edit any owned doc. Restore user.id === doc.ownerId. Add tests: owner can edit, admin can edit, another user can’t.',
          correct: true,
          feedback: 'Where, what breaks, what right is, and how to prove it.',
        },
        {
          id: 'spread',
          text: 'Line 2 reads much better now. Apply the same Boolean(doc.ownerId) simplification to canDelete and canShare in this file, and add a test for each.',
          correct: false,
          feedback: 'Specific, and wrong: it copies the bug into two more permission checks.',
        },
      ],
      explanation:
        'Review an agent like a teammate: point at the line, say what goes wrong, say what correct looks like, and ask for the test that proves it.',
    },
  ],
} satisfies LessonInput;
